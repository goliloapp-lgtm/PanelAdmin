import React, { useState, useEffect, useMemo } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
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

const ViajesCanceladosTable = () => {
    const [trips, setTrips] = useState<TripWithCustomerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState<Order>('asc');
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
        const db = getDatabase(firebaseApp);
        const tripsRef = ref(db, 'rideRequests');

        const unsubscribe = onValue(tripsRef, (snapshot) => {
            setLoading(true);
            const data = snapshot.val();
            console.log("Raw data from rideRequest:", data);

            const processTrips = async () => {
                if (data) {
                    const fetchedTrips: Trip[] = Object.values(data)
                        .filter((trip: any) => trip.status === 'canceled' || trip.status === 'cancelled')
                        .map((trip: any) => ({
                            ...trip,
                        }));
                    
                    const tripsWithCustomerInfo = await Promise.all(
                        fetchedTrips.map(async (trip) => {
                            const userData = await getUser(trip.userId);
                            return {
                                ...trip,
                                customerName: userData?.firstName,
                                customerLastName: userData?.lastName,
                            };
                        })
                    );

                    console.log("Filtered cancelled trips:", tripsWithCustomerInfo);
                    setTrips(tripsWithCustomerInfo);
                } else {
                    setTrips([]);
                }
                setLoading(false);
            };
            processTrips();
        }, (error) => {
            console.error("Error fetching trips:", error);
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
            <DashboardCard title="Historial de Viajes Cancelados">
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
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Estado del Pago
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
                                        <Chip
                                            color={trip.paymentStatus === 'succeeded' ? 'success' : 'warning'}
                                            size="small"
                                            label={trip.paymentStatus}
                                        ></Chip>
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

export default ViajesCanceladosTable;
