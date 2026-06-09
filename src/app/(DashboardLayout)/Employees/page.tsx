'use client';

import React from 'react';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import ListEmployees from './_components/ListEmployees';
import AuthGuard from '../components/AuthGuard';
import { useAdmin } from '@/hooks/useAdmin';
import { CircularProgress, Box, Typography } from '@mui/material';

const EmployeesPage = () => {
  const { roleName, isLoading } = useAdmin();

  if (isLoading) {
    return (
      <AuthGuard>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <CircularProgress />
        </Box>
      </AuthGuard>
    );
  }

  const isAdmin = roleName?.toLowerCase() === 'admin';

  return (
    <AuthGuard>
      <PageContainer title="Empleados" description="Administración de roles de empleados">
        {isAdmin ? (
          <ListEmployees />
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h5" color="error" gutterBottom>
              Acceso Denegado
            </Typography>
            <Typography variant="body1" color="textSecondary">
              Esta sección es exclusiva para administradores del sistema.
            </Typography>
          </Box>
        )}
      </PageContainer>
    </AuthGuard>
  );
};

export default EmployeesPage;
