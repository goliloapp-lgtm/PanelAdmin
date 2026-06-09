import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
import { getUser } from '@/utils/user';
import {
    Typography, Box,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Chip,
    Button,
    TableSortLabel,
    TablePagination,
    Avatar
} from '@mui/material';
import DashboardCard from '@/app/(DashboardLayout)//components/shared/DashboardCard';

export interface Trip {
    address: string;
    latitude: number;
    longitude: number;
    driverId: string;
    etaMinutes: number;
    farePriceCents: number;
    id: string;
    origin: {
        address: string;
        latitude: number;
        longitude: number;
    };
    paymentIntentId: string;
    paymentMethod: string;
    paymentStatus: string;
    serviceType: string;
    status: string;
    updatedAt: number;
    userId: string;
}

export interface TripWithCustomerInfo extends Trip {
    customerName?: string;
    customerLastName?: string;
}

type Order = 'asc' | 'desc';

const ViajesTable = () => {
    const [trips, setTrips] = useState<TripWithCustomerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Trip>('updatedAt');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const handleRequestSort = (property: keyof Trip) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    useEffect(() => {
        const db = getFirestore(firebaseApp);
        // Fetch all history trips and filter completed trips client-side to handle legacy data lacking 'status'
        const tripsQuery = query(collection(db, 'historyTrips'));

        const unsubscribe = onSnapshot(tripsQuery, (snapshot) => {
            setLoading(true);
            const processTrips = async () => {
                const fetchedTrips: any[] = [];
                snapshot.forEach((doc) => {
                    fetchedTrips.push({ id: doc.id, ...doc.data() });
                });

                // Filter for completed trips
                const completedTrips = fetchedTrips.filter((trip) => {
                    const status = trip.status?.toLowerCase();
                    if (status) {
                        return status === 'completed';
                    }
                    // Legacy fallback: if no status, consider completed if it has completedAt, rating, reviewTimestamp, or is paid
                    return !!trip.completedAt || !!trip.rating || !!trip.reviewTimestamp || !!trip.paid;
                });

                const tripsWithCustomerInfo = await Promise.all(
                    completedTrips.map(async (trip) => {
                        const userId = trip.passengerId || trip.userId;
                        const userData = userId ? await getUser(userId) : null;
                        
                        const farePriceCents = trip.originalPrice !== undefined 
                            ? Math.round(Number(trip.originalPrice) * 100) 
                            : (trip.farePriceCents !== undefined ? Number(trip.farePriceCents) : 0);

                        const paymentStatus = trip.paymentStatus || (trip.paid ? 'succeeded' : 'pending');

                        const getTimestamp = (t: any) => {
                            const rawDate = t.createdAt || t.updatedAt || t.completedAt || t.startedAt || t.reviewTimestamp;
                            if (!rawDate) return Date.now();
                            if (rawDate.toDate && typeof rawDate.toDate === 'function') {
                                return rawDate.toDate().getTime();
                            }
                            if (rawDate.seconds !== undefined) {
                                return rawDate.seconds * 1000;
                            }
                            if (typeof rawDate === 'string') {
                                return new Date(rawDate).getTime();
                            }
                            return Number(rawDate);
                        };

                        return {
                            ...trip,
                            farePriceCents,
                            paymentStatus,
                            updatedAt: getTimestamp(trip),
                            customerName: userData?.firstName || trip.passengerName || 'Pasajero',
                            customerLastName: userData?.lastName || '',
                        };
                    })
                );

                console.log("Filtered completed trips from Firestore:", tripsWithCustomerInfo);
                setTrips(tripsWithCustomerInfo);
                setLoading(false);
            };
            processTrips();
        }, (error) => {
            console.error("Error fetching trips from Firestore:", error);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const sortedTrips = useMemo(() => {
        const comparator = (a: Trip, b: Trip) => {
            const valA = a[orderBy];
            const valB = b[orderBy];

            if (typeof valA === 'number' && typeof valB === 'number') {
                return order === 'asc' ? valA - valB : valB - valA;
            }
            if (String(valB) < String(valA)) {
                return order === 'asc' ? 1 : -1;
            }
            if (String(valB) > String(valA)) {
                return order === 'asc' ? -1 : 1;
            }
            return 0;
        };
        return [...trips].sort(comparator);
    }, [trips, order, orderBy]);

    const visibleRows = useMemo(
        () =>
            sortedTrips.slice(
                page * rowsPerPage,
                page * rowsPerPage + rowsPerPage,
            ),
        [sortedTrips, page, rowsPerPage],
    );

    if (loading) {
        return <Typography>Cargando viajes...</Typography>;
    }

    return (
        <>
            <DashboardCard title="Historial de Viajes Completados">
                <Box sx={{ overflow: 'auto', width: { xs: '280px', sm: 'auto' } }}>
                    <Table
                        aria-label="simple table"
                        sx={{
                            whiteSpace: "nowrap",
                            mt: 2
                        }}
                    >
                        <TableHead>
                            <TableRow>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        ID del Viaje
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Cliente
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                     <TableSortLabel
                                        active={orderBy === 'farePriceCents'}
                                        direction={orderBy === 'farePriceCents' ? order : 'asc'}
                                        onClick={() => handleRequestSort('farePriceCents')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Precio
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Método de Pago
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'updatedAt'}
                                        direction={orderBy === 'updatedAt' ? order : 'asc'}
                                        onClick={() => handleRequestSort('updatedAt')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Fecha
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleRows.map((trip) => (
                                <TableRow key={trip.id}>
                                    <TableCell>
                                        <Typography variant="subtitle2" fontWeight={400}>
                                            {trip.id}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {trip.customerName} {trip.customerLastName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            ${(trip.farePriceCents / 100).toFixed(2)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2">
                                            {trip.paymentMethod}
                                        </Typography>
                                    </TableCell>
                                     <TableCell>
                                        <Typography variant="subtitle2">
                                            {new Date(trip.updatedAt).toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={trips.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </DashboardCard>
        </>
    );
};

export default ViajesTable;
