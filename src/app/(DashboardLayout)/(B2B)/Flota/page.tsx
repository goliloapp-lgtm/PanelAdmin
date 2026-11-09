"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Card,
  CardContent,
  Grid,
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
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  IconSearch,
  IconCar,
  IconTruck,
  IconBus,
  IconEye,
  IconUserCheck,
  IconIdBadge2,
  IconShieldCheck,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import StatusBadge from "../_components/StatusBadge";
import { B2BVehicle, VehicleCategory } from "@/types/b2b";
import { subscribeToB2BVehicles, updateB2BVehicle } from "@/services/b2b";
import {
  EL_SALVADOR_B2B_TARIFFS,
  DRIVER_SHARE_RATE,
  LILO_COMMISSION_RATE,
} from "@/utils/b2bPricing";
import { useLanguage } from "@/contexts/LanguageContext";
import toast from "react-hot-toast";
import { formatFriendlyError } from "@/utils/friendlyError";

const CATEGORY_CONFIG: Record<
  VehicleCategory,
  {
    labelEs: string;
    labelEn: string;
    badgeColor: "primary" | "secondary" | "warning";
    maxPax: number;
  }
> = {
  suv: {
    labelEs: "SUV (4 pasajeros)",
    labelEn: "SUV (4 passengers)",
    badgeColor: "primary",
    maxPax: 4,
  },
  pickup: {
    labelEs: "Pick-up Doble Cabina (4 pax)",
    labelEn: "Double-Cab Pickup (4 pax)",
    badgeColor: "secondary",
    maxPax: 4,
  },
  microbus: {
    labelEs: "Microbús (12 pasajeros)",
    labelEn: "Minibus / Van (12 passengers)",
    badgeColor: "warning",
    maxPax: 12,
  },
};

const B2BFlotaInventoryPage = () => {
  const { isEn } = useLanguage();
  const [vehicles, setVehicles] = useState<B2BVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedVehicle, setSelectedVehicle] = useState<B2BVehicle | null>(
    null
  );
  const [statusDraft, setStatusDraft] =
    useState<B2BVehicle["status"]>("active");
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    const unsubVehicles = subscribeToB2BVehicles(
      (data) => {
        setVehicles(data);
        setLoading(false);
      },
      () => {
        setError(
          isEn
            ? "Error loading vehicle fleet inventory."
            : "Error cargando el inventario de flota vehicular."
        );
        setLoading(false);
      }
    );

    return () => {
      unsubVehicles();
    };
  }, [isEn]);

  const kpis = useMemo(() => {
    return {
      total: vehicles.length,
      suv: vehicles.filter((v) => v.category === "suv").length,
      pickup: vehicles.filter((v) => v.category === "pickup").length,
      microbus: vehicles.filter((v) => v.category === "microbus").length,
      active: vehicles.filter((v) => v.status === "active").length,
    };
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (v.plate || "").toLowerCase().includes(q) ||
        (v.brand || "").toLowerCase().includes(q) ||
        (v.model || "").toLowerCase().includes(q) ||
        (v.driverName || "").toLowerCase().includes(q) ||
        (v.registrationNumber || "").toLowerCase().includes(q);

      const matchesCategory =
        categoryFilter === "all" || v.category === categoryFilter;
      const matchesStatus =
        statusFilter === "all" || v.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [vehicles, searchTerm, categoryFilter, statusFilter]);

  const handleOpenInspect = (vehicle: B2BVehicle) => {
    setSelectedVehicle(vehicle);
    setStatusDraft(vehicle.status || "active");
  };

  const handleUpdateInventoryStatus = async () => {
    if (!selectedVehicle) return;
    setSavingStatus(true);
    try {
      await updateB2BVehicle(selectedVehicle.id, { status: statusDraft });
      toast.success("Estado de la unidad actualizado correctamente.");
      setSelectedVehicle(null);
    } catch (err: any) {
      const msg = formatFriendlyError(
        err,
        "No se pudo actualizar el estado del vehículo en este momento."
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <PageContainer
      title={
        isEn
          ? "Vehicle Fleet Inventory | Lilo SuperAdmin"
          : "Inventario de Flota Vehicular | Lilo SuperAdmin"
      }
      description={
        isEn
          ? "Centralized vehicle inventory registered by drivers from the Lilo Driver App"
          : "Inventario centralizado de unidades vehiculares registradas por los conductores desde Lilo Driver App"
      }
    >
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          mb={2.5}
        >
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h4" fontWeight={700}>
                {isEn
                  ? "Vehicle Fleet Inventory (El Salvador)"
                  : "Inventario de Flota Vehicular (El Salvador)"}
              </Typography>
              <Chip
                color="info"
                size="small"
                label={isEn ? "Inventory Mode Only" : "Modo Inventario"}
                sx={{ fontWeight: 700 }}
              />
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
              {isEn
                ? "Drivers register their primary vehicle during onboarding and add extra vehicles from their profile. This panel operates strictly as a centralized vehicle inventory."
                : "Los conductores registran su primer vehículo en el alta de la app y añaden vehículos adicionales desde su perfil. Esta sección funciona únicamente como inventario de vehículos."}
            </Typography>
          </Box>

          <Chip
            icon={<IconShieldCheck size={18} />}
            color="success"
            variant="outlined"
            label={
              isEn
                ? `Fixed Split: ${Math.round(DRIVER_SHARE_RATE * 100)}% Driver / ${Math.round(LILO_COMMISSION_RATE * 100)}% Lilo`
                : `Esquema Fijo: ${Math.round(DRIVER_SHARE_RATE * 100)}% Conductor / ${Math.round(LILO_COMMISSION_RATE * 100)}% Lilo`
            }
            sx={{ fontWeight: 700, py: 2 }}
          />
        </Stack>

        <Alert severity="info" sx={{ mb: 3 }}>
          {isEn ? (
            <>
              <strong>Inventory & Tariff Policy:</strong> Vehicle units are registered directly by drivers in the Lilo App (initial onboarding + additional vehicles in Driver Profile).
            </>
          ) : (
            <>
              <strong>Política de Inventario:</strong> Las unidades son registradas por el conductor en la App (primer vehículo en registro inicial y vehículos adicionales desde su perfil).
            </>
          )}
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* KPIs de Inventario */}
        <Grid container spacing={2.5} mb={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="textSecondary" fontWeight={600}>
                      {isEn ? "TOTAL INVENTORY UNITS" : "TOTAL EN INVENTARIO"}
                    </Typography>
                    <Typography variant="h4" fontWeight={700}>
                      {kpis.total}
                    </Typography>
                    <Typography variant="caption" color="success.main" fontWeight={600}>
                      {kpis.active} {isEn ? "active units" : "unidades activas"}
                    </Typography>
                  </Box>
                  <IconCar size={34} color="#5D87FF" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="textSecondary" fontWeight={600}>
                      {isEn ? "SUV (MAX 4 PAX)" : "SUV (MÁX. 4 PAX)"}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="primary.main">
                      {kpis.suv}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      $0.67/km · Mín. $13.56 (20 km)
                    </Typography>
                  </Box>
                  <IconCar size={34} color="#1976d2" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="textSecondary" fontWeight={600}>
                      {isEn ? "DOUBLE-CAB PICKUP (4 PAX)" : "PICK-UP DOBLE CABINA (4 PAX)"}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="secondary.main">
                      {kpis.pickup}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      $0.67/km · Mín. $13.56 (20 km)
                    </Typography>
                  </Box>
                  <IconTruck size={34} color="#49BEFF" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="textSecondary" fontWeight={600}>
                      {isEn ? "MINIBUS / VAN (MAX 12 PAX)" : "MICROBÚS (MÁX. 12 PAX)"}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="warning.main">
                      {kpis.microbus}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      $0.90/km · Mín. $45.00 (50 km)
                    </Typography>
                  </Box>
                  <IconBus size={34} color="#FFAE1F" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <DashboardCard>
          <Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              mb={3}
              justifyContent="space-between"
            >
              <TextField
                placeholder={
                  isEn
                    ? "Search inventory by plate, brand, model, VMT card or driver..."
                    : "Buscar en inventario por placa, marca, modelo, tarjeta VMT o conductor..."
                }
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ minWidth: { xs: "100%", md: 380 } }}
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
                  label={isEn ? "Category" : "Categoría"}
                  size="small"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  sx={{ minWidth: 190 }}
                >
                  <MenuItem value="all">
                    {isEn ? "All categories" : "Todas las categorías"}
                  </MenuItem>
                  <MenuItem value="suv">SUV (4 pax)</MenuItem>
                  <MenuItem value="pickup">Pick-up (4 pax)</MenuItem>
                  <MenuItem value="microbus">
                    {isEn ? "Minibus (12 pax)" : "Microbús (12 pax)"}
                  </MenuItem>
                </TextField>

                <TextField
                  select
                  label={isEn ? "Inventory Status" : "Estado en Inventario"}
                  size="small"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  sx={{ minWidth: 175 }}
                >
                  <MenuItem value="all">{isEn ? "All" : "Todos"}</MenuItem>
                  <MenuItem value="active">
                    {isEn ? "Active / Available" : "Operativo"}
                  </MenuItem>
                  <MenuItem value="maintenance">
                    {isEn ? "Maintenance" : "En Taller"}
                  </MenuItem>
                  <MenuItem value="pendingDocs">
                    {isEn ? "Pending Docs" : "Docs Pendientes"}
                  </MenuItem>
                  <MenuItem value="inactive">
                    {isEn ? "Inactive" : "Fuera de Servicio"}
                  </MenuItem>
                </TextField>
              </Stack>
            </Stack>

            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress />
              </Box>
            ) : filteredVehicles.length === 0 ? (
              <Box textAlign="center" py={6}>
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  {isEn
                    ? "No vehicles found in inventory"
                    : "No se encontraron vehículos en el inventario"}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {isEn
                    ? "Vehicles registered by drivers during signup or from their profile appear here automatically."
                    : "Los vehículos registrados por los conductores en su alta o desde su perfil aparecerán aquí automáticamente."}
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0}>
                <Table sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Plate / Vehicle Specs" : "Placa / Especificaciones"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Category & Capacity" : "Categoría y Capacidad"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "VMT Circulation Card" : "Tarjeta de Circulación VMT"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Registered Driver Owner" : "Conductor Titular (App)"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Reference Tariff" : "Tarifa de Referencia"}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Status" : "Estado"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle2" fontWeight={600}>
                          {isEn ? "Inventory" : "Ficha"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredVehicles.map((vehicle) => {
                      const catInfo =
                        CATEGORY_CONFIG[vehicle.category] || CATEGORY_CONFIG.suv;
                      const tariff =
                        EL_SALVADOR_B2B_TARIFFS[vehicle.category] ||
                        EL_SALVADOR_B2B_TARIFFS.suv;

                      return (
                        <TableRow key={vehicle.id} hover>
                          <TableCell>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {vehicle.plate}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {vehicle.brand} {vehicle.model} ({vehicle.year}) ·{" "}
                              {vehicle.color}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Chip
                              label={isEn ? catInfo.labelEn : catInfo.labelEs}
                              color={catInfo.badgeColor}
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <IconIdBadge2 size={17} color="#0284c7" />
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {vehicle.registrationNumber || "TC-SV-VIGENTE"}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                  {isEn ? "Expires:" : "Vence:"}{" "}
                                  {vehicle.registrationExpiresAt || "2027-12-31"}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>

                          <TableCell>
                            {vehicle.driverName ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <IconUserCheck size={17} color="#2e7d32" />
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>
                                    {vehicle.driverName}
                                  </Typography>
                                  <Typography variant="caption" color="textSecondary">
                                    {vehicle.driverPhone || "App Driver"}
                                  </Typography>
                                </Box>
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="textSecondary">
                                {isEn ? "Registered in Pool" : "Registrado en Pool"}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              ${tariff.ratePerKm.toFixed(2)} / km · Mín. $
                              {tariff.minFare.toFixed(2)}
                            </Typography>
                          </TableCell>

                          <TableCell align="center">
                            <StatusBadge status={vehicle.status} type="vehicle" />
                          </TableCell>

                          <TableCell align="right">
                            <Tooltip
                              title={
                                isEn
                                  ? "Inspect Vehicle Record"
                                  : "Ver Ficha de Inventario"
                              }
                            >
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleOpenInspect(vehicle)}
                              >
                                <IconEye size={18} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DashboardCard>
      </Box>

      {/* Modal de Ficha Técnica de Inventario */}
      <Dialog
        open={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {isEn
            ? `Vehicle Inventory Record — ${selectedVehicle?.plate || ""}`
            : `Ficha de Inventario Vehicular — ${selectedVehicle?.plate || ""}`}
        </DialogTitle>
        <DialogContent dividers>
          {selectedVehicle && (
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "License Plate" : "Placa"}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {selectedVehicle.plate}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "Brand & Model" : "Marca y Modelo"}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {selectedVehicle.brand} {selectedVehicle.model} (
                    {selectedVehicle.year})
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "Color" : "Color"}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedVehicle.color}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "Max Passenger Capacity" : "Capacidad Máxima"}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedVehicle.maxPassengers}{" "}
                    {isEn ? "passengers" : "pasajeros"}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "Driver Owner" : "Conductor Titular"}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedVehicle.driverName || "N/A"}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="textSecondary">
                    {isEn ? "Driver Phone" : "Teléfono Conductor"}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedVehicle.driverPhone || "N/A"}
                  </Typography>
                </Grid>
              </Grid>

              <Divider />

              <TextField
                select
                fullWidth
                size="small"
                label={
                  isEn
                    ? "Operational Inventory Status"
                    : "Estado Operativo en Inventario"
                }
                value={statusDraft}
                onChange={(e) =>
                  setStatusDraft(e.target.value as B2BVehicle["status"])
                }
              >
                <MenuItem value="active">
                  {isEn ? "Active / Available" : "Operativo"}
                </MenuItem>
                <MenuItem value="maintenance">
                  {isEn ? "In Maintenance" : "En Taller / Mantenimiento"}
                </MenuItem>
                <MenuItem value="pendingDocs">
                  {isEn ? "Pending Documents" : "Documentos Pendientes"}
                </MenuItem>
                <MenuItem value="inactive">
                  {isEn ? "Inactive" : "Fuera de Servicio"}
                </MenuItem>
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSelectedVehicle(null)} color="inherit">
            {isEn ? "Close" : "Cerrar"}
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdateInventoryStatus}
            disabled={savingStatus}
          >
            {savingStatus
              ? isEn
                ? "Saving..."
                : "Guardando..."
              : isEn
              ? "Update Status"
              : "Actualizar Estado"}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default B2BFlotaInventoryPage;
