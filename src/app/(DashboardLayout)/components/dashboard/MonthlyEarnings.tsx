import React from "react";
import dynamic from "next/dynamic";
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
import { useTheme } from '@mui/material/styles';
import { Stack, Typography, Avatar, Fab } from '@mui/material';
import { IconArrowDownRight, IconArrowUpLeft, IconCurrencyDollar } from '@tabler/icons-react';
import DashboardCard from '@/app/(DashboardLayout)/components/shared/DashboardCard';

interface MonthlyEarningsProps {
  gananciasMes: number;
  cambioGananciasMes: number;
  chartData: number[];
}

const MonthlyEarnings: React.FC<MonthlyEarningsProps> = ({ gananciasMes, cambioGananciasMes, chartData }) => {
  // chart color
  const theme = useTheme();
  const secondary = theme.palette.secondary.main;
  const secondarylight = '#f5fcff';
  const errorlight = '#fdede8';
  const successlight = theme.palette.success.light;

  const isPositive = cambioGananciasMes >= 0;

  // chart
  const optionscolumnchart: any = {
    chart: {
      type: 'area',
      fontFamily: "'Plus Jakarta Sans', sans-serif;",
      foreColor: '#adb0bb',
      toolbar: {
        show: false,
      },
      height: 60,
      sparkline: {
        enabled: true,
      },
      group: 'sparklines',
    },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    fill: {
      colors: [secondarylight],
      type: 'solid',
      opacity: 0.05,
    },
    markers: {
      size: 0,
    },
    tooltip: {
      theme: theme.palette.mode === 'dark' ? 'dark' : 'light',
    },
  };
  const seriescolumnchart: any = [
    {
      name: 'Comisiones ($)',
      color: secondary,
      data: chartData.length > 0 ? chartData : [0, 0, 0, 0, 0, 0, 0],
    },
  ];

  return (
    <DashboardCard
      title="Ganancias del Mes (Comisión)"
      action={
        <Fab color="secondary" size="medium" sx={{color: '#ffffff'}}>
          <IconCurrencyDollar width={24} />
        </Fab>
      }
      footer={
        <Chart options={optionscolumnchart} series={seriescolumnchart} type="area" height={60} width={"100%"} />
      }
    >
      <>
        <Typography variant="h3" fontWeight="700" mt="-20px">
          ${gananciasMes.toLocaleString()}
        </Typography>
        <Stack direction="row" spacing={1} my={1} alignItems="center">
          <Avatar sx={{ bgcolor: isPositive ? successlight : errorlight, width: 27, height: 27 }}>
            {isPositive ? (
              <IconArrowUpLeft width={20} color="#39B69A" />
            ) : (
              <IconArrowDownRight width={20} color="#FA896B" />
            )}
          </Avatar>
          <Typography variant="subtitle2" fontWeight="600">
            {isPositive ? `+${cambioGananciasMes}%` : `${cambioGananciasMes}%`}
          </Typography>
          <Typography variant="subtitle2" color="textSecondary">
            Mes anterior
          </Typography>
        </Stack>
      </>
    </DashboardCard>
  );
};

export default MonthlyEarnings;
