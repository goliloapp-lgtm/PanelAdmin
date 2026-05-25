import React from "react";
import dynamic from "next/dynamic";
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
import { useTheme } from '@mui/material/styles';
import { Grid, Stack, Typography, Avatar } from '@mui/material';
import { IconArrowUpLeft, IconArrowDownRight } from '@tabler/icons-react';

import DashboardCard from '@/app/(DashboardLayout)/components/shared/DashboardCard';

interface YearlyBreakupProps {
  totalVentasAnual: number;
  cambioVentasAnual: number;
  series: number[];
}

const YearlyBreakup: React.FC<YearlyBreakupProps> = ({ totalVentasAnual, cambioVentasAnual, series }) => {
  // Obtiene colores del tema
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const primarylight = '#ecf2ff';
  const successlight = theme.palette.success.light;
  const errorlight = '#fdede8';

  const isPositive = cambioVentasAnual >= 0;

  // Opciones de la gráfica donut
  const optionscolumnchart: any = {
    chart: {
      type: 'donut',
      fontFamily: "'Plus Jakarta Sans', sans-serif;",
      foreColor: '#bbadb7ff',
      toolbar: { show: false },
      height: 155,
    },
    colors: [primary, primarylight],
    labels: ['Ganancia Conductor', 'Comisión Lilo'],
    plotOptions: {
      pie: {
        startAngle: 0,
        endAngle: 360,
        donut: {
          size: '75%',
          background: 'transparent',
        },
      },
    },
    tooltip: {
      theme: theme.palette.mode === 'dark' ? 'dark' : 'light',
      fillSeriesColor: false,
    },
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    responsive: [
      {
        breakpoint: 991,
        options: { chart: { width: 120 } },
      },
    ],
  };

  // Renderizado
  return (
    <DashboardCard title="Acumulado Anual (Ventas)">
      <Grid container spacing={3}>
        {/* Columna izquierda: datos y leyenda */}
        <Grid size={{ xs: 7, sm: 7 }}>
          <Typography variant="h3" fontWeight="700">
            ${totalVentasAnual.toLocaleString()}
          </Typography>
          <Stack direction="row" spacing={1} mt={1} alignItems="center">
            <Avatar sx={{ bgcolor: isPositive ? successlight : errorlight, width: 27, height: 27 }}>
              {isPositive ? (
                <IconArrowUpLeft width={20} color="#39B69A" />
              ) : (
                <IconArrowDownRight width={20} color="#FA896B" />
              )}
            </Avatar>
            <Typography variant="subtitle2" fontWeight="600">
              {isPositive ? `+${cambioVentasAnual}%` : `${cambioVentasAnual}%`}
            </Typography>
            <Typography variant="subtitle2" color="textSecondary">
              Año anterior
            </Typography>
          </Stack>
          <Stack spacing={2} mt={3} direction="column">
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ width: 9, height: 9, bgcolor: primary, svg: { display: 'none' } }}></Avatar>
              <Typography variant="subtitle2" color="textSecondary">
                Cond. (${series[0]?.toLocaleString() || 0})
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ width: 9, height: 9, bgcolor: primarylight, svg: { display: 'none' } }}></Avatar>
              <Typography variant="subtitle2" color="textSecondary">
                Lilo (${series[1]?.toLocaleString() || 0})
              </Typography>
            </Stack>
          </Stack>
        </Grid>
        {/* Columna derecha: gráfica donut */}
        <Grid size={{ xs: 5, sm: 5 }}>
          <Chart
            options={optionscolumnchart}
            series={series.length > 0 && (series[0] > 0 || series[1] > 0) ? series : [1, 1]}
            type="donut"
            height={150} width={"100%"}
          />
        </Grid>
      </Grid>
    </DashboardCard>
  );
};

export default YearlyBreakup;
