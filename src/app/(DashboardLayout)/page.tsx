'use client'
import React from 'react';
import AuthGuard from './components/AuthGuard';
import { Grid, Box, Typography, CircularProgress, Stack, Avatar } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
// components
import SalesOverview from '@/app/(DashboardLayout)/components/dashboard/SalesOverview';
import YearlyBreakup from '@/app/(DashboardLayout)/components/dashboard/YearlyBreakup';
import RecentTransactions from '@/app/(DashboardLayout)/components/dashboard/RecentTransactions';
import ProductPerformance from '@/app/(DashboardLayout)/components/dashboard/ProductPerformance';
import MonthlyEarnings from '@/app/(DashboardLayout)/components/dashboard/MonthlyEarnings';
import DashboardCard from '@/app/(DashboardLayout)/components/shared/DashboardCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAdmin } from '@/hooks/useAdmin';
import { IconCar, IconClock, IconCircleX, IconUserPlus } from '@tabler/icons-react';

const Dashboard = () => {
  const stats = useDashboardStats();
  const { roleName, isLoading: authLoading } = useAdmin();

  const normalizedRole = roleName ? roleName.toLowerCase() : '';
  const showFinancials = normalizedRole !== 'atencion_cliente' && normalizedRole !== 'operaciones';

  return (
    <AuthGuard>
      <PageContainer title="Lilo Rides Dashboard" description="Dashboard de control Lilo App">
        <Box>
          {stats.loading || authLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
              <CircularProgress color="primary" />
              <Typography variant="body1" color="textSecondary">
                Cargando estadísticas reales desde Firestore...
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={3}>
              {/* Row 1: KPI Cards */}
              <Grid
                size={{
                  xs: 12,
                  sm: 6,
                  lg: 3
                }}>
                <DashboardCard title="Conductores Activos">
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main', width: 48, height: 48 }}>
                      <IconCar stroke={1.5} size="1.8rem" />
                    </Avatar>
                    <Box>
                      <Typography variant="h4" fontWeight="700">
                        {stats.conductoresActivosCount}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        En línea ahora
                      </Typography>
                    </Box>
                  </Stack>
                </DashboardCard>
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  sm: 6,
                  lg: 3
                }}>
                <DashboardCard title="Espera Promedio">
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: 'success.light', color: 'success.main', width: 48, height: 48 }}>
                      <IconClock stroke={1.5} size="1.8rem" />
                    </Avatar>
                    <Box>
                      <Typography variant="h4" fontWeight="700">
                        {stats.tiempoEsperaPromedio} min
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Tiempo de respuesta
                      </Typography>
                    </Box>
                  </Stack>
                </DashboardCard>
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  sm: 6,
                  lg: 3
                }}>
                <DashboardCard title="Tasa de Cancelación">
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: 'error.light', color: 'error.main', width: 48, height: 48 }}>
                      <IconCircleX stroke={1.5} size="1.8rem" />
                    </Avatar>
                    <Box>
                      <Typography variant="h4" fontWeight="700">
                        {stats.tasaCancelacion}%
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Viajes cancelados
                      </Typography>
                    </Box>
                  </Stack>
                </DashboardCard>
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  sm: 6,
                  lg: 3
                }}>
                <DashboardCard title="Nuevos Usuarios">
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main', width: 48, height: 48 }}>
                      <IconUserPlus stroke={1.5} size="1.8rem" />
                    </Avatar>
                    <Box>
                      <Typography variant="h4" fontWeight="700">
                        +{stats.nuevosUsuariosCount}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Últimos 30 días
                      </Typography>
                    </Box>
                  </Stack>
                </DashboardCard>
              </Grid>

              {/* Row 2: Charts and Details */}
              {showFinancials && (
                <>
                  <Grid
                    size={{
                      xs: 12,
                      lg: 8
                    }}>
                    <SalesOverview series={stats.salesOverviewSeries} categories={stats.salesOverviewCategories} />
                  </Grid>
                  <Grid
                    size={{
                      xs: 12,
                      lg: 4
                    }}>
                    <Grid container spacing={3}>
                      <Grid size={12}>
                        <YearlyBreakup 
                          totalVentasAnual={stats.totalVentasAnual} 
                          cambioVentasAnual={stats.cambioVentasAnual} 
                          series={stats.yearlyBreakupSeries} 
                        />
                      </Grid>
                      <Grid size={12}>
                        <MonthlyEarnings 
                          gananciasMes={stats.gananciasMes} 
                          cambioGananciasMes={stats.cambioGananciasMes} 
                          chartData={stats.monthlyEarningsChartData} 
                        />
                      </Grid>
                    </Grid>
                  </Grid>
                </>
              )}
              
              <Grid
                size={{
                  xs: 12,
                  lg: showFinancials ? 4 : 12
                }}>
                <RecentTransactions transactions={stats.recentTransactions} />
              </Grid>
              
              {showFinancials && (
                <Grid
                  size={{
                    xs: 12,
                    lg: 8
                  }}>
                  <ProductPerformance riders={stats.driverPerformance} />
                </Grid>
              )}
            </Grid>
          )}
        </Box>
      </PageContainer>
    </AuthGuard>
  );
}

export default Dashboard;
