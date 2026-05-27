import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
import {
    Typography, Box,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Button,
    TableSortLabel,
    TablePagination,
    Chip
} from '@mui/material';
import DashboardCard from '@/app/(DashboardLayout)//components/shared/DashboardCard';
import EditEmployeeModal from './EditEmployeeModal';

export interface Employee {
    id: string;
    email: string;
    firstName: string;
    isActive: boolean;
    lastName: string;
    phone: string;
    roleId: string;
    roleName: string;
}

type Order = 'asc' | 'desc';

const ListEmployees = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Employee>('firstName');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const handleOpenModal = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedEmployee(null);
        setIsModalOpen(false);
    };

    const handleRequestSort = (property: keyof Employee) => {
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

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const db = getFirestore(firebaseApp);
            
            // 1. Fetch all roles to create a mapping of roleId -> roleName
            const rolesSnapshot = await getDocs(collection(db, "roles"));
            const rolesMap: Record<string, string> = {};
            rolesSnapshot.forEach((doc) => {
                const data = doc.data();
                rolesMap[doc.id] = data.name || doc.id;
            });

            // 2. Fetch all users
            const usersSnapshot = await getDocs(collection(db, "users"));
            const fetchedEmployees: Employee[] = [];

            usersSnapshot.forEach((doc) => {
                const data = doc.data();
                const roleValue = data.role;

                // Only include users who have a role assigned
                if (roleValue && roleValue !== "" && roleValue !== "N/A" && roleValue !== "passenger") {
                    const resolvedRoleName = rolesMap[roleValue] || roleValue;
                    
                    fetchedEmployees.push({
                        id: doc.id,
                        email: data.email || "N/A",
                        firstName: data.firstName || "N/A",
                        isActive: data.isActive || false,
                        lastName: data.lastName || "N/A",
                        phone: data.phone || "N/A",
                        roleId: roleValue,
                        roleName: resolvedRoleName,
                    });
                }
            });

            setEmployees(fetchedEmployees);
        } catch (error) {
            console.error("Error fetching employees:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const handleUpdateList = () => {
        fetchEmployees();
    };

    const sortedEmployees = useMemo(() => {
        const comparator = (a: Employee, b: Employee) => {
            const valA = a[orderBy] || '';
            const valB = b[orderBy] || '';

            if (valB < valA) {
                return order === 'asc' ? 1 : -1;
            }
            if (valB > valA) {
                return order === 'asc' ? -1 : 1;
            }
            return 0;
        };
        return [...employees].sort(comparator);
    }, [employees, order, orderBy]);

    const visibleRows = useMemo(
        () =>
            sortedEmployees.slice(
                page * rowsPerPage,
                page * rowsPerPage + rowsPerPage,
            ),
        [sortedEmployees, page, rowsPerPage],
    );

    if (loading) {
        return <Typography sx={{ p: 2 }}>Cargando empleados...</Typography>;
    }

    return (
        <>
            <DashboardCard title="Empleados Registrados">
                <Box sx={{ overflow: 'auto', width: { xs: '280px', sm: 'auto' } }}>
                    <Table
                        aria-label="employees table"
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
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'roleName'}
                                        direction={orderBy === 'roleName' ? order : 'asc'}
                                        onClick={() => handleRequestSort('roleName')}
                                    >
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Rol
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
                            {visibleRows.map((emp) => (
                                <TableRow key={emp.id}>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {emp.email}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            {emp.firstName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {emp.lastName}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography color="textSecondary" variant="subtitle2" fontWeight={400}>
                                            {emp.phone}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={emp.roleName.toUpperCase()}
                                            color="primary"
                                            variant="outlined"
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button variant="contained" color="primary" onClick={() => handleOpenModal(emp)}>
                                            Editar Rol
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {visibleRows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        <Typography sx={{ py: 3 }} color="textSecondary">
                                            No hay empleados registrados en el sistema.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Box>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={employees.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </DashboardCard>
            <EditEmployeeModal
                open={isModalOpen}
                onClose={handleCloseModal}
                employee={selectedEmployee}
                onUpdate={handleUpdateList}
            />
        </>
    );
};

export default ListEmployees;
