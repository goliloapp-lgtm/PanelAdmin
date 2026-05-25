'use client'
import React from 'react';
import AuthGuard from './components/AuthGuard';
import { Grid, Box, Typography, CircularProgress } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
// components
import SalesOverview from '@/app/(DashboardLayout)/components/dashboard/SalesOverview';
import YearlyBreakup from '@/app/(DashboardLayout)/components/dashboard/YearlyBreakup';
import RecentTransactions from '@/app/(DashboardLayout)/components/dashboard/RecentTransactions';
import ProductPerformance from '@/app/(DashboardLayout)/components/dashboard/ProductPerformance';
import MonthlyEarnings from '@/app/(DashboardLayout)/components/dashboard/MonthlyEarnings';
import { useDashboardStats } from '@/hooks/useDashboardStats';

const Dashboard = () => {
  const stats = useDashboardStats();

  return (
    <AuthGuard>
      <PageContainer title="Lilo Rides Dashboard" description="Dashboard de control Lilo App">
        <Box>
          {stats.loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
              <CircularProgress color="primary" />
              <Typography variant="body1" color="textSecondary">
                Cargando estadísticas reales desde Firestore...
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={3}>
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
              <Grid
                size={{
                  xs: 12,
                  lg: 4
                }}>
                <RecentTransactions transactions={stats.recentTransactions} />
              </Grid>
              <Grid
                size={{
                  xs: 12,
                  lg: 8
                }}>
                <ProductPerformance riders={stats.driverPerformance} />
              </Grid>
            </Grid>
          )}
        </Box>
      </PageContainer>
    </AuthGuard>
  );
}

export default Dashboard;
