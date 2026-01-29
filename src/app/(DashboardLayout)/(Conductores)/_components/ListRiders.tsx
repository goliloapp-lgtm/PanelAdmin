import React, { useState, useEffect, useMemo } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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
    TablePagination,
    Avatar
} from '@mui/material';
import DashboardCard from '@/app/(DashboardLayout)//components/shared/DashboardCard';
import EditRiderModal from './EditRiderModal'; 
import EditDriverModal from './EditDriverModal';
import { Driver } from './Riders'; 

export interface Rider {
    driverId: string;
    driverName: string;
    isActive: boolean;
    lastStatusUpdate: number;
    lat: number;
    licensePlate: string;
    lng: number;
    phoneNumber: string;
    profilePhoto: string;
    seatsAvailable: number;
    status: string;
    timestamp: number;
    vehicleBrand: string;
    vehicleModel: string;
}

type Order = 'asc' | 'desc';

const ListRiders = () => {
    const [riders, setRiders] = useState<Rider[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDriverDetail, setSelectedDriverDetail] = useState<Driver | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Rider>('driverName');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const handleOpenModal = (rider: Rider) => {
        setSelectedRider(rider);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedRider(null);
        setIsModalOpen(false);
    };

    const handleRiderNameClick = async (riderId: string) => {
        setLoading(true);
        try {
            const db = getFirestore(firebaseApp);
            const docRef = doc(db, "drivers", riderId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const driverData = { uid: docSnap.id, ...docSnap.data() } as Driver;
                setSelectedDriverDetail(driverData);
                setIsDetailModalOpen(true);
            } else {
                console.log("No such document!");
            }
        } catch (error) {
            console.error("Error fetching driver details:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseDetailModal = () => {
        setSelectedDriverDetail(null);
        setIsDetailModalOpen(false);
    };

    const handleRequestSort = (property: keyof Rider) => {
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
        const ridersRef = ref(db, 'conductores_activos');

        const unsubscribe = onValue(ridersRef, (snapshot) => {
            setLoading(true);
            const data = snapshot.val();
            if (data) {
                const fetchedRiders: Rider[] = Object.keys(data).map(key => ({
                    ...data[key],
                    driverId: key
                }));
                setRiders(fetchedRiders);
            } else {
                setRiders([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching riders:", error);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const sortedRiders = useMemo(() => {
        const comparator = (a: Rider, b: Rider) => {
            // Handle numeric and string comparisons
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
        return [...riders].sort(comparator);
    }, [riders, order, orderBy]);

    const visibleRows = useMemo(
        () =>
            sortedRiders.slice(
                page * rowsPerPage,
                page * rowsPerPage + rowsPerPage,
            ),
        [sortedRiders, page, rowsPerPage],
    );

    if (loading) {
        return <Typography>Cargando conductores...</Typography>;
    }

    return (
        <>
            <DashboardCard title="Conductores Activos">
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
                                        Foto
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'driverName'}
                                        direction={orderBy === 'driverName' ? order : 'asc'}
                                        onClick={() => handleRequestSort('driverName')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Nombre
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'vehicleBrand'}
                                        direction={orderBy === 'vehicleBrand' ? order : 'asc'}
                                        onClick={() => handleRequestSort('vehicleBrand')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Vehículo
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Placa
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'status'}
                                        direction={orderBy === 'status' ? order : 'asc'}
                                        onClick={() => handleRequestSort('status')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Estado
                                        </Typography>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Acciones
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleRows.map((rider) => (
                                <TableRow key={rider.driverId}>
                                    <TableCell>
                                        <Avatar src={rider.profilePhoto} alt={rider.driverName} />
                                    </TableCell>
                                    <TableCell>
                                        <Typography 
                                            variant="subtitle2" 
                                            fontWeight={600}
                                            sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
                                            onClick={() => handleRiderNameClick(rider.driverId)}
                                        >
                                            {rider.driverName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {rider.vehicleBrand} {rider.vehicleModel}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2">
                                            {rider.licensePlate}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            color={rider.status === 'disponible' ? 'success' : 'error'}
                                            size="small"
                                            label={rider.status}
                                        ></Chip>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button variant="contained" color="primary" onClick={() => handleOpenModal(rider)}>
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
                    count={riders.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </DashboardCard>
            {selectedRider && (
                <EditRiderModal
                    open={isModalOpen}
                    onClose={handleCloseModal}
                    rider={selectedRider}
                    onUpdate={() => {
                        // The real-time listener will handle the update, but we can keep this for future use
                    }}
                />
            )}
            {selectedDriverDetail && (
                <EditDriverModal
                    open={isDetailModalOpen}
                    onClose={handleCloseDetailModal}
                    driver={selectedDriverDetail}
                    readOnly={true}
                />
            )}
        </>
    );
};

export default ListRiders;
