import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
import EditDriverModal from './EditDriverModal';
// import EditDriverModal from './EditDriverModal'; 

export interface Driver {
    uid: string;
    criminalRecordImageUrl: string;
    dniImageUrl: string;
    dniNumber: string;
    isConductor: boolean;
    isConductorActive: boolean;
    isUserVerified: boolean;
    licenseImageUrl: string;
    licenseNumber: string;
    licensePlate: string;
    pendingVerified: boolean;
    phoneNumber: string;
    phoneVerified: boolean;
    profileImageUrl: string;
    updatedAt: any; // Using 'any' for Firestore Timestamp for simplicity
    userId: string;
    vehicleBrand: string;
    vehicleModel: string;
}

type Order = 'asc' | 'desc';

const Riders = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [usersDict, setUsersDict] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [order, setOrder] = useState<'asc' | 'desc'>('asc');
    const [orderBy, setOrderBy] = useState<string>('fullName');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const handleOpenModal = (driver: Driver) => {
        setSelectedDriver(driver);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedDriver(null);
        setIsModalOpen(false);
    };

    const handleRequestSort = (property: string) => {
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

    const fetchDrivers = async () => {
        setLoading(true);
        try {
            const db = getFirestore(firebaseApp);
            const driversCollectionRef = collection(db, "drivers");
            const q = query(driversCollectionRef, where("isUserVerified", "==", false));
            const querySnapshot = await getDocs(q);
           
            const fetchedDrivers: Driver[] = [];
            const userPromises: Promise<any>[] = [];

            querySnapshot.forEach((docSnap) => {
                const driverData = { uid: docSnap.id, ...docSnap.data() } as Driver;
                fetchedDrivers.push(driverData);
                if (driverData.userId) {
                    userPromises.push(getDoc(doc(db, "users", driverData.userId)));
                } else {
                    userPromises.push(Promise.resolve(null));
                }
            });

            const userSnaps = await Promise.all(userPromises);
            const newUsersDict: Record<string, any> = {};
            
            fetchedDrivers.forEach((driver, index) => {
                const uSnap = userSnaps[index];
                if (uSnap && uSnap.exists()) {
                    newUsersDict[driver.userId] = uSnap.data();
                }
            });

            setDrivers(fetchedDrivers);
            setUsersDict(newUsersDict);
        } catch (error) {
            console.error("Error fetching drivers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrivers();
    }, []);

    const handleUpdateList = () => {
        fetchDrivers();
    };

    const ridersWithNames = useMemo(() => {
        return drivers.map(driver => {
            const userData = usersDict[driver.userId];
            return {
                ...driver,
                firstName: userData?.firstName || "Cargando...",
                lastName: userData?.lastName || "",
                fullName: `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() || "Cargando..."
            };
        });
    }, [drivers, usersDict]);

    const sortedDrivers = useMemo(() => {
        const comparator = (a: any, b: any) => {
            const valA = a[orderBy] || "";
            const valB = b[orderBy] || "";
            if (valB < valA) {
                return order === 'asc' ? 1 : -1;
            }
            if (valB > valA) {
                return order === 'asc' ? -1 : 1;
            }
            return 0;
        };
        return [...ridersWithNames].sort(comparator);
    }, [ridersWithNames, order, orderBy]);

    const visibleRows = useMemo(
        () =>
            sortedDrivers.slice(
                page * rowsPerPage,
                page * rowsPerPage + rowsPerPage,
            ),
        [sortedDrivers, page, rowsPerPage],
    );

    if (loading) {
        return <Typography>Cargando conductores...</Typography>;
    }

    return (
        <>
            <DashboardCard title="Conductores sin verificar
            ">
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
                                        active={orderBy === 'fullName'}
                                        direction={orderBy === 'fullName' ? order : 'asc'}
                                        onClick={() => handleRequestSort('fullName')}
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
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Verificado
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
                            {visibleRows.map((driver) => (
                                <TableRow key={driver.uid}>
                                    <TableCell>
                                        <Avatar src={driver.profileImageUrl} alt={driver.fullName} />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            {driver.fullName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {driver.vehicleBrand} {driver.vehicleModel}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2">
                                            {driver.licensePlate}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            color={driver.isUserVerified ? 'success' : 'warning'}
                                            size="small"
                                            label={driver.isUserVerified ? 'Verificado' : 'Pendiente'}
                                        ></Chip>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button variant="contained" color="primary" onClick={() => handleOpenModal(driver)}>
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
                    count={drivers.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </DashboardCard>
            {selectedDriver && (
                <EditDriverModal
                    open={isModalOpen}
                    onClose={handleCloseModal}
                    driver={selectedDriver}
                    onUpdate={handleUpdateList}
                />
            )}
        </>
    );
};

export default Riders;
