"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Drawer,
  Stepper,
  Step,
  StepLabel,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
} from "@mui/material";
import {
  IconPlus,
  IconSearch,
  IconMapPin,
  IconCar,
  IconUser,
  IconPackage,
  IconCheck,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import { ref, onValue } from "firebase/database";
import { doc, getDoc } from "firebase/firestore";
import { rtdb, db } from "@/utils/firebase";
import {
  listEligibleDriversCallable,
  EligibleDriverView,
  listTripEventsCallable,
  TripEventRow,
  listTripIncidentsCallable,
  TripIncidentRow,
  resolveTripIncidentCallable,
  updateOperationsConfigCallable,
} from "@/utils/functions";
import GoogleTripTrackingMap from "../_components/GoogleTripTrackingMap";
import StatusBadge from "../_components/StatusBadge";
import {
  B2BCompany,
  B2BRequestStatus,
  B2BServiceRequest,
  B2BVehicle,
} from "@/types/b2b";
import {
  subscribeToB2BCompanies,
  subscribeToB2BRequests,
  subscribeToB2BVehicles,
  assignB2BRequestVehicleAndDriver,
  updateB2BRequestStatus,
  cancelB2BCompanyReservation,
  withdrawB2BDriverAvailability,
} from "@/services/b2b";

const LIFECYCLE_STEPS: Array<{ status: B2BRequestStatus; label: string }> = [
  { status: "requested", label: "Solicitada" },
  { status: "seeking_driver", label: "Buscando Conductor" },
  { status: "confirmed", label: "Confirmada" },
  { status: "assigned", label: "Conductor Asignado" },
  { status: "enRoute", label: "En Camino al Origen" },
  { status: "driverArrived", label: "Conductor en Punto" },
  { status: "inService", label: "En Curso (Viajando)" },
  { status: "arrived", label: "Llegada a Destino" },
  { status: "completed", label: "Completado" },
];

const B2BSolicitudesPage = () => {
  const router = useRouter();
  const [requests, setRequests] = useState<B2BServiceRequest[]>([]);
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [vehicles, setVehicles] = useState<B2BVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Drawer de Monitoreo en Tiempo Real (H2.5-FE + H3 Despacho/Incidencias)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  // CF-57, CF-61, CF-63, CF-64, CF-49
  const [eligibleDrivers, setEligibleDrivers] = useState<EligibleDriverView[]>(
    []
  );
  const [tripEvents, setTripEvents] = useState<TripEventRow[]>([]);
  const [tripIncidents, setTripIncidents] = useState<TripIncidentRow[]>([]);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(
    null
  );
  const [resolutionCode, setResolutionCode] = useState<
    | "no_action"
    | "driver_warning"
    | "company_credit"
    | "trip_cancelled"
    | "trip_refunded"
    | "other"
  >("no_action");
  const [resolutionNote, setResolutionNote] = useState("");

  const [showOpsConfig, setShowOpsConfig] = useState(false);
  const [deadTimeMinutes, setDeadTimeMinutes] = useState(60);
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(360);
  const [assignmentWaitMinutes, setAssignmentWaitMinutes] = useState(15);
  const [adminPortalUrl, setAdminPortalUrl] = useState(
    "https://admin.liloapp.com/"
  );
  const [companyPortalUrl, setCompanyPortalUrl] = useState(
    "https://b2b.liloapp.com/"
  );
  const [opsReason, setOpsReason] = useState("Ajuste operativo de plataforma");
  const [savingOps, setSavingOps] = useState(false);

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

    getDoc(doc(db, "platformConfig", "operations"))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (typeof d.deadTimeMinutes === "number")
            setDeadTimeMinutes(d.deadTimeMinutes);
          if (typeof d.reminderLeadMinutes === "number")
            setReminderLeadMinutes(d.reminderLeadMinutes);
          if (typeof d.assignmentWaitMinutes === "number")
            setAssignmentWaitMinutes(d.assignmentWaitMinutes);
          if (typeof d.adminPortalUrl === "string")
            setAdminPortalUrl(d.adminPortalUrl);
          if (typeof d.companyPortalUrl === "string")
            setCompanyPortalUrl(d.companyPortalUrl);
        }
      })
      .catch(() => {});

    return () => {
      unsubReqs();
      unsubComps();
      unsubVehs();
    };
  }, []);

  const activeRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

  useEffect(() => {
    if (activeRequest?.assignedVehicleId) {
      setSelectedVehicleId(activeRequest.assignedVehicleId);
    } else {
      setSelectedVehicleId("");
    }
    if (!activeRequest) {
      setEligibleDrivers([]);
      setTripEvents([]);
      setTripIncidents([]);
      return;
    }

    const catId =
      activeRequest.vehicleCategory === "pickup"
        ? "pickup"
        : activeRequest.vehicleCategory === "microbus"
          ? "microbus"
          : "suv";
    const schedId = (activeRequest as any)?.scheduledTripId;
    const tripId = activeRequest.tripId;

    listEligibleDriversCallable({
      categoryId: catId,
      countryId: "sv",
      ...(schedId && !activeRequest.isImmediate
        ? { scheduledTripId: schedId }
        : tripId
          ? { tripId }
          : {}),
    })
      .then((res) => setEligibleDrivers(res.data?.drivers || []))
      .catch(() => setEligibleDrivers([]));

    const subjectId = tripId || schedId;
    if (subjectId) {
      listTripEventsCallable({ tripId: subjectId, limit: 25 })
        .then((res) => setTripEvents(res.data?.events || []))
        .catch(() => setTripEvents([]));

      listTripIncidentsCallable({ tripId: subjectId, limit: 20 })
        .then((res) => setTripIncidents(res.data?.incidents || []))
        .catch(() => setTripIncidents([]));
    }
  }, [activeRequest]);

  const [driverTelemetry, setDriverTelemetry] = useState<{
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    status?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeRequest?.assignedDriverId) {
      setDriverTelemetry(null);
      return;
    }
    // CF-55: telemetría activa en RTDB `conductores_activos/{driverId}`
    const activeDriverRef = ref(
      rtdb,
      `conductores_activos/${activeRequest.assignedDriverId}`
    );
    const unsub = onValue(activeDriverRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setDriverTelemetry({
          lat: typeof val.lat === "number" ? val.lat : val.latitude,
          lng: typeof val.lng === "number" ? val.lng : val.longitude,
          speed: val.speed,
          heading: val.bearing ?? val.heading,
          status: val.status,
        });
      } else {
        setDriverTelemetry(null);
      }
    });
    return () => unsub();
  }, [activeRequest?.assignedDriverId]);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (req.folio || "").toLowerCase().includes(q) ||
        (req.companyName || "").toLowerCase().includes(q) ||
        (req.origin?.address || "").toLowerCase().includes(q) ||
        (req.destination?.address || "").toLowerCase().includes(q) ||
        (req.assignedDriverName || "").toLowerCase().includes(q);

      const matchesCompany =
        companyFilter === "all" || req.companyId === companyFilter;
      const matchesStatus =
        statusFilter === "all" || req.status === statusFilter;

      return matchesSearch && matchesCompany && matchesStatus;
    });
  }, [requests, searchTerm, companyFilter, statusFilter]);

  const compatibleVehicles = useMemo(() => {
    if (!activeRequest) return [];
    return vehicles.filter(
      (v) =>
        v.status === "active" &&
        (v.category === activeRequest.vehicleCategory ||
          v.maxPassengers >= activeRequest.passengersCount)
    );
  }, [vehicles, activeRequest]);

  const handleAssignVehicle = async () => {
    if (!activeRequest || !selectedVehicleId) return;
    const veh = vehicles.find((v) => v.id === selectedVehicleId);
    if (!veh) return;

    setUpdating(true);
    try {
      await assignB2BRequestVehicleAndDriver(activeRequest.id, {
        driverId: veh.driverId || `drv${veh.id}`,
        driverName: veh.driverName || `Conductor ${veh.plate}`,
        driverPhone: veh.driverPhone || "+503 7000-0000",
        vehicleId: veh.id,
        vehiclePlate: veh.plate,
      });
      setFeedback({
        type: "success",
        message: `Unidad ${veh.plate} (${veh.driverName || "Conductor"}) asignada al traslado ${activeRequest.folio}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al asignar unidad.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleTransitionStatus = async (nextStatus: B2BRequestStatus) => {
    if (!activeRequest) return;
    setUpdating(true);
    try {
      if (nextStatus === "cancelled") {
        const res = await cancelB2BCompanyReservation(
          activeRequest.id,
          activeRequest.tripId
        );
        setFeedback({
          type: "success",
          message: `Reserva corporativa ${activeRequest.folio} cancelada. Saldo liberado del techo: $${Number(
            res.releasedAmount || activeRequest.finalAmount || 0
          ).toFixed(2)} USD.`,
        });
      } else {
        await updateB2BRequestStatus(activeRequest.id, nextStatus);
        setFeedback({
          type: "success",
          message: `Estado del servicio ${activeRequest.folio} actualizado en tiempo real.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al actualizar estado.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDriverUnavailable = async () => {
    if (!activeRequest) return;
    setUpdating(true);
    try {
      await withdrawB2BDriverAvailability(
        activeRequest.id,
        activeRequest.tripId,
        activeRequest.assignedDriverId
      );
      setFeedback({
        type: "success",
        message: `Conductor desvinculado (${activeRequest.folio} → seeking_driver). El techo de consumo de la empresa permanece intacto.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al reportar baja de conductor.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveIncident = async (incId: string) => {
    setResolvingIncidentId(incId);
    try {
      await resolveTripIncidentCallable({
        incidentId: incId,
        resolutionCode,
        ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      });
      setFeedback({
        type: "success",
        message: "Incidencia resuelta en el servidor.",
      });
      setResolutionNote("");
      const subjectId =
        activeRequest?.tripId || (activeRequest as any)?.scheduledTripId;
      if (subjectId) {
        const incRes = await listTripIncidentsCallable({
          tripId: subjectId,
          limit: 20,
        });
        setTripIncidents(incRes.data?.incidents || []);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.message || "No se pudo resolver la incidencia.",
      });
    } finally {
      setResolvingIncidentId(null);
    }
  };

  const handleSaveOperationsConfig = async () => {
    setSavingOps(true);
    try {
      await updateOperationsConfigCallable({
        deadTimeMinutes: Number(deadTimeMinutes),
        reminderLeadMinutes: Number(reminderLeadMinutes),
        assignmentWaitMinutes: Number(assignmentWaitMinutes),
        adminPortalUrl: adminPortalUrl.trim(),
        companyPortalUrl: companyPortalUrl.trim(),
        reason: opsReason.trim() || "Actualización operativa de plataforma",
      });
      setFeedback({
        type: "success",
        message:
          "Política operativa global (platformConfig/operations) actualizada correctamente (CF-49).",
      });
      setShowOpsConfig(false);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message:
          err?.message || "No se pudo actualizar platformConfig/operations.",
      });
    } finally {
      setSavingOps(false);
    }
  };

  const getActiveStepIndex = (status: B2BRequestStatus): number => {
    const idx = LIFECYCLE_STEPS.findIndex((s) => s.status === status);
    if (status === "invoiced") return LIFECYCLE_STEPS.length;
    return idx >= 0 ? idx : 0;
  };

  return (
    <PageContainer
      title="Solicitudes y Monitoreo B2B | Lilo El Salvador"
      description="Gestión y seguimiento en tiempo real de solicitudes de traslado corporativo"
    >
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          mb={3}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              Solicitudes y Monitoreo en Tiempo Real (H2.4 / H2.5)
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Seguimiento en vivo de estados (Solicitada → Asignada → En Camino → En Punto → En Curso → Completado)
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => setShowOpsConfig((v) => !v)}
            >
              {showOpsConfig ? "Ocultar Política Operativa" : "Política Operativa (CF-49)"}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<IconPlus size={18} />}
              onClick={() => router.push("/Solicitudes/nueva")}
            >
              Nueva Solicitud de Traslado
            </Button>
          </Stack>
        </Stack>

        {showOpsConfig && (
          <Card variant="outlined" sx={{ mb: 3, p: 2.5, bgcolor: "#f8fafc" }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Configuración Operativa de Plataforma (`platformConfig/operations` · CF-49)
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Tiempo Muerto (deadTimeMinutes)"
                  value={deadTimeMinutes}
                  onChange={(e) => setDeadTimeMinutes(Number(e.target.value))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Anticipación Recordatorio (reminderLeadMinutes)"
                  value={reminderLeadMinutes}
                  onChange={(e) =>
                    setReminderLeadMinutes(Number(e.target.value))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Espera Asignación (assignmentWaitMinutes)"
                  value={assignmentWaitMinutes}
                  onChange={(e) =>
                    setAssignmentWaitMinutes(Number(e.target.value))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL Portal Admin (https)"
                  value={adminPortalUrl}
                  onChange={(e) => setAdminPortalUrl(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL Portal Empresas (https)"
                  value={companyPortalUrl}
                  onChange={(e) => setCompanyPortalUrl(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Motivo del cambio *"
                    value={opsReason}
                    onChange={(e) => setOpsReason(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={savingOps}
                    onClick={handleSaveOperationsConfig}
                  >
                    Guardar
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Card>
        )}

        {feedback && (
          <Alert
            severity={feedback.type}
            sx={{ mb: 3 }}
            onClose={() => setFeedback(null)}
          >
            {feedback.message}
          </Alert>
        )}

        <DashboardCard>
          <Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              mb={3}
              justifyContent="space-between"
            >
              <TextField
                placeholder="Buscar por folio, empresa, origen, destino o conductor..."
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ minWidth: { xs: "100%", md: 360 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <IconSearch size={18} />
                    </InputAdornment>
                  ),
                }}
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  select
                  label="Empresa"
                  size="small"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="all">Todas las Empresas</MenuItem>
                  {companies.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.tradeName || c.legalName}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Estado"
                  size="small"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="all">Todos los estados</MenuItem>
                  <MenuItem value="requested">Solicitada</MenuItem>
                  <MenuItem value="seeking_driver">Buscando Conductor</MenuItem>
                  <MenuItem value="assigned">Conductor Asignado</MenuItem>
                  <MenuItem value="enRoute">En Camino al Origen</MenuItem>
                  <MenuItem value="driverArrived">Conductor en Punto</MenuItem>
                  <MenuItem value="inService">En Curso</MenuItem>
                  <MenuItem value="completed">Completado</MenuItem>
                  <MenuItem value="cancelled">Cancelado</MenuItem>
                </TextField>
              </Stack>
            </Stack>

            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress />
              </Box>
            ) : filteredRequests.length === 0 ? (
              <Box textAlign="center" py={6}>
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No hay solicitudes de traslado registradas
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<IconPlus size={18} />}
                  onClick={() => router.push("/Solicitudes/nueva")}
                  sx={{ mt: 1 }}
                >
                  Crear Primera Solicitud B2B
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0}>
                <Table sx={{ minWidth: 920 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Folio / Modalidad</TableCell>
                      <TableCell>Empresa / Centro de Costo</TableCell>
                      <TableCell>Ruta & Paradas</TableCell>
                      <TableCell>Vehículo & Pasajeros</TableCell>
                      <TableCell>Conductor Asignado</TableCell>
                      <TableCell align="right">Tarifa USD</TableCell>
                      <TableCell align="center">Estado en Vivo</TableCell>
                      <TableCell align="right">Monitoreo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRequests.map((req) => (
                      <TableRow key={req.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {req.folio}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {req.isImmediate ? "Inmediato" : "Programado"} ·{" "}
                            {req.roundTrip ? "Ida y Vuelta" : "Solo Ida"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {req.companyName}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {req.costCenterName || "General"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ maxWidth: 240 }}
                          >
                            <strong>Origen:</strong> {req.origin?.address}
                          </Typography>
                          {req.stops && req.stops.length > 0 && (
                            <Typography
                              variant="caption"
                              color="primary.main"
                              display="block"
                            >
                              + {req.stops.length} parada(s) intermedia(s)
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            color="textSecondary"
                            noWrap
                            sx={{ maxWidth: 240, display: "block" }}
                          >
                            <strong>Destino:</strong> {req.destination?.address}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              req.vehicleCategory === "microbus"
                                ? "warning"
                                : req.vehicleCategory === "pickup"
                                ? "secondary"
                                : "primary"
                            }
                            label={`${(
                              req.vehicleCategory || "suv"
                            ).toUpperCase()} · ${req.passengersCount} pax`}
                            sx={{ fontWeight: 600 }}
                          />
                          {req.hasCargo && (
                            <Typography
                              variant="caption"
                              color="warning.main"
                              display="block"
                              fontWeight={600}
                            >
                              Con Carga / Equipaje
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          {req.assignedDriverName ? (
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {req.assignedDriverName}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {req.assignedVehiclePlate} ·{" "}
                                {req.assignedDriverPhone}
                              </Typography>
                            </Box>
                          ) : (
                            <Chip
                              size="small"
                              label="Sin asignar"
                              color="warning"
                              variant="outlined"
                            />
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
                          <Typography variant="caption" color="textSecondary">
                            {req.estimatedDistanceKm} km
                          </Typography>
                        </TableCell>

                        <TableCell align="center">
                          <StatusBadge status={req.status} type="request" />
                        </TableCell>

                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setSelectedRequestId(req.id)}
                          >
                            Monitorear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DashboardCard>
      </Box>

      {/* Drawer de Monitoreo en Tiempo Real y Despacho (H2.5-FE) */}
      <Drawer
        anchor="right"
        open={Boolean(activeRequest)}
        onClose={() => setSelectedRequestId(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, p: 3 } }}
      >
        {activeRequest && (
          <Box>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  {activeRequest.folio}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {activeRequest.companyName} · CC:{" "}
                  {activeRequest.costCenterName || "General"}
                </Typography>
              </Box>
              <StatusBadge status={activeRequest.status} type="request" />
            </Stack>

            <Divider sx={{ mb: 2.5 }} />

            {/* Mapa de Monitoreo en Vivo (Google Maps API + RTDB) */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              Monitoreo en Vivo de Ruta y Unidad (Google Maps API)
            </Typography>
            <Box mb={2.5}>
              <GoogleTripTrackingMap
                origin={activeRequest.origin}
                destination={activeRequest.destination}
                stops={activeRequest.stops}
                driverLocation={driverTelemetry}
                driverName={activeRequest.assignedDriverName}
                vehiclePlate={activeRequest.assignedVehiclePlate}
                height={220}
              />
            </Box>

            {/* Stepper de Estado en Tiempo Real */}
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Línea de Tiempo en Vivo (Sincronizada con Firestore)
            </Typography>
            <Card variant="outlined" sx={{ mb: 3, bgcolor: "#f8fafc" }}>
              <CardContent>
                <Stepper
                  activeStep={getActiveStepIndex(activeRequest.status)}
                  orientation="vertical"
                >
                  {LIFECYCLE_STEPS.map((step) => (
                    <Step key={step.status}>
                      <StepLabel>{step.label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>

            {/* Asignación de Conductor + Unidad */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              Despacho: Asignar Unidad y Conductor ({activeRequest.vehicleCategory.toUpperCase()})
            </Typography>
            <Stack direction="row" spacing={1.5} mb={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Unidad Compatible Disponible"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <MenuItem value="">-- Seleccionar unidad --</MenuItem>
                {compatibleVehicles.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.plate} · {v.brand} {v.model} ({v.category.toUpperCase()}) —{" "}
                    {v.driverName || "Sin conductor"}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                disabled={!selectedVehicleId || updating}
                onClick={handleAssignVehicle}
              >
                Asignar
              </Button>
            </Stack>

            {/* Controles de transición de estado en tiempo real */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              Actualizar Estado Operativo en Tiempo Real
            </Typography>
            <Grid container spacing={1} mb={3}>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<IconPlayerPlay size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("enRoute")}
                >
                  En Camino al Origen
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<IconMapPin size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("driverArrived")}
                >
                  Conductor en Punto
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<IconCar size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("inService")}
                >
                  Iniciar Viaje (En Curso)
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<IconCheck size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("completed")}
                >
                  Marcar Completado
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={updating}
                  onClick={handleDriverUnavailable}
                >
                  Baja Conductor (`seeking_driver`)
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<IconX size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("cancelled")}
                >
                  Cancelar Reserva (Liberar Techo)
                </Button>
              </Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />

            {/* Detalles de Ruta, Paradas, Pasajeros y Tarifa */}
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  ORIGEN
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {activeRequest.origin?.address}
                </Typography>
              </Box>

              {activeRequest.stops && activeRequest.stops.length > 0 && (
                <Box>
                  <Typography variant="caption" color="primary.main" fontWeight={700}>
                    PARADAS INTERMEDIAS ({activeRequest.stops.length})
                  </Typography>
                  {activeRequest.stops.map((st, idx) => (
                    <Typography key={idx} variant="body2">
                      {idx + 1}. {st.address}
                    </Typography>
                  ))}
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="textSecondary">
                  DESTINO ({activeRequest.roundTrip ? "IDA Y VUELTA" : "SOLO IDA"})
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {activeRequest.destination?.address}
                </Typography>
              </Box>

              <Stack direction="row" spacing={2}>
                <Box flex={1}>
                  <Typography variant="caption" color="textSecondary">
                    PASAJEROS ({activeRequest.passengersCount})
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {(activeRequest.passengerNames || []).join(", ") ||
                      activeRequest.requestedByName}
                  </Typography>
                </Box>
                <Box flex={1}>
                  <Typography variant="caption" color="textSecondary">
                    CARGA / EQUIPAJE
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {activeRequest.hasCargo
                      ? activeRequest.cargoDescription || "Sí incluye carga"
                      : "Sin carga especial"}
                  </Typography>
                </Box>
              </Stack>

              <Alert severity="success" sx={{ mt: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Tarifa Oficial Aplicada: $
                  {Number(
                    activeRequest.finalAmount ??
                      activeRequest.tariffApplied?.calculatedAmount ??
                      0
                  ).toFixed(2)}{" "}
                  USD
                </Typography>
                <Typography variant="caption">
                  Distancia facturable: {activeRequest.estimatedDistanceKm} km ·
                  Tarifa/km: $
                  {Number(activeRequest.tariffApplied?.ratePerKm || 0.67).toFixed(
                    2
                  )}{" "}
                  · Mínimo: $
                  {Number(activeRequest.tariffApplied?.minFare || 13.56).toFixed(
                    2
                  )}
                </Typography>
              </Alert>

              {eligibleDrivers.length > 0 && (
                <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#f8fafc" }}>
                  <Typography variant="caption" fontWeight={700} color="primary">
                    CANDIDATOS ELEGIBLES VALIDADOS POR BACKEND (CF-57 · {eligibleDrivers.length})
                  </Typography>
                  <Stack spacing={0.5} mt={0.5}>
                    {eligibleDrivers.map((ed) => (
                      <Typography key={ed.vehicleId} variant="caption">
                        • <strong>{ed.name}</strong> ({ed.plate} · {ed.brand}{" "}
                        {ed.model}) — {ed.online ? "En línea" : "Desconectado"}
                      </Typography>
                    ))}
                  </Stack>
                </Card>
              )}

              {/* Incidencias (CF-63 / CF-64) y Bitácora de Eventos (CF-61) */}
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={700}>
                Incidencias del Traslado ({tripIncidents.length}) y Bitácora (CF-61 / CF-64)
              </Typography>

              {tripIncidents.length > 0 && (
                <Stack spacing={1}>
                  {tripIncidents.map((inc) => (
                    <Card
                      key={inc.incidentId}
                      variant="outlined"
                      sx={{ p: 1.5, bgcolor: "#fff8f6" }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography variant="caption" fontWeight={700}>
                          {inc.type.toUpperCase()} · Severidad: {inc.severity}
                        </Typography>
                        <Chip size="small" label={inc.status} color="warning" />
                      </Stack>
                      <Typography variant="body2" sx={{ my: 0.5 }}>
                        {inc.description}
                      </Typography>
                      {inc.status === "open" || inc.status === "under_review" ? (
                        <Stack spacing={1} mt={1}>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              select
                              size="small"
                              label="Resolución (CF-64)"
                              value={resolutionCode}
                              onChange={(e) =>
                                setResolutionCode(e.target.value as any)
                              }
                              sx={{ minWidth: 160 }}
                            >
                              <MenuItem value="no_action">Sin acción (Descartar)</MenuItem>
                              <MenuItem value="driver_warning">Advertencia conductor</MenuItem>
                              <MenuItem value="company_credit">Crédito empresa</MenuItem>
                              <MenuItem value="trip_cancelled">Viaje cancelado</MenuItem>
                              <MenuItem value="trip_refunded">Viaje reembolsado</MenuItem>
                              <MenuItem value="other">Otro</MenuItem>
                            </TextField>
                            <TextField
                              size="small"
                              fullWidth
                              label="Nota de resolución"
                              value={resolutionNote}
                              onChange={(e) => setResolutionNote(e.target.value)}
                            />
                            <Button
                              size="small"
                              variant="contained"
                              disabled={resolvingIncidentId === inc.incidentId}
                              onClick={() =>
                                handleResolveIncident(inc.incidentId)
                              }
                            >
                              Resolver
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="success.main">
                          Resuelta ({inc.resolutionCode}): {inc.resolutionNote}
                        </Typography>
                      )}
                    </Card>
                  ))}
                </Stack>
              )}

              {tripEvents.length > 0 && (
                <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#f8fafc" }}>
                  <Typography variant="caption" fontWeight={700} color="textSecondary">
                    BITÁCORA DE AUDITORÍA DEL SERVIDOR (CF-61 · {tripEvents.length})
                  </Typography>
                  <Stack spacing={0.5} mt={0.5}>
                    {tripEvents.map((ev) => (
                      <Typography key={ev.eventId} variant="caption">
                        • <strong>{ev.eventType}</strong>:{" "}
                        {ev.fromStatus ? `${ev.fromStatus} → ` : ""}
                        {ev.toStatus || ""} ({ev.actorType || "system"})
                      </Typography>
                    ))}
                  </Stack>
                </Card>
              )}
            </Stack>
          </Box>
        )}
      </Drawer>
    </PageContainer>
  );
};

export default B2BSolicitudesPage;
