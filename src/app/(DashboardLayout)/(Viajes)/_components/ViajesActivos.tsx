'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDatabase, ref, onValue, remove } from 'firebase/database';
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/utils/functions';
import {
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Chip,
    Button,
    TablePagination,
    TextField,
    InputAdornment,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    CircularProgress,
    Alert,
    Skeleton,
} from '@mui/material';
import { IconSearch, IconX } from '@tabler/icons-react';
import DashboardCard from '@/app/(DashboardLayout)//components/shared/DashboardCard';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveRide {
    id: string;
    driverId?: string;
    passengerId?: string;
    userId?: string;
    driverName?: string;
    passengerName?: string;
    paymentMethod?: string;
    farePriceCents?: number;
    originalPrice?: number;
    serviceType?: string;
    status?: string;
    createdAt?: number | string | object;
    updatedAt?: number | string | object;
    origin?: { address?: string };
    destination?: { address?: string };
    address?: string;
}

export interface ActiveRideEnriched extends ActiveRide {
    driverEmail?: string;
    passengerEmail?: string;
    displayDriverName?: string;
    displayPassengerName?: string;
    priceDisplay: string;
    startedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimestamp(raw: any): number {
    if (!raw) return Date.now();
    if (typeof raw === 'number') return raw;
    if (raw.toDate && typeof raw.toDate === 'function') return raw.toDate().getTime();
    if (raw.seconds !== undefined) return raw.seconds * 1000;
    if (typeof raw === 'string') return new Date(raw).getTime();
    return Date.now();
}

function formatPrice(ride: ActiveRide): string {
    const cents =
        ride.farePriceCents !== undefined
            ? Number(ride.farePriceCents)
            : ride.originalPrice !== undefined
            ? Math.round(Number(ride.originalPrice) * 100)
            : 0;
    return `$${(cents / 100).toFixed(2)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ViajesActivos = () => {
    const [rawRides, setRawRides] = useState<ActiveRide[]>([]);
    const [enrichedRides, setEnrichedRides] = useState<ActiveRideEnriched[]>([]);
    const [loadingRTDB, setLoadingRTDB] = useState(true);
    const [loadingEnrich, setLoadingEnrich] = useState(false);
    const [searchEmail, setSearchEmail] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Cancel dialog state
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [selectedRide, setSelectedRide] = useState<ActiveRideEnriched | null>(null);
    const [cancelling, setCancelling] = useState(false);

    // ── 1. Subscribe to rideRequests in RTDB ─────────────────────────────────
    useEffect(() => {
        const db = getDatabase(firebaseApp);
        const ridesRef = ref(db, 'rideRequests');

        const unsubscribe = onValue(
            ridesRef,
            (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const rides: ActiveRide[] = Object.entries(data).map(([id, val]) => ({
                        id,
                        ...(val as object),
                    }));
                    setRawRides(rides);
                } else {
                    setRawRides([]);
                }
                setLoadingRTDB(false);
            },
            (error) => {
                console.error('Error fetching rideRequests from RTDB:', error);
                setLoadingRTDB(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // ── 2. Enrich rides with user/driver emails from Firestore ────────────────
    useEffect(() => {
        if (loadingRTDB || rawRides.length === 0) {
            setEnrichedRides([]);
            return;
        }

        const enrich = async () => {
            setLoadingEnrich(true);
            try {
                const firestoreDb = getFirestore(firebaseApp);

                // Fetch all users and drivers once, build lookup maps
                const [usersSnap, driversSnap] = await Promise.all([
                    getDocs(collection(firestoreDb, 'users')),
                    getDocs(collection(firestoreDb, 'drivers')),
                ]);

                const usersMap: Record<string, any> = {};
                usersSnap.forEach((d) => { usersMap[d.id] = d.data(); });

                const driversMap: Record<string, any> = {};
                driversSnap.forEach((d) => { driversMap[d.id] = d.data(); });

                // Build userId → user email map from drivers collection
                // drivers documents have a 'userId' field pointing to the users collection
                const driverUserIdToEmail: Record<string, string> = {};
                driversSnap.forEach((d) => {
                    const driverData = d.data();
                    const userId = driverData.userId;
                    if (userId && usersMap[userId]?.email) {
                        driverUserIdToEmail[d.id] = usersMap[userId].email;
                    }
                });

                const enriched: ActiveRideEnriched[] = rawRides.map((ride) => {
                    // Passenger
                    const passengerId = ride.passengerId || ride.userId || '';
                    const passengerUser = usersMap[passengerId];
                    const passengerEmail = passengerUser?.email || '';
                    const displayPassengerName =
                        ride.passengerName ||
                        (passengerUser
                            ? `${passengerUser.firstName || ''} ${passengerUser.lastName || ''}`.trim()
                            : 'Pasajero desconocido');

                    // Driver
                    const driverId = ride.driverId || '';
                    const driverEmail = driverUserIdToEmail[driverId] || '';
                    const driverUserId = driversMap[driverId]?.userId || '';
                    const driverUser = usersMap[driverUserId];
                    const displayDriverName =
                        ride.driverName ||
                        (driverUser
                            ? `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim()
                            : 'Conductor desconocido');

                    return {
                        ...ride,
                        driverEmail,
                        passengerEmail,
                        displayDriverName,
                        displayPassengerName,
                        priceDisplay: formatPrice(ride),
                        startedAt: parseTimestamp(ride.createdAt || ride.updatedAt),
                    };
                });

                // Sort by startedAt descending (most recent first)
                enriched.sort((a, b) => b.startedAt - a.startedAt);
                setEnrichedRides(enriched);
            } catch (err) {
                console.error('Error enriching rides:', err);
            } finally {
                setLoadingEnrich(false);
            }
        };

        enrich();
    }, [rawRides, loadingRTDB]);

    // ── 3. Filter by email ────────────────────────────────────────────────────
    const filteredRides = useMemo(() => {
        if (!searchEmail.trim()) return enrichedRides;
        const q = searchEmail.trim().toLowerCase();
        return enrichedRides.filter(
            (r) =>
                r.driverEmail?.toLowerCase().includes(q) ||
                r.passengerEmail?.toLowerCase().includes(q)
        );
    }, [enrichedRides, searchEmail]);

    const visibleRows = useMemo(
        () => filteredRides.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
        [filteredRides, page, rowsPerPage]
    );

    // ── 4. Pagination handlers ────────────────────────────────────────────────
    const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
    const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(e.target.value, 10));
        setPage(0);
    };

    // ── 5. Cancel trip ────────────────────────────────────────────────────────
    const handleCancelClick = useCallback((ride: ActiveRideEnriched) => {
        setSelectedRide(ride);
        setConfirmOpen(true);
    }, []);

    const handleConfirmCancel = async () => {
        if (!selectedRide) return;
        setCancelling(true);
        try {
            const firestoreDb = getFirestore(firebaseApp);
            const rtdb = getDatabase(firebaseApp);

            // 1. Notify the driver if driverId is present
            if (selectedRide.driverId) {
                try {
                    const notifyDriver = httpsCallable(functions, 'notifyDriverRideCancelled');
                    await notifyDriver({
                        rideId: selectedRide.id,
                        clientId: selectedRide.passengerId || selectedRide.userId || '',
                        driverId: selectedRide.driverId,
                        clientName: selectedRide.displayPassengerName || 'Pasajero',
                        reason: 'Cancelado por el administrador desde el panel de control',
                        canceledAt: new Date().toISOString()
                    });
                } catch (notifyErr) {
                    console.warn('Driver push notification failed or was ignored:', notifyErr);
                }
            }

            // 2. Prepare Firestore historyTrips document
            const historyTripData: any = {
                rideId: selectedRide.id,
                status: 'cancelled',
                paymentMethod: selectedRide.paymentMethod || 'cash',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                completedAt: Date.now(),
            };

            // Copy passenger details
            const passengerId = selectedRide.passengerId || selectedRide.userId;
            if (passengerId) {
                historyTripData.passengerId = passengerId;
                historyTripData.userId = passengerId;
            }
            if (selectedRide.displayPassengerName) {
                historyTripData.passengerName = selectedRide.displayPassengerName;
            }
            // Copy driver details
            if (selectedRide.driverId) {
                historyTripData.driverId = selectedRide.driverId;
            }
            if (selectedRide.displayDriverName) {
                historyTripData.driverName = selectedRide.displayDriverName;
            }

            // Copy pricing details
            if (selectedRide.originalPrice !== undefined) {
                historyTripData.originalPrice = Number(selectedRide.originalPrice);
            } else if (selectedRide.farePriceCents !== undefined) {
                historyTripData.originalPrice = Number(selectedRide.farePriceCents) / 100;
            }
            if (selectedRide.farePriceCents !== undefined) {
                historyTripData.farePriceCents = Number(selectedRide.farePriceCents);
            } else if (selectedRide.originalPrice !== undefined) {
                historyTripData.farePriceCents = Math.round(Number(selectedRide.originalPrice) * 100);
            }

            // Copy other route details
            if (selectedRide.origin) {
                historyTripData.origin = selectedRide.origin;
            }
            if (selectedRide.destination) {
                historyTripData.destination = selectedRide.destination;
            }
            if (selectedRide.address) {
                historyTripData.address = selectedRide.address;
            }
            if (selectedRide.serviceType) {
                historyTripData.serviceType = selectedRide.serviceType;
            }

            // Write to Firestore historyTrips
            const historyTripRef = doc(firestoreDb, 'historyTrips', selectedRide.id);
            await setDoc(historyTripRef, historyTripData, { merge: true });

            // 3. Remove from Realtime Database
            const rideRequestRef = ref(rtdb, `rideRequests/${selectedRide.id}`);
            await remove(rideRequestRef);

            toast.success(`Viaje ${selectedRide.id} cancelado correctamente.`);
            setConfirmOpen(false);
            setSelectedRide(null);
        } catch (err: any) {
            console.error('Error cancelling ride:', err);
            toast.error(err?.message || 'Error al cancelar el viaje. Intenta de nuevo.');
        } finally {
            setCancelling(false);
        }
    };

    const handleCloseDialog = () => {
        if (cancelling) return;
        setConfirmOpen(false);
        setSelectedRide(null);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const isLoading = loadingRTDB || loadingEnrich;

    return (
        <>
            <DashboardCard title="Viajes Activos">
                {/* Search bar */}
                <Box sx={{ mb: 2, mt: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Buscar por email del conductor o pasajero..."
                        value={searchEmail}
                        onChange={(e) => {
                            setSearchEmail(e.target.value);
                            setPage(0);
                        }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <IconSearch size="1rem" />
                                    </InputAdornment>
                                ),
                                endAdornment: searchEmail ? (
                                    <InputAdornment position="end">
                                        <IconX
                                            size="1rem"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSearchEmail('')}
                                        />
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                        sx={{ width: { xs: '100%', sm: '380px' } }}
                    />
                </Box>

                {/* Table */}
                <Box sx={{ overflow: 'auto', width: { xs: '280px', sm: 'auto' } }}>
                    <Table aria-label="viajes activos" sx={{ whiteSpace: 'nowrap', mt: 1 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>ID del Viaje</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>Conductor</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>Pasajero</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>Método de Pago</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>Precio</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>Inicio</Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Typography variant="subtitle2" fontWeight={600}>Acción</Typography>
                                </TableCell>
                            </TableRow>
                        </TableHead>

                        <TableBody>
                            {isLoading ? (
                                // Skeleton rows while loading
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 7 }).map((__, j) => (
                                            <TableCell key={j}>
                                                <Skeleton variant="text" width="80%" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : filteredRides.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <Typography color="textSecondary" variant="body2">
                                            {searchEmail
                                                ? 'No se encontraron viajes con ese email.'
                                                : 'No hay viajes activos en este momento.'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                visibleRows.map((ride) => (
                                    <TableRow key={ride.id} hover>
                                        <TableCell>
                                            <Typography variant="subtitle2" fontWeight={400} sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {ride.id}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2" fontWeight={500}>
                                                {ride.displayDriverName}
                                            </Typography>
                                            {ride.driverEmail && (
                                                <Typography variant="caption" color="textSecondary">
                                                    {ride.driverEmail}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2" fontWeight={500}>
                                                {ride.displayPassengerName}
                                            </Typography>
                                            {ride.passengerEmail && (
                                                <Typography variant="caption" color="textSecondary">
                                                    {ride.passengerEmail}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {ride.paymentMethod ? (
                                                <Chip
                                                    label={
                                                        ride.paymentMethod.toLowerCase() === 'cash'
                                                            ? 'EFECTIVO'
                                                            : 'TARJETA'
                                                    }
                                                    color={
                                                        ride.paymentMethod.toLowerCase() === 'cash'
                                                            ? 'success'
                                                            : 'primary'
                                                    }
                                                    size="small"
                                                    sx={{ fontWeight: 600, borderRadius: '6px' }}
                                                />
                                            ) : (
                                                <Chip
                                                    label="N/A"
                                                    variant="outlined"
                                                    size="small"
                                                    sx={{ color: 'text.secondary', borderColor: 'divider' }}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2" fontWeight={600}>
                                                {ride.priceDisplay}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2">
                                                {new Date(ride.startedAt).toLocaleString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Button
                                                variant="contained"
                                                color="error"
                                                size="small"
                                                onClick={() => handleCancelClick(ride)}
                                                sx={{
                                                    borderRadius: '8px',
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    fontSize: '0.75rem',
                                                    px: 2,
                                                }}
                                            >
                                                Cancelar Viaje
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Box>

                {!isLoading && filteredRides.length > 0 && (
                    <TablePagination
                        rowsPerPageOptions={[5, 10, 25]}
                        component="div"
                        count={filteredRides.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handleChangePage}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        labelRowsPerPage="Filas por página:"
                    />
                )}
            </DashboardCard>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmOpen}
                onClose={handleCloseDialog}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: '12px' } }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>
                    Confirmar Cancelación de Viaje
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que deseas cancelar el viaje{' '}
                        <strong>{selectedRide?.id}</strong>?
                        <br /><br />
                        <strong>Conductor:</strong> {selectedRide?.displayDriverName}{selectedRide?.driverEmail ? ` (${selectedRide.driverEmail})` : ''}<br />
                        <strong>Pasajero:</strong> {selectedRide?.displayPassengerName}{selectedRide?.passengerEmail ? ` (${selectedRide.passengerEmail})` : ''}
                        <br /><br />
                        Esta acción no se puede deshacer. El viaje pasará al historial de viajes cancelados.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button
                        onClick={handleCloseDialog}
                        disabled={cancelling}
                        variant="outlined"
                        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
                    >
                        Volver
                    </Button>
                    <Button
                        onClick={handleConfirmCancel}
                        disabled={cancelling}
                        variant="contained"
                        color="error"
                        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, minWidth: 120 }}
                    >
                        {cancelling ? (
                            <CircularProgress size={18} color="inherit" />
                        ) : (
                            'Cancelar Viaje'
                        )}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ViajesActivos;
