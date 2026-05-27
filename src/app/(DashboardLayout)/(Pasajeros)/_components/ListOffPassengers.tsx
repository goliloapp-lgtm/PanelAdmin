import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
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
    TablePagination
} from '@mui/material';
import DashboardCard from '@/app/(DashboardLayout)//components/shared/DashboardCard';
import EditPassengerModal from '../../components/dashboard/EditPassengerModal';

export interface Passenger {
    id: string;
    email: string;
    firstName: string;
    isActive: boolean;
    lastName: string;
    phone: string;
    role: string;
}

type Order = 'asc' | 'desc';

const ListOffPassengers = () => {
    const [passengers, setPassengers] = useState<Passenger[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPassenger, setSelectedPassenger] = useState<Passenger | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Passenger>('firstName');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const handleOpenModal = (passenger: Passenger) => {
        setSelectedPassenger(passenger);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedPassenger(null);
        setIsModalOpen(false);
    };

    const handleRequestSort = (property: keyof Passenger) => {
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

    const fetchPassengers = async () => {
        setLoading(true);
        try {
            const db = getFirestore(firebaseApp);
            const usersCollectionRef = collection(db, "users");
            const q = query(usersCollectionRef, where("isActive", "==", false));
            const querySnapshot = await getDocs(q);

            const fetchedPassengers: Passenger[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                fetchedPassengers.push({
                    id: doc.id,
                    email: data.email || "N/A",
                    firstName: data.firstName || "N/A",
                    isActive: data.isActive || false,
                    lastName: data.lastName || "N/A",
                    phone: data.phone || "N/A",
                    role: data.role || "N/A",
                });
            });
            setPassengers(fetchedPassengers);
        } catch (error) {
            console.error("Error fetching passengers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPassengers();
    }, []);

    const handleUpdateList = () => {
        fetchPassengers();
    };

    const sortedPassengers = useMemo(() => {
        const comparator = (a: Passenger, b: Passenger) => {
            if (b[orderBy] < a[orderBy]) {
                return order === 'asc' ? 1 : -1;
            }
            if (b[orderBy] > a[orderBy]) {
                return order === 'asc' ? -1 : 1;
            }
            return 0;
        };
        return [...passengers].sort(comparator);
    }, [passengers, order, orderBy]);

    const visibleRows = useMemo(
        () =>
            sortedPassengers.slice(
                page * rowsPerPage,
                page * rowsPerPage + rowsPerPage,
            ),
        [sortedPassengers, page, rowsPerPage],
    );

    if (loading) {
        return <Typography>Cargando pasajeros...</Typography>;
    }

    return (
        <>
            <DashboardCard title="Pasajeros no activos">
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
                                    <TableSortLabel
                                        active={orderBy === 'email'}
                                        direction={orderBy === 'email' ? order : 'asc'}
                                        onClick={() => handleRequestSort('email')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Email
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'firstName'}
                                        direction={orderBy === 'firstName' ? order : 'asc'}
                                        onClick={() => handleRequestSort('firstName')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Nombre
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'lastName'}
                                        direction={orderBy === 'lastName' ? order : 'asc'}
                                        onClick={() => handleRequestSort('lastName')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Apellido
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Teléfono
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Acciones
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleRows.map((passenger) => (
                                <TableRow key={passenger.id}>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {passenger.email}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                            }}
                                        >
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={600}>
                                                    {passenger.firstName}
                                                </Typography>

                                            </Box>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {passenger.lastName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {passenger.phone}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button variant="contained" color="primary" onClick={() => handleOpenModal(passenger)}>
                                            Editar
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={passengers.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </DashboardCard>
            {selectedPassenger && (
                <EditPassengerModal
                    open={isModalOpen}
                    onClose={handleCloseModal}
                    passenger={selectedPassenger}
                    onUpdate={handleUpdateList}
                />
            )}
        </>
    );
};

export default ListOffPassengers;
