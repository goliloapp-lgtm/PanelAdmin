'use client';

import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import ViajesActivos from '../_components/ViajesActivos';

const ViajesActivosPage = () => {
  return (
    <PageContainer title="Viajes Activos" description="Viajes en curso en tiempo real">
      <ViajesActivos />
    </PageContainer>
  );
};

export default ViajesActivosPage;
