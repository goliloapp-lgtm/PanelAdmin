"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  IconFileCheck,
  IconFileAlert,
  IconCheck,
  IconX,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconEye,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import StatusBadge from "../_components/StatusBadge";
import {
  B2BCompany,
  DocumentRequirement,
  DriverDocumentRecord,
  DriverVerificationDossier,
  RejectionReasonCode,
  VehicleCategory,
} from "@/types/b2b";
import {
  subscribeToDocumentRequirementsSV,
  subscribeToDriverDossiersSV,
  subscribeToB2BCompanies,
  reviewDriverDocumentSV,
  createB2BDriverDossierSV,
  REJECTION_REASONS_CATALOG,
} from "@/services/b2b";

const B2BDocumentosSVPage = () => {
  const [tab, setTab] = useState(0);
  const [dossiers, setDossiers] = useState<DriverVerificationDossier[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Expediente seleccionado para inspección detallada por documento
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(
    null
  );

  // Modal de rechazo de un documento específico
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    driverId: string;
    docItem: DriverDocumentRecord | null;
    reason: RejectionReasonCode;
    note: string;
  }>({
    open: false,
    driverId: "",
    docItem: null,
    reason: "illegible",
    note: "",
  });

  // Modal para registrar un nuevo conductor en la bandeja documental SV
  const [newDriverModal, setNewDriverModal] = useState(false);
  const [newDriverForm, setNewDriverForm] = useState({
    driverName: "",
    driverEmail: "",
    driverPhone: "+503 ",
    dui: "",
    companyId: "",
    vehiclePlate: "",
    vehicleCategory: "suv" as VehicleCategory,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubDossiers = subscribeToDriverDossiersSV(
      (data) => {
        setDossiers(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubReqs = subscribeToDocumentRequirementsSV((data) => {
      setRequirements(data);
    });

    const unsubCompanies = subscribeToB2BCompanies((data) => {
      setCompanies(data);
    });

    return () => {
      unsubDossiers();
      unsubReqs();
      unsubCompanies();
    };
  }, []);

  const activeDossier =
    dossiers.find((d) => d.driverId === selectedDossierId) || null;

  const handleApproveSingleDocument = async (
    driverId: string,
    docItem: DriverDocumentRecord
  ) => {
    setSubmitting(true);
    try {
      await reviewDriverDocumentSV({
        driverId,
        documentType: docItem.type,
        decision: "approved",
      });
      setFeedback({
        type: "success",
        message: `Documento "${docItem.name}" aprobado. Los demás documentos mantienen su estado individual.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al aprobar el documento.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRejectModal = (
    driverId: string,
    docItem: DriverDocumentRecord
  ) => {
    setRejectDialog({
      open: true,
      driverId,
      docItem,
      reason: docItem.rejectionReason || "illegible",
      note: docItem.rejectionNote || "",
    });
  };

  const handleConfirmRejectDocument = async () => {
    if (!rejectDialog.docItem) return;
    setSubmitting(true);
    try {
      await reviewDriverDocumentSV({
        driverId: rejectDialog.driverId,
        documentType: rejectDialog.docItem.type,
        decision: "rejected",
        rejectionReason: rejectDialog.reason,
        rejectionNote: rejectDialog.note,
      });
      setFeedback({
        type: "success",
        message: `Documento "${rejectDialog.docItem.name}" rechazado con motivo. Los documentos previamente aprobados permanecen válidos.`,
      });
      setRejectDialog({
        open: false,
        driverId: "",
        docItem: null,
        reason: "illegible",
        note: "",
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al rechazar el documento.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDriverDossier = async () => {
    if (!newDriverForm.driverName.trim() || !newDriverForm.dui.trim()) {
      setFeedback({
        type: "error",
        message: "Nombre del conductor y número de DUI son obligatorios.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const comp = companies.find((c) => c.id === newDriverForm.companyId);
      const createdId = await createB2BDriverDossierSV({
        driverName: newDriverForm.driverName.trim(),
        driverEmail: newDriverForm.driverEmail.trim(),
        driverPhone: newDriverForm.driverPhone.trim(),
        dui: newDriverForm.dui.trim(),
        companyId: comp?.id,
        companyName: comp ? comp.tradeName || comp.legalName : undefined,
        vehiclePlate: newDriverForm.vehiclePlate.trim(),
        vehicleCategory: newDriverForm.vehicleCategory,
      });
      setNewDriverModal(false);
      setSelectedDossierId(createdId);
      setFeedback({
        type: "success",
        message: "Expediente documental El Salvador creado correctamente.",
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al crear el expediente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Verificación Documental El Salvador | Lilo B2B"
      description="Aprobación y rechazo individual por documento para conductores y vehículos B2B en El Salvador"
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
              Módulo Documental El Salvador (H2.1 / H2.2)
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Revisión individual por documento (DUI, Licencia SERTRACEN, Tarjeta Circulación VMT, Solvencia PNC, Póliza) sin invalidar documentos ya aprobados
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<IconPlus size={18} />}
              onClick={() => setNewDriverModal(true)}
            >
              Nuevo Expediente Conductor
            </Button>
          </Stack>
        </Stack>

        {feedback && (
          <Alert
            severity={feedback.type}
            sx={{ mb: 3 }}
            onClose={() => setFeedback(null)}
          >
            {feedback.message}
          </Alert>
        )}

        <Paper elevation={0} sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs value={tab} onChange={(_, val) => setTab(val)}>
            <Tab
              icon={<IconShieldCheck size={18} />}
              iconPosition="start"
              label={`Bandeja de Revisión por Documento (${dossiers.length})`}
            />
            <Tab
              icon={<IconFileCheck size={18} />}
              iconPosition="start"
              label={`Catálogo Requisitos El Salvador (${requirements.length})`}
            />
          </Tabs>
        </Paper>

        {tab === 0 && (
          <DashboardCard>
            <Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                <strong>Regla Operativa El Salvador:</strong> Cada documento se evalúa de forma independiente (
                <em>En revisión</em>, <em>Aprobado</em> o <em>Rechazado con motivo</em>). Rechazar un documento
                específico <strong>no rechaza los documentos ya aprobados</strong>; el conductor solo debe re-subir el
                documento observado desde la App Conductor.
              </Alert>

              {loading ? (
                <Box display="flex" justifyContent="center" py={6}>
                  <CircularProgress />
                </Box>
              ) : dossiers.length === 0 ? (
                <Box textAlign="center" py={6}>
                  <Typography variant="h6" color="textSecondary" gutterBottom>
                    No hay expedientes de conductores registrados
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<IconPlus size={18} />}
                    onClick={() => setNewDriverModal(true)}
                    sx={{ mt: 1 }}
                  >
                    Registrar Expediente de Conductor SV
                  </Button>
                </Box>
              ) : (
                <TableContainer component={Paper} elevation={0}>
                  <Table sx={{ minWidth: 850 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={600}>
                            Conductor / DUI
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={600}>
                            Unidad / Empresa B2B
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={600}>
                            Progreso por Documento (5 Requisitos SV)
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="subtitle2" fontWeight={600}>
                            Estado Expediente
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="subtitle2" fontWeight={600}>
                            Acción
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dossiers.map((dossier) => {
                        const approvedCount = dossier.documents.filter(
                          (d) => d.status === "approved"
                        ).length;
                        const rejectedCount = dossier.documents.filter(
                          (d) => d.status === "rejected"
                        ).length;

                        return (
                          <TableRow key={dossier.driverId} hover>
                            <TableCell>
                              <Typography variant="subtitle2" fontWeight={700}>
                                {dossier.driverName}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                DUI: {dossier.dui || "Pendiente"} ·{" "}
                                {dossier.driverPhone || "Sin teléfono"}
                              </Typography>
                            </TableCell>

                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>
                                {dossier.vehiclePlate
                                  ? `${dossier.vehiclePlate} (${(
                                      dossier.vehicleCategory || "suv"
                                    ).toUpperCase()})`
                                  : "Unidad por asignar"}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                {dossier.companyName || "Pool General SV"}
                              </Typography>
                            </TableCell>

                            <TableCell>
                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip
                                  size="small"
                                  color="success"
                                  variant={approvedCount > 0 ? "filled" : "outlined"}
                                  label={`${approvedCount}/5 Aprobados`}
                                />
                                {rejectedCount > 0 && (
                                  <Chip
                                    size="small"
                                    color="error"
                                    label={`${rejectedCount} Observado(s)`}
                                  />
                                )}
                              </Stack>
                            </TableCell>

                            <TableCell align="center">
                              <StatusBadge
                                status={dossier.overallStatus}
                                type="document"
                              />
                            </TableCell>

                            <TableCell align="right">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<IconEye size={16} />}
                                onClick={() =>
                                  setSelectedDossierId(dossier.driverId)
                                }
                              >
                                Evaluar Documentos
                              </Button>
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
        )}

        {tab === 1 && (
          <DashboardCard
            title="Catálogo Oficial de Requisitos Documentales (El Salvador)"
            subtitle="Colección Firestore: documentRequirements (countryId = 'sv')"
          >
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Orden</TableCell>
                    <TableCell>Código Técnico</TableCell>
                    <TableCell>Nombre Oficial del Documento</TableCell>
                    <TableCell>Aplica a</TableCell>
                    <TableCell>Control de Vigencia</TableCell>
                    <TableCell align="center">Obligatorio</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requirements.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>{req.order}</TableCell>
                      <TableCell>
                        <Chip
                          label={req.code}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: "monospace" }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {req.name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {req.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            req.appliesTo === "driver" ? "primary" : "secondary"
                          }
                          label={
                            req.appliesTo === "driver" ? "Conductor" : "Vehículo"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {req.requiresExpirationDate
                          ? "Exige Fecha de Vencimiento"
                          : "No vence"}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          color={req.required ? "success" : "default"}
                          label={req.required ? "Obligatorio SV" : "Opcional"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DashboardCard>
        )}
      </Box>

      {/* Modal de Inspección por Documento Individual */}
      <Dialog
        open={Boolean(activeDossier)}
        onClose={() => setSelectedDossierId(null)}
        maxWidth="md"
        fullWidth
      >
        {activeDossier && (
          <>
            <DialogTitle>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Expediente Documental: {activeDossier.driverName}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    DUI: {activeDossier.dui || "N/A"} · Unidad:{" "}
                    {activeDossier.vehiclePlate || "Sin placa"} · Empresa:{" "}
                    {activeDossier.companyName || "Pool General SV"}
                  </Typography>
                </Box>
                <StatusBadge
                  status={activeDossier.overallStatus}
                  type="document"
                />
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                {activeDossier.documents.map((docItem) => (
                  <Grid size={{ xs: 12 }} key={docItem.type}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderLeft: "5px solid",
                        borderLeftColor:
                          docItem.status === "approved"
                            ? "success.main"
                            : docItem.status === "rejected"
                            ? "error.main"
                            : "warning.main",
                      }}
                    >
                      <CardContent sx={{ py: 2 }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          spacing={2}
                        >
                          <Box flex={1}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              mb={0.5}
                            >
                              <Typography variant="subtitle1" fontWeight={700}>
                                {docItem.name}
                              </Typography>
                              <Chip
                                size="small"
                                variant="outlined"
                                label={
                                  docItem.appliesTo === "driver"
                                    ? "Conductor"
                                    : "Vehículo"
                                }
                              />
                              <StatusBadge
                                status={docItem.status}
                                type="document"
                              />
                            </Stack>

                            <Typography variant="caption" color="textSecondary" display="block">
                              Código: <code>{docItem.type}</code> · Vigencia:{" "}
                              {docItem.expirationDate || "2027-12-31"}
                            </Typography>

                            {docItem.status === "rejected" && (
                              <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>
                                <strong>Motivo de rechazo ({docItem.rejectionReason}):</strong>{" "}
                                {docItem.rejectionReasonLabel || "Documento observado"}
                                {docItem.rejectionNote
                                  ? ` — "${docItem.rejectionNote}"`
                                  : ""}
                              </Alert>
                            )}
                          </Box>

                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant={
                                docItem.status === "approved"
                                  ? "contained"
                                  : "outlined"
                              }
                              color="success"
                              startIcon={<IconCheck size={16} />}
                              disabled={
                                submitting || docItem.status === "approved"
                              }
                              onClick={() =>
                                handleApproveSingleDocument(
                                  activeDossier.driverId,
                                  docItem
                                )
                              }
                            >
                              {docItem.status === "approved"
                                ? "Aprobado"
                                : "Aprobar"}
                            </Button>

                            <Button
                              size="small"
                              variant={
                                docItem.status === "rejected"
                                  ? "contained"
                                  : "outlined"
                              }
                              color="error"
                              startIcon={<IconX size={16} />}
                              disabled={submitting}
                              onClick={() =>
                                handleOpenRejectModal(
                                  activeDossier.driverId,
                                  docItem
                                )
                              }
                            >
                              Rechazar con Motivo
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setSelectedDossierId(null)}>Cerrar</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Modal para seleccionar motivo de rechazo individual */}
      <Dialog
        open={rejectDialog.open}
        onClose={() =>
          setRejectDialog((prev) => ({ ...prev, open: false }))
        }
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: "error.main" }}>
          Rechazar Documento Individual
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Alert severity="warning">
              Solo se rechazará{" "}
              <strong>{rejectDialog.docItem?.name}</strong>. Los demás
              documentos aprobados del conductor conservarán su validez.
            </Alert>

            <TextField
              select
              fullWidth
              label="Motivo Oficial de Rechazo *"
              value={rejectDialog.reason}
              onChange={(e) =>
                setRejectDialog({
                  ...rejectDialog,
                  reason: e.target.value as RejectionReasonCode,
                })
              }
            >
              {REJECTION_REASONS_CATALOG.map((item) => (
                <MenuItem key={item.code} value={item.code}>
                  {item.label} ({item.code})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Instrucción adicional para el conductor (Opcional)"
              placeholder="Ej. Por favor toma la fotografía del reverso de la Tarjeta de Circulación sin reflejos de flash."
              value={rejectDialog.note}
              onChange={(e) =>
                setRejectDialog({ ...rejectDialog, note: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() =>
              setRejectDialog((prev) => ({ ...prev, open: false }))
            }
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmRejectDocument}
            disabled={submitting}
          >
            Confirmar Rechazo Individual
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Nuevo Expediente Conductor */}
      <Dialog
        open={newDriverModal}
        onClose={() => setNewDriverModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Registrar Expediente Documental de Conductor (SV)
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              fullWidth
              label="Nombre Completo del Conductor *"
              value={newDriverForm.driverName}
              onChange={(e) =>
                setNewDriverForm({
                  ...newDriverForm,
                  driverName: e.target.value,
                })
              }
            />
            <TextField
              fullWidth
              label="Número de DUI (00000000-0) *"
              placeholder="04829103-4"
              value={newDriverForm.dui}
              onChange={(e) =>
                setNewDriverForm({ ...newDriverForm, dui: e.target.value })
              }
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Teléfono (+503)"
                value={newDriverForm.driverPhone}
                onChange={(e) =>
                  setNewDriverForm({
                    ...newDriverForm,
                    driverPhone: e.target.value,
                  })
                }
              />
              <TextField
                fullWidth
                label="Correo Electrónico"
                value={newDriverForm.driverEmail}
                onChange={(e) =>
                  setNewDriverForm({
                    ...newDriverForm,
                    driverEmail: e.target.value,
                  })
                }
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Placa del Vehículo"
                placeholder="P-849201"
                value={newDriverForm.vehiclePlate}
                onChange={(e) =>
                  setNewDriverForm({
                    ...newDriverForm,
                    vehiclePlate: e.target.value,
                  })
                }
              />
              <TextField
                select
                fullWidth
                label="Categoría Vehicular"
                value={newDriverForm.vehicleCategory}
                onChange={(e) =>
                  setNewDriverForm({
                    ...newDriverForm,
                    vehicleCategory: e.target.value as VehicleCategory,
                  })
                }
              >
                <MenuItem value="suv">SUV (4 pax)</MenuItem>
                <MenuItem value="pickup">Pick-up Doble Cabina (4 pax)</MenuItem>
                <MenuItem value="microbus">Microbús (12 pax)</MenuItem>
              </TextField>
            </Stack>
            <TextField
              select
              fullWidth
              label="Empresa B2B Asociada"
              value={newDriverForm.companyId}
              onChange={(e) =>
                setNewDriverForm({
                  ...newDriverForm,
                  companyId: e.target.value,
                })
              }
            >
              <MenuItem value="">Pool General Corporativo SV</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.tradeName || c.legalName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setNewDriverModal(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreateDriverDossier}
            disabled={submitting}
          >
            Crear Expediente con 5 Requisitos SV
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default B2BDocumentosSVPage;
