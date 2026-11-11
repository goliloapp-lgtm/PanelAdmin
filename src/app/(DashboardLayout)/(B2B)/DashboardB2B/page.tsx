"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Grid,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  IconPlus,
  IconCar,
  IconCheck,
  IconCurrencyDollar,
  IconRoad,
  IconBuildingSkyscraper,
  IconClock,
  IconArrowRight,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import StatusBadge from "../_components/StatusBadge";
import { B2BCompany, B2BServiceRequest, B2BVehicle } from "@/types/b2b";
import {
  subscribeToB2BCompanies,
  subscribeToB2BRequests,
  subscribeToB2BVehicles,
} from "@/services/b2b";
import {
  listPlatformScheduledTripsCallable,
  listPlatformTripsCallable,
} from "@/utils/functions";

const ACTIVE_STATUSES = [
  "requested",
  "seeking_driver",
  "confirmed",
  "assigned",
  "enRoute",
  "driverArrived",
  "inService",
  "arrived",
];

const B2BDashboardPage = () => {
  const router = useRouter();
  const [requests, setRequests] = useState<B2BServiceRequest[]>([]);
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [vehicles, setVehicles] = useState<B2BVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<"week" | "month" | "all">(
    "month"
  );

  useEffect(() => {
    const unsubReqs = subscribeToB2BRequests(
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      undefined,
      () => setLoading(false)
    );

    const unsubComps = subscribeToB2BCompanies((data) => setCompanies(data));
    const unsubVehs = subscribeToB2BVehicles((data) => setVehicles(data));

    Promise.allSettled([
      listPlatformScheduledTripsCallable({ countryId: "sv", limit: 50 }),
      listPlatformTripsCallable({ countryId: "sv", limit: 50 }),
    ]).then(([schedRes, tripsRes]) => {
      const additional: B2BServiceRequest[] = [];
      if (schedRes.status === "fulfilled" && schedRes.value.data?.scheduledTrips) {
        for (const st of schedRes.value.data.scheduledTrips) {
          const rawCat = String(st.categoryId || "suv").toLowerCase();
          const category: B2BVehicle["category"] = rawCat.includes("pickup")
            ? "pickup"
            : rawCat.includes("microbus")
            ? "microbus"
            : "suv";
          additional.push({
            id: st.scheduledTripId,
            folio: `RES-${st.scheduledTripId.slice(0, 8).toUpperCase()}`,
            scheduledTripId: st.scheduledTripId,
            companyId: st.companyId || "general",
            status: (st.status === "dispatched"
              ? "inService"
              : st.status === "completed"
              ? "completed"
              : st.status === "cancelled"
              ? "cancelled"
              : "assigned") as any,
            vehicleCategory: category,
            passengersCount: category === "microbus" ? 8 : 2,
            origin: {
              address: st.originAddress || "San Salvador",
              lat: 13.6929,
              lng: -89.2182,
            },
            destination: {
              address: st.destinationAddress || "Santa Tecla",
              lat: 13.6769,
              lng: -89.2797,
            },
            scheduledAt: st.scheduledPickupAt,
            farePrice: st.totalAmount || 0,
            costEstimate: st.totalAmount || 0,
            createdAt: st.scheduledPickupAt,
          } as unknown as B2BServiceRequest);
        }
      }
      if (additional.length > 0) {
        setRequests((prev) => {
          const existingIds = new Set(
            prev.map((p) => p.id || p.tripId || (p as any).scheduledTripId)
          );
          const toAdd = additional.filter((a) => !existingIds.has(a.id));
          return [...prev, ...toAdd];
        });
      }
    });

    return () => {
      unsubReqs();
      unsubComps();
      unsubVehs();
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      periodFilter === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : periodFilter === "month"
        ? 30 * 24 * 60 * 60 * 1000
        : Infinity;

    return requests.filter((req) => {
      if (selectedCompanyId !== "all" && req.companyId !== selectedCompanyId) {
        return false;
      }
      if (cutoffMs !== Infinity) {
        const ts =
          (req.createdAt as any)?.toMillis?.() ||
          ((req.createdAt as any)?.seconds
            ? (req.createdAt as any).seconds * 1000
            : Date.parse(String(req.scheduledAt || "")) || now);
        if (now - ts > cutoffMs) return false;
      }
      return true;
    });
  }, [requests, selectedCompanyId, periodFilter]);

  const metrics = useMemo(() => {
    const inProgress = filteredRequests.filter((r) =>
      ACTIVE_STATUSES.includes(r.status)
    ).length;

    const completedList = filteredRequests.filter(
      (r) => r.status === "completed" || r.status === "invoiced"
    );

    const billableList = filteredRequests.filter(
      (r) => r.status !== "cancelled" && r.status !== "rejected"
    );

    const totalSpend = billableList.reduce(
      (acc, r) =>
        acc +
        Number(r.finalAmount ?? r.tariffApplied?.calculatedAmount ?? 0),
      0
    );

    const totalKm = billableList.reduce(
      (acc, r) => acc + Number(r.estimatedDistanceKm || 0),
      0
    );

    const byCategory = {
      suv: filteredRequests.filter((r) => r.vehicleCategory === "suv").length,
      pickup: filteredRequests.filter((r) => r.vehicleCategory === "pickup")
        .length,
      microbus: filteredRequests.filter((r) => r.vehicleCategory === "microbus")
        .length,
    };

    // Agrupación por Centro de Costo
    const costCenterMap = new Map<
      string,
      { name: string; companyName: string; count: number; amount: number }
    >();
    billableList.forEach((r) => {
      const key = `${r.companyId}_${r.costCenterName || "General"}`;
      const prev = costCenterMap.get(key) || {
        name: r.costCenterName || "General",
        companyName: r.companyName || "Empresa B2B",
        count: 0,
        amount: 0,
      };
      prev.count += 1;
      prev.amount += Number(
        r.finalAmount ?? r.tariffApplied?.calculatedAmount ?? 0
      );
      costCenterMap.set(key, prev);
    });

    return {
      inProgress,
      completed: completedList.length,
      totalSpend,
      totalKm: Number(totalKm.toFixed(1)),
      byCategory,
      costCenters: Array.from(costCenterMap.values()).sort(
        (a, b) => b.amount - a.amount
      ),
    };
  }, [filteredRequests]);

  const totalRequestsCount = Math.max(1, filteredRequests.length);

  return (
    <PageContainer
      title="Dashboard B2B El Salvador | Lilo Corporativo"
      description="Indicadores en tiempo real, gasto acumulado, gráficas por categoría y centro de costo e historial centralizado"
    >
      <Box>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={2}
          mb={3}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              Dashboard Corporativo B2B (H2.3)
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Monitoreo ejecutivo en tiempo real de traslados, consumo presupuestario y operación en El Salvador
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField
              select
              size="small"
              label="Empresa Corporativa"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="all">Todas las Empresas SV</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.tradeName || c.legalName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Periodo"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="week">Últimos 7 días</MenuItem>
              <MenuItem value="month">Últimos 30 días</MenuItem>
              <MenuItem value="all">Histórico Total</MenuItem>
            </TextField>

            <Button
              variant="contained"
              startIcon={<IconPlus size={18} />}
              onClick={() => router.push("/Solicitudes/nueva")}
            >
              Nueva Solicitud B2B
            </Button>
          </Stack>
        </Stack>

        {/* Tarjetas KPI en Tiempo Real */}
        <Grid container spacing={2.5} mb={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "#f8fafc",
              }}
            >
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      fontWeight={700}
                    >
                      SOLICITUDES EN CURSO
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={800}
                      color="warning.main"
                    >
                      {metrics.inProgress}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Activas o en ruta ahora
                    </Typography>
                  </Box>
                  <IconClock size={36} color="#f59e0b" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      fontWeight={700}
                    >
                      SERVICIOS COMPLETADOS
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={800}
                      color="success.main"
                    >
                      {metrics.completed}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      De {filteredRequests.length} solicitudes totales
                    </Typography>
                  </Box>
                  <IconCheck size={36} color="#16a34a" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      fontWeight={700}
                    >
                      GASTO ACUMULADO (USD)
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={800}
                      color="primary.main"
                    >
                      ${metrics.totalSpend.toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Tarifa oficial B2B SV
                    </Typography>
                  </Box>
                  <IconCurrencyDollar size={36} color="#2563eb" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      fontWeight={700}
                    >
                      KILÓMETROS RECORRIDOS
                    </Typography>
                    <Typography variant="h3" fontWeight={800}>
                      {metrics.totalKm} km
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {vehicles.filter((v) => v.status === "active").length} unidades operativas
                    </Typography>
                  </Box>
                  <IconRoad size={36} color="#64748b" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Gráficos de Distribución por Categoría y Consumo por Centro de Costo */}
        <Grid container spacing={3} mb={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardCard
              title="Distribución por Categoría Vehicular"
              subtitle="Demanda comparativa SUV vs Pick-up Doble Cabina vs Microbús"
            >
              <Stack spacing={2.5} mt={1}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      SUV Corporativa (máx. 4 pax · $0.67/km)
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {metrics.byCategory.suv} servicios
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={(metrics.byCategory.suv / totalRequestsCount) * 100}
                    color="primary"
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      Pick-up Doble Cabina (máx. 4 pax · $0.67/km)
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {metrics.byCategory.pickup} servicios
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={
                      (metrics.byCategory.pickup / totalRequestsCount) * 100
                    }
                    color="secondary"
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      Microbús Corporativo (máx. 12 pax · $0.90/km)
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {metrics.byCategory.microbus} servicios
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={
                      (metrics.byCategory.microbus / totalRequestsCount) * 100
                    }
                    color="warning"
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>
              </Stack>
            </DashboardCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardCard
              title="Consumo por Centro de Costo / Departamento"
              subtitle="Gasto corporativo acumulado en el periodo seleccionado"
            >
              {metrics.costCenters.length === 0 ? (
                <Typography variant="body2" color="textSecondary" py={3}>
                  No hay consumos registrados en este periodo.
                </Typography>
              ) : (
                <Stack spacing={2} mt={1}>
                  {metrics.costCenters.slice(0, 5).map((cc, idx) => (
                    <Box key={idx}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Box>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {cc.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {cc.companyName} · {cc.count} traslado(s)
                          </Typography>
                        </Box>
                        <Chip
                          label={`$${cc.amount.toFixed(2)} USD`}
                          color="primary"
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </Stack>
                      <Divider sx={{ mt: 1.5 }} />
                    </Box>
                  ))}
                </Stack>
              )}
            </DashboardCard>
          </Grid>
        </Grid>

        {/* Historial Centralizado de Traslados en Tiempo Real */}
        <DashboardCard
          title="Historial Centralizado de Traslados B2B"
          subtitle="Últimas solicitudes corporativas sincronizadas en tiempo real"
          action={
            <Button
              size="small"
              endIcon={<IconArrowRight size={16} />}
              onClick={() => router.push("/Solicitudes")}
            >
              Ver Monitoreo Completo
            </Button>
          }
        >
          {loading ? (
            <Box display="flex" justifyContent="center" py={5}>
              <CircularProgress />
            </Box>
          ) : filteredRequests.length === 0 ? (
            <Box textAlign="center" py={5}>
              <Typography variant="body1" color="textSecondary" mb={2}>
                Aún no hay solicitudes registradas para los filtros seleccionados.
              </Typography>
              <Button
                variant="contained"
                startIcon={<IconPlus size={18} />}
                onClick={() => router.push("/Solicitudes/nueva")}
              >
                Crear Solicitud de Traslado
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table sx={{ minWidth: 850 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Folio</TableCell>
                    <TableCell>Empresa / Centro de Costo</TableCell>
                    <TableCell>Ruta (Origen → Destino)</TableCell>
                    <TableCell>Categoría & Pax</TableCell>
                    <TableCell>Conductor / Unidad</TableCell>
                    <TableCell align="right">Tarifa USD</TableCell>
                    <TableCell align="center">Estado en Vivo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRequests.slice(0, 10).map((req) => (
                    <TableRow
                      key={req.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => router.push("/Solicitudes")}
                    >
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {req.folio}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {req.roundTrip ? "Ida y Vuelta" : "Solo Ida"} ·{" "}
                          {req.estimatedDistanceKm} km
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {req.companyName}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          CC: {req.costCenterName || "General"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ maxWidth: 250 }}
                        >
                          <strong>De:</strong> {req.origin?.address}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          noWrap
                          sx={{ maxWidth: 250, display: "block" }}
                        >
                          <strong>A:</strong> {req.destination?.address}
                          {req.stops && req.stops.length > 0
                            ? ` (+${req.stops.length} parada)`
                            : ""}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={`${(
                            req.vehicleCategory || "suv"
                          ).toUpperCase()} · ${req.passengersCount} pax`}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {req.assignedDriverName ? (
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {req.assignedDriverName}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              Placa: {req.assignedVehiclePlate || "Asignada"}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="warning.main" fontWeight={600}>
                            Pendiente de despacho
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle2" fontWeight={700}>
                          $
                          {Number(
                            req.finalAmount ??
                              req.tariffApplied?.calculatedAmount ??
                              0
                          ).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge status={req.status} type="request" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DashboardCard>
      </Box>
    </PageContainer>
  );
};

export default B2BDashboardPage;
