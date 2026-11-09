"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  LinearProgress,
  Chip,
  Box,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
} from "@mui/material";
import {
  IconPlus,
  IconBuildingCommunity,
  IconEdit,
  IconHistory,
} from "@tabler/icons-react";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";
import { CostCenter, LimitRequest } from "@/types/b2b";
import {
  getCostCenters,
  createCostCenter,
  updateCostCenter,
  getLimitRequests,
  recordLimitRequestAudit,
} from "@/services/b2b";
import toast from "react-hot-toast";
import { formatFriendlyError } from "@/utils/friendlyError";

interface CostCenterManagerProps {
  companyId: string;
}

export const CostCenterManager: React.FC<CostCenterManagerProps> = ({
  companyId,
}) => {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [limitRequests, setLimitRequests] = useState<LimitRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit Modal
  const [openModal, setOpenModal] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [budgetLimitInput, setBudgetLimitInput] = useState<string>("2500");
  const [changeReason, setChangeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCostCentersAndAudit = async () => {
    try {
      setLoading(true);
      const [centersData, auditData] = await Promise.all([
        getCostCenters(companyId),
        getLimitRequests(companyId),
      ]);
      setCostCenters(centersData);
      setLimitRequests(auditData);
    } catch (err) {
      console.error("Error fetching cost centers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchCostCentersAndAudit();
    }
  }, [companyId]);

  const handleOpenCreate = () => {
    setEditingCenter(null);
    setName("");
    setDepartment("");
    setIsUnlimited(false);
    setBudgetLimitInput("2500");
    setChangeReason("");
    setOpenModal(true);
  };

  const handleOpenEdit = (cc: CostCenter) => {
    setEditingCenter(cc);
    setName(cc.name);
    setDepartment(cc.name);
    const unlimited = cc.budgetLimit === null || cc.budgetLimit === undefined;
    setIsUnlimited(unlimited);
    setBudgetLimitInput(unlimited ? "" : String(cc.budgetLimit));
    setChangeReason("Ajuste directo de techo corporativo (CF-81)");
    setOpenModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Por favor ingresa el nombre del centro de costo.");
      return;
    }

    // CF-23 / CF-81: null = SIN LÍMITE. Jamás usar Number(val) || 0.
    let parsedLimit: number | null = null;
    if (!isUnlimited) {
      const numeric = Number(budgetLimitInput);
      if (!Number.isFinite(numeric) || numeric < 0) {
        toast.error("Ingresa un presupuesto válido o selecciona 'Sin límite'.");
        return;
      }
      parsedLimit = numeric;
    }

    try {
      setSubmitting(true);
      if (editingCenter) {
        await updateCostCenter(
          companyId,
          editingCenter.id,
          {
            name: name.trim(),
            budgetLimit: parsedLimit,
          },
          changeReason.trim() || "Ajuste directo de techo corporativo"
        );
        toast.success("Límite de presupuesto actualizado correctamente.");
      } else {
        await createCostCenter(companyId, {
          name: name.trim(),
          department: name.trim(),
          budgetLimit: parsedLimit,
          spent: 0,
          reserved: 0,
          status: "active",
        });
        toast.success("Centro de costo creado con éxito.");
      }
      setOpenModal(false);
      fetchCostCentersAndAudit();
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No se pudo guardar el centro de costo.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconBuildingCommunity size={22} color="#1976D2" />
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Techo Único de Consumo Corporativo & Centros de Costo (CF-23)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                `budgetLimit: null` = Sin límite · `spent` (completados) + `reserved` (en curso) se reinician automáticamente al cambiar de ventana de facturación.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            startIcon={<IconPlus size={16} />}
            onClick={handleOpenCreate}
          >
            Nuevo Techo / Centro
          </Button>
        </Stack>

        {loading ? (
          <LinearProgress sx={{ my: 2 }} />
        ) : costCenters.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", bgcolor: "grey.50", borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No hay centros de costo registrados para esta empresa.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre / Centro</TableCell>
                  <TableCell>Cadencia</TableCell>
                  <TableCell align="right">Techo del Ciclo</TableCell>
                  <TableCell align="right">Gastado + Reservado</TableCell>
                  <TableCell align="center">Estado</TableCell>
                  <TableCell align="right">Ajustar Techo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {costCenters.map((cc) => {
                  const isNoLimit =
                    cc.budgetLimit === null || cc.budgetLimit === undefined;
                  const spent = Number(cc.spent || 0);
                  const reserved = Number(cc.reserved || 0);
                  const committed = spent + reserved;
                  const percent =
                    !isNoLimit && Number(cc.budgetLimit) > 0
                      ? Math.min(
                          100,
                          Math.round((committed / Number(cc.budgetLimit)) * 100)
                        )
                      : !isNoLimit && Number(cc.budgetLimit) === 0
                        ? 100
                        : 0;

                  const isActive =
                    cc.active !== false &&
                    cc.status !== "inactive";

                  return (
                    <TableRow key={cc.id}>
                      <TableCell sx={{ fontWeight: 500 }}>{cc.name}</TableCell>
                      <TableCell>{cc.budgetPeriod || "Mensual"}</TableCell>
                      <TableCell align="right">
                        {isNoLimit ? (
                          <Chip
                            label="SIN LÍMITE"
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        ) : (
                          <Typography variant="body2" fontWeight={700}>
                            ${Number(cc.budgetLimit).toFixed(2)} USD
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          ${spent.toFixed(2)} gastado · ${reserved.toFixed(2)} reservado
                          {!isNoLimit ? ` (${percent}%)` : ""}
                        </Typography>
                        {!isNoLimit && (
                          <LinearProgress
                            variant="determinate"
                            value={percent}
                            color={percent > 85 ? "error" : "primary"}
                            sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={isActive ? "Activo" : "Inactivo"}
                          size="small"
                          color={isActive ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<IconEdit size={15} />}
                          onClick={() => handleOpenEdit(cc)}
                        >
                          Editar techo
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Historial de Auditoría `costCentreHistory` (D-41 / CF-81) */}
        {limitRequests.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <IconHistory size={18} color="#64748b" />
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                Historial de Cambios de Techo (`costCentreHistory`)
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {limitRequests.slice(0, 5).map((req) => (
                <Alert
                  key={req.id}
                  severity="info"
                  icon={false}
                  sx={{ py: 0.25, px: 1.5, bgcolor: "#f8fafc" }}
                >
                  <Typography variant="caption">
                    <strong>{req.costCenterName || req.costCenterId}:</strong>{" "}
                    {req.previousLimit === null || req.previousLimit === undefined
                      ? "SIN LÍMITE"
                      : `$${Number(req.previousLimit).toFixed(2)}`}{" "}
                    →{" "}
                    <strong>
                      {req.requestedLimit === null || req.requestedLimit === undefined
                        ? "SIN LÍMITE"
                        : `$${Number(req.requestedLimit).toFixed(2)} USD`}
                    </strong>{" "}
                    ({req.reason}) · por {req.requestedByName || "Admin"}
                  </Typography>
                </Alert>
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>

      {/* Modal Crear / Editar Techo de Consumo (CF-81 / D-41) */}
      <Dialog
        open={openModal}
        onClose={() => setOpenModal(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {editingCenter
            ? "Ajustar Techo de Consumo en Caliente (CF-81)"
            : "Nuevo Centro de Costo / Techo"}
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption">Nombre del Techo / Centro *</Typography>
              <CustomTextField
                fullWidth
                placeholder="Ej. Operaciones Generales"
                value={name}
                onChange={(e: any) => setName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isUnlimited}
                    onChange={(e) => setIsUnlimited(e.target.checked)}
                    color="primary"
                  />
                }
                label="Sin límite de consumo (budgetLimit = null)"
              />
            </Grid>
            {!isUnlimited && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption">
                  Techo de Gasto por Ciclo ($ USD) * (0 bloquea despacho)
                </Typography>
                <CustomTextField
                  fullWidth
                  type="number"
                  placeholder="2500.00"
                  value={budgetLimitInput}
                  onChange={(e: any) => setBudgetLimitInput(e.target.value)}
                />
              </Grid>
            )}
            {editingCenter && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption">
                  Motivo de Ajuste (Historial `costCentreHistory`)
                </Typography>
                <CustomTextField
                  fullWidth
                  placeholder="Ej. Ampliación de techo para cierre de mes"
                  value={changeReason}
                  onChange={(e: any) => setChangeReason(e.target.value)}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={submitting}
          >
            {editingCenter ? "Aplicar Techo" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CostCenterManager;

