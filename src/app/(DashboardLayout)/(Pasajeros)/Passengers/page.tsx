'use client';
import React from 'react';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import ListPassengers from '../_components/ListPassengers';
import AuthGuard from '../../components/AuthGuard';
import { useAdmin } from '@/hooks/useAdmin';
import { CircularProgress, Box, Typography } from '@mui/material';

const ActivePassengersPage = () => {
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

  const isOperaciones = roleName?.toLowerCase() === 'operaciones';

  return (
    <AuthGuard>
      <PageContainer title="Pasajeros Activos" description="Listado de pasajeros activos">
        {!isOperaciones ? (
          <ListPassengers />
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h5" color="error" gutterBottom>
              Acceso Denegado
            </Typography>
            <Typography variant="body1" color="textSecondary">
              Esta sección no está disponible para su rol de usuario.
            </Typography>
          </Box>
        )}
      </PageContainer>
    </AuthGuard>
  );
};

export default ActivePassengersPage;

