"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from "@mui/material";
import {
  IconBuilding,
  IconPlus,
  IconSearch,
  IconEye,
  IconEdit,
  IconPhone,
  IconBrandWhatsapp,
  IconAdjustmentsHorizontal,
  IconInbox,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import {
  Alert,
  Chip,
  Switch,
  FormControlLabel,
} from "@mui/material";
import Link from "next/link";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import { B2BCompany } from "@/types/b2b";
import {
  getOperatingCountriesFromClaims,
  subscribeToB2BCompaniesByCountries,
  createB2BCompany,
  updateB2BCompany,
} from "@/services/b2b";
import {
  updateCompanyCapabilitiesCallable,
  listCostCentreRequestsCallable,
  resolveCostCentreRequestCallable,
  CostCentreRequestRow,
} from "@/utils/functions";
import StatusBadge from "../_components/StatusBadge";
import CompanyForm from "../_components/CompanyForm";
import toast from "react-hot-toast";
import { formatFriendlyError } from "@/utils/friendlyError";
import { useLanguage } from "@/contexts/LanguageContext";

export default function EmpresasPage() {
  const { isEn } = useLanguage();
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // La cuenta no declara países donde operar: no hay colección que consultar y
  // el estado vacío lo explica en vez de mostrar un permiso denegado.
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  // Cobertura incompleta: un país falló y sus filas faltan, pero las leídas se
  // muestran. No es `loadError`, que vacía el listado.
  const [coverageWarning, setCoverageWarning] = useState<string | null>(null);
  // Países que declara la cuenta (claim `countryIds`). La bandeja de solicitudes
  // de centros de costo trabaja de a UN país: con varios declarados el operador
  // elige cuál, y esa elección sobrevive a aprobar y rechazar.
  const [operatorCountries, setOperatorCountries] = useState<string[]>([]);
  // País de trabajo de la consola: el único declarado (o el primero) y, con
  // varios, el elegido en la bandeja. Es el país que se manda al callable
  // —que acepta uno solo— y el del alta, para no crear la empresa en `sv`.
  const [activeCountry, setActiveCountry] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<B2BCompany | null>(null);

  // G21: Capacidades de Reserva (CF-74)
  const [capModalOpen, setCapModalOpen] = useState(false);
  const [capCompany, setCapCompany] = useState<B2BCompany | null>(null);
  const [capImmediate, setCapImmediate] = useState(false);
  const [capScheduled, setCapScheduled] = useState(true);
  const [capLeadMinutes, setCapLeadMinutes] = useState(180);
  const [capReason, setCapReason] = useState("");
  const [savingCap, setSavingCap] = useState(false);

  // G23: Bandeja de Solicitudes de Centros de Costo (CF-84)
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);
  const [costCentreRequests, setCostCentreRequests] = useState<CostCentreRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReqForReject, setSelectedReqForReject] = useState<CostCentreRequestRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    getOperatingCountriesFromClaims()
      .then((operatingCountries) => {
        if (cancelled) return;

        setOperatorCountries(operatingCountries);
        setActiveCountry(operatingCountries[0] ?? "");

        if (operatingCountries.length === 0) {
          // Sin países declarados no se consulta ninguna colección: la regla la
          // denegaría. El mensaje lo dice en vez de afirmar una cartera vacía.
          setScopeNotice(
            "Tu cuenta no declara países donde operar. Pide a un administrador que asigne tu país para ver las empresas."
          );
          setLoadError(null);
          setLoading(false);
          return;
        }

        const stop = subscribeToB2BCompaniesByCountries(
          operatingCountries,
          (data) => {
            setCompanies(data);
            // Cualquier snapshot ENTREGADO prueba que la lectura funciona, incluso uno
            // vacio. La version anterior solo retiraba el aviso si habia documentos, y
            // eso dejaba una coleccion legitimamente vacia mostrando "no se pudo
            // cargar" para siempre despues de un error transitorio.
            setLoadError(null);
            setLoading(false);
          },
          (err) => {
            console.error("[EmpresasPage] Error suscribiéndose a empresas:", err);
            const friendlyMessage = formatFriendlyError(
              err,
              "No pudimos cargar el listado de empresas."
            );
            // El toast se agota en segundos; este estado se queda hasta que llegue
            // un snapshot nuevo, para que un rechazo de permisos no se vea nunca
            // como "no hay empresas".
            setLoadError(friendlyMessage);
            // La lista anterior tampoco sobrevive al aviso: mostrarla debajo de un
            // cartel que dice que no se pudo cargar contradice el mensaje y ofrece
            // filas que ya no sabemos si siguen vigentes. Sólo el fallo TOTAL la
            // vacía: un país denegado no borra las filas de los demás.
            setCompanies([]);
            setLoading(false);
            toast.error(friendlyMessage);
          },
          (failure) => {
            // Fallo PARCIAL: se conservan las filas de los países que respondieron
            // y el aviso explica qué cobertura falta. No toca `loadError` ni la
            // lista, que es justamente lo que el error total sí hace.
            const failed = failure.failedCountries
              .map((countryCode) => countryCode.toUpperCase())
              .join(", ");
            setCoverageWarning(
              `No pudimos cargar las empresas de ${failed}. El listado muestra solo las empresas de los países que respondieron.`
            );
          }
        );

        if (cancelled) {
          stop();
          return;
        }
        unsubscribe = stop;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[EmpresasPage] Error leyendo los países de la cuenta:", err);
        const friendlyMessage = formatFriendlyError(
          err,
          "No pudimos leer los países donde opera tu cuenta."
        );
        setLoadError(friendlyMessage);
        setCompanies([]);
        setLoading(false);
        toast.error(friendlyMessage);
      });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleOpenCreate = () => {
    setSelectedCompany(null);
    setOpenModal(true);
  };

  const handleOpenEdit = (company: B2BCompany) => {
    setSelectedCompany(company);
    setOpenModal(true);
  };

  const handleOpenCapabilities = (c: B2BCompany) => {
    setCapCompany(c);
    setCapImmediate(Boolean(c.allowsImmediateTrips));
    setCapScheduled(c.allowsScheduledTrips !== false);
    setCapLeadMinutes(c.minimumBookingLeadMinutes ?? 180);
    setCapReason("Ajuste operativo de capacidades");
    setCapModalOpen(true);
  };

  const handleSaveCapabilities = async () => {
    if (!capCompany) return;
    try {
      setSavingCap(true);
      await updateCompanyCapabilitiesCallable({
        companyId: capCompany.id,
        // El país va SIEMPRE: un administrador que opera más de un país no puede
        // dejar que el servidor adivine sobre qué empresa de qué país escribe.
        countryId: (capCompany.countryId || "sv").toLowerCase(),
        allowsImmediateTrips: capImmediate,
        allowsScheduledTrips: capScheduled,
        minimumBookingLeadMinutes: Number(capLeadMinutes) || 180,
        reason: capReason.trim() || undefined,
      });
      toast.success("Configuración operativa de la empresa actualizada con éxito.");
      setCapModalOpen(false);
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No se pudo actualizar la configuración de la empresa.")
      );
    } finally {
      setSavingCap(false);
    }
  };

  const loadCostCentreRequests = async (countryId: string) => {
    setLoadingRequests(true);
    try {
      const res = await listCostCentreRequestsCallable({
        countryId,
        status: "pending",
      });
      setCostCentreRequests(res.data?.requests || []);
    } catch (err: any) {
      toast.error(formatFriendlyError(err, "No se pudieron cargar las solicitudes pendientes."));
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleOpenRequests = async () => {
    setRequestsModalOpen(true);
    if (!activeCountry) {
      // Sin país declarado no hay ruta que listar: pedir el callable sin país lo
      // haría resolver contra el default del backend.
      setCostCentreRequests([]);
      return;
    }
    await loadCostCentreRequests(activeCountry);
  };

  // Cambiar el país de la bandeja relee ESA ruta. La elección queda en el estado
  // para que aprobar/rechazar resuelvan en el mismo país que se listó.
  const handleRequestsCountryChange = async (countryId: string) => {
    setActiveCountry(countryId);
    await loadCostCentreRequests(countryId);
  };

  const handleApproveRequest = async (req: CostCentreRequestRow) => {
    if (!activeCountry) {
      toast.error("No se pudo determinar el país de la solicitud.");
      return;
    }
    try {
      await resolveCostCentreRequestCallable({
        requestId: req.requestId,
        companyId: req.companyId,
        // El país elegido en la bandeja manda: la solicitud se resuelve en la
        // ruta que se listó, no en un `sv` de respaldo.
        countryId: activeCountry,
        decision: "approved",
      });
      toast.success("Solicitud aprobada y nuevo centro de costo habilitado.");
      handleOpenRequests();
    } catch (err: any) {
      toast.error(formatFriendlyError(err, "No se pudo aprobar la solicitud."));
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedReqForReject) return;
    if (!activeCountry) {
      toast.error("No se pudo determinar el país de la solicitud.");
      return;
    }
    if (!rejectionReason.trim()) {
      toast.error("Por favor ingresa el motivo del rechazo.");
      return;
    }
    try {
      await resolveCostCentreRequestCallable({
        requestId: selectedReqForReject.requestId,
        companyId: selectedReqForReject.companyId,
        // Mismo país elegido en la bandeja: rechazar no puede resolver en otra ruta.
        countryId: activeCountry,
        decision: "rejected",
        rejectionReason: rejectionReason.trim(),
      });
      toast.success("La solicitud de centro de costo fue rechazada.");
      setRejectModalOpen(false);
      setSelectedReqForReject(null);
      setRejectionReason("");
      handleOpenRequests();
    } catch (err: any) {
      toast.error(formatFriendlyError(err, "No se pudo rechazar la solicitud."));
    }
  };

  const handleSubmit = async (
    data: Omit<B2BCompany, "id" | "createdAt" | "updatedAt"> & { minimumBookingLeadMinutes?: number }
  ) => {
    try {
      if (selectedCompany) {
        // El país de la fila manda: el formulario arrastra un `countryId` heredado.
        await updateB2BCompany(selectedCompany.id, data, selectedCompany.countryId);
        toast.success("Datos de la empresa actualizados correctamente.");
      } else {
        await createB2BCompany(data);
        toast.success("Empresa registrada con éxito. Se envió el correo de activación al administrador.");
      }
      setOpenModal(false);
    } catch (err: any) {
      toast.error(formatFriendlyError(err, "No fue posible guardar los datos de la empresa."));
      throw err;
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.tradeName?.toLowerCase().includes(q) ||
      c.legalName?.toLowerCase().includes(q) ||
      c.nit?.includes(q) ||
      c.contactName?.toLowerCase().includes(q)
    );
  });

  // Un rechazo de lectura no es una colección vacía: sin este mensaje la tabla
  // afirmaba "no hay empresas ... todavía" sobre una lectura denegada. Una cuenta
  // sin países declarados tampoco tiene cartera que mostrar, y un fallo parcial
  // no permite afirmar que no hay empresas en el país que no respondió.
  const emptyMessage = scopeNotice
    ? scopeNotice
    : loadError
    ? "No se pudo cargar el listado de empresas."
    : coverageWarning
    ? "No hay empresas en los países que sí respondieron."
    : search
    ? "No se encontraron empresas con ese criterio de búsqueda."
    : "No hay empresas B2B registradas todavía.";

  // Con la lectura rechazada no se conoce ningún conteo ni saldo: mostrar 0 o
  // "0.00 USD" afirmaría que la cartera está vacía, que es la mentira que el
  // cliente reportó como "la empresa que creé no aparece".
  const metricValue = (value: string | number) => (loadError ? "—" : value);

  return (
    <PageContainer
      title="Empresas B2B | Lilo El Salvador"
      description="Gestión integral de empresas corporativas y cuentas B2B"
    >
      <Box sx={{ mb: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {isEn ? "B2B Companies (El Salvador)" : "Empresas B2B (El Salvador)"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isEn
                ? "Corporate clients directory and tariff management."
                : "Control y gestión de clientes corporativos B2B."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<IconInbox size={18} />}
              onClick={handleOpenRequests}
              sx={{ px: 2, py: 1 }}
            >
              Solicitudes de Centros (CF-84)
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<IconPlus size={18} />}
              onClick={handleOpenCreate}
              sx={{ px: 2.5, py: 1 }}
            >
              {isEn ? "New Company" : "Nueva Empresa"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* El permiso denegado se ve como aviso permanente y no como lista vacía */}
      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            No se pudo cargar el listado de empresas B2B
          </Typography>
          <Typography variant="body2">{loadError}</Typography>
        </Alert>
      )}

      {/* Cobertura parcial: faltan países, pero las filas leídas son válidas */}
      {coverageWarning && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Listado incompleto: no pudimos leer todos los países
          </Typography>
          <Typography variant="body2">{coverageWarning}</Typography>
        </Alert>
      )}

      {/* Métricas rápidas. Sin países declarados no hay cartera que medir: un 0
          afirmaría una cartera vacía que nadie leyó. */}
      {!scopeNotice && (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Empresas Registradas
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                {metricValue(companies.length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Empresas Activas
              </Typography>
              <Typography variant="h4" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
                {metricValue(companies.filter((c) => c.status === "active").length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Saldo Global por Cobrar
              </Typography>
              <Typography variant="h4" fontWeight={700} color="primary.main" sx={{ mt: 0.5 }}>
                {metricValue(
                  `$${companies
                    .reduce((acc, c) => acc + (c.balance || 0), 0)
                    .toFixed(2)} USD`
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}

      {/* Tabla con Búsqueda */}
      <DashboardCard title="Directorio Corporativo">
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar por nombre comercial, razón social, NIT o contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconSearch size={18} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading ? (
          <LinearProgress sx={{ my: 3 }} />
        ) : filteredCompanies.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <IconBuilding size={48} color="#94A3B8" />
            <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
              {emptyMessage}
            </Typography>
            {!search && !loadError && !scopeNotice && (
              <Button
                variant="outlined"
                sx={{ mt: 2 }}
                onClick={handleOpenCreate}
              >
                Crear Primera Empresa
              </Button>
            )}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Empresa / Razón Social</TableCell>
                  <TableCell>Plan y Esquema</TableCell>
                  <TableCell>NIT / NRC</TableCell>
                  <TableCell>Contacto</TableCell>
                  <TableCell>Condición de Pago</TableCell>
                  <TableCell align="right">Saldo Pendiente</TableCell>
                  <TableCell align="center">Estado</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCompanies.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {c.tradeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.legalName}
                        {c.countryId ? ` · ${c.countryId.toUpperCase()}` : ""}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        // La tarifa es POR CATEGORÍA (`fareRates/{categoryId}`). El
                        // número global (`negotiatedFareRate`) está deprecado y podía no
                        // coincidir con lo que el cotizador cobra: la lista no lo muestra
                        // más. El detalle por categoría vive en el formulario de edición.
                        label={
                          isEn ? "B2B · per category" : "Corporativo · por categoría"
                        }
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{c.nit}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        NRC: {c.nrc}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{c.contactName}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Tooltip title="Teléfono">
                          <IconPhone size={14} color="#64748B" />
                        </Tooltip>
                        <Typography variant="caption" color="text.secondary">
                          {c.phone}
                        </Typography>
                        {c.whatsapp && (
                          <Tooltip title={`WhatsApp: ${c.whatsapp}`}>
                            <IconBrandWhatsapp size={14} color="#22C55E" />
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ textTransform: "capitalize" }}>
                        {c.paymentCondition === "cash" && "Efectivo"}
                        {c.paymentCondition === "transfer" && "Transferencia"}
                        {c.paymentCondition === "card" && "Tarjeta"}
                        {c.paymentCondition === "credit_15" && "Crédito 15d"}
                        {c.paymentCondition === "credit_30" && "Crédito 30d"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="subtitle2"
                        fontWeight={700}
                        color={c.balance > 0 ? "error.main" : "text.primary"}
                      >
                        ${(c.balance || 0).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge status={c.status} type="company" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Ver Detalle y Estado de Cuenta">
                          <IconButton
                            size="small"
                            component={Link}
                            href={`/Empresas/${c.id}`}
                            color="primary"
                          >
                            <IconEye size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Editar Empresa">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEdit(c)}
                            color="default"
                          >
                            <IconEdit size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Capacidades de Reserva (CF-74)">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenCapabilities(c)}
                            color="secondary"
                          >
                            <IconAdjustmentsHorizontal size={18} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DashboardCard>

      {/* Modal Formulario */}
      <CompanyForm
        open={openModal}
        onClose={() => setOpenModal(false)}
        onSubmit={handleSubmit}
        initialData={selectedCompany}
        countryId={activeCountry}
      />

      {/* G21: Modal Capacidades de Reserva (CF-74) */}
      <Dialog
        open={capModalOpen}
        onClose={() => setCapModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            Capacidades de Reserva (CF-74)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {capCompany?.tradeName}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={capScheduled}
                  onChange={(e) => setCapScheduled(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Permitir Reservas Programadas
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    `allowsScheduledTrips` (D-23)
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={capImmediate}
                  onChange={(e) => setCapImmediate(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Permitir Viajes Inmediatos B2B
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    `allowsImmediateTrips` (CF-74 / D-18)
                  </Typography>
                </Box>
              }
            />

            <Box>
              <Typography variant="caption" fontWeight={600}>
                Anticipación Mínima de Reserva (minutos) *
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={capLeadMinutes}
                onChange={(e) => setCapLeadMinutes(Number(e.target.value))}
                helperText="Mínimo de anticipación exigido a la empresa (omisión 180 min)"
                sx={{ mt: 0.5 }}
              />
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={600}>
                Motivo del Cambio (Opcional)
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="Ej. Habilitación de viajes inmediatos bajo acuerdo piloto"
                value={capReason}
                onChange={(e) => setCapReason(e.target.value)}
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCapModalOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={savingCap}
            onClick={handleSaveCapabilities}
          >
            {savingCap ? "Guardando..." : "Guardar Capacidades"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* G23: Modal Bandeja de Solicitudes de Centros de Costo (CF-84) */}
      <Dialog
        open={requestsModalOpen}
        onClose={() => setRequestsModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconInbox size={22} color="#5D87FF" />
            <Typography variant="h6" fontWeight={700}>
              Solicitudes de Centros de Costo (`costCentreRequests` · CF-84)
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {operatorCountries.length > 1 && (
            <TextField
              select
              size="small"
              label="País de las solicitudes"
              value={activeCountry}
              onChange={(e) => handleRequestsCountryChange(e.target.value)}
              sx={{ mb: 2, minWidth: 220 }}
              helperText="Las solicitudes se leen y se resuelven en este país"
            >
              {operatorCountries.map((countryCode) => (
                <MenuItem key={countryCode} value={countryCode}>
                  {countryCode.toUpperCase()}
                </MenuItem>
              ))}
            </TextField>
          )}
          {loadingRequests ? (
            <LinearProgress sx={{ my: 3 }} />
          ) : costCentreRequests.length === 0 ? (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                No hay solicitudes de centros de costo pendientes de resolución.
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Empresa / ID</TableCell>
                    <TableCell>Nombre Propuesto</TableCell>
                    <TableCell align="right">Techo Propuesto</TableCell>
                    <TableCell>Solicitado Por</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {costCentreRequests.map((req) => (
                    <TableRow key={req.requestId}>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {companies.find((c) => c.id === req.companyId)?.tradeName || req.companyId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {req.requestId}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{req.proposedName}</TableCell>
                      <TableCell align="right">
                        {req.proposedBudgetLimit !== undefined && req.proposedBudgetLimit !== null
                          ? `$${Number(req.proposedBudgetLimit).toFixed(2)} USD`
                          : "SIN LÍMITE"}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {req.requestedBy}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<IconCheck size={14} />}
                            onClick={() => handleApproveRequest(req)}
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<IconX size={14} />}
                            onClick={() => {
                              setSelectedReqForReject(req);
                              setRejectionReason("");
                              setRejectModalOpen(true);
                            }}
                          >
                            Rechazar
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRequestsModalOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Rechazo con Motivo Obligatorio (CF-84) */}
      <Dialog
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Rechazar Solicitud de Centro de Costo</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            El backend exige un motivo explícito para rechazar una solicitud (CF-84).
          </Typography>
          <TextField
            fullWidth
            required
            multiline
            rows={3}
            placeholder="Motivo del rechazo (ej. Presupuesto fiscal corporativo no asignado)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRejectModalOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRejectRequest}
          >
            Confirmar Rechazo
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
