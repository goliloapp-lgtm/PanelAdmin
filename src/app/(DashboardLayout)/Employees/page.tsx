'use client';

import React from 'react';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import ListEmployees from './_components/ListEmployees';
import AuthGuard from '../components/AuthGuard';

const EmployeesPage = () => {
  return (
    <AuthGuard>
      <PageContainer title="Empleados" description="Administración de roles de empleados">
        <ListEmployees />
      </PageContainer>
    </AuthGuard>
  );
};

export default EmployeesPage;
