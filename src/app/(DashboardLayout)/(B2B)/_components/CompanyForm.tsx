"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import toast from "react-hot-toast";
import { useFormik } from "formik";
import * as yup from "yup";
import {
  listCompanyStatusesCallable,
  listCompanyRatesCallable,
  type CompanyStatusOption,
} from "@/utils/functions";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";
import {
  B2BCompany,
  BillingCadenceDocument,
  BillingPeriodId,
  PaymentCondition,
  CompanyStatus,
} from "@/types/b2b";
import {
  getBillingCadences,
} from "@/services/b2b/companyService";

interface CompanyFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<B2BCompany, "id" | "createdAt" | "updatedAt"> & { minimumBookingLeadMinutes?: number }) => Promise<void>;
  initialData?: B2BCompany | null;
}

const validationSchema = yup.object({
  tradeName: yup.string().required("El nombre comercial es obligatorio"),
  legalName: yup.string().required("La razón social es obligatoria"),
  nit: yup
    .string()
    .matches(
      /^\d{4}-\d{6}-\d{3}-\d{1}$/,
      "Formato de NIT inválido (ej: 0614-010190-101-1)"
    )
    .required("El NIT es obligatorio"),
  nrc: yup
    .string()
    .matches(/^\d{1,8}-\d{1}$/, "Formato de NRC inválido (ej: 123456-7)")
    .required("El NRC es obligatorio"),
  contactName: yup.string().required("El contacto autorizado es obligatorio"),
  phone: yup.string().required("El teléfono es obligatorio"),
  whatsapp: yup.string().required("El WhatsApp es obligatorio"),
  email: yup
    .string()
    .email("Ingresa un correo electrónico válido")
    .required("El correo es obligatorio"),
  address: yup.string().required("La dirección es obligatoria"),
  paymentCondition: yup
    .string()
    .oneOf(["cash", "transfer", "card", "credit_15", "credit_30", "credit15", "credit30"])
    .required("Selecciona la condición de pago"),
  billingPeriod: yup
    .string()
    .oneOf(
      ["daily", "weekly", "semi-monthly", "monthly"],
      "El período catorcenal ('biweekly') está retirado. Selecciona Diario, Semanal, Quincenal (15 y último día) o Mensual."
    )
    .required("Selecciona la cadencia de facturación"),
  // La pertenencia la decide el maestro: acá sólo se exige que haya uno.
  status: yup.string().required("Selecciona el estado de la cuenta"),
});

export const CompanyForm: React.FC<CompanyFormProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
}) => {
  const isEditing = Boolean(initialData);
  const [cadences, setCadences] = useState<BillingCadenceDocument[]>([]);
  // El vocabulario del estado sale del maestro `companyStatuses` (CF-97). Antes
  // estaba escrito acá y ofrecía `inactive`, que el backend descartaba callado.
  const [statuses, setStatuses] = useState<CompanyStatusOption[]>([]);
  // La matriz de tarifas sale del CATÁLOGO, no de una lista fija: una categoría
  // nueva con `b2bSuitable: true` aparece sola, con su tarifa editable por empresa.
  const [rateRows, setRateRows] = useState<
    { categoryId: string; categoryName: string; fareRate: number; hasNegotiatedRate: boolean }[]
  >([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      getBillingCadences().then((list) => setCadences(list));
      listCompanyStatusesCallable()
        .then((res) => setStatuses(res.data?.statuses ?? []))
        .catch(() => setStatuses([]));
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialData?.id) {
      setRateRows([]);
      setRateInputs({});
      return;
    }
    listCompanyRatesCallable({
      companyId: initialData.id,
      countryId: (initialData.countryId || "sv").toLowerCase(),
    })
      .then((res) => {
        const rows = res.data?.rates ?? [];
        setRateRows(rows);
        // Solo lo NEGOCIADO se precarga: lo que viene del país queda vacío, y el
        // placeholder muestra la tarifa que rige hoy.
        const inputs: Record<string, string> = {};
        for (const row of rows) {
          if (row.hasNegotiatedRate) inputs[row.categoryId] = String(row.fareRate);
        }
        setRateInputs(inputs);
      })
      .catch(() => {
        setRateRows([]);
        setRateInputs({});
      });
  }, [open, initialData?.id, initialData?.countryId]);

  const normalizePaymentCondition = (raw?: string): PaymentCondition => {
    if (raw === "credit_15" || raw === "credit15") return "credit15";
    if (raw === "credit_30" || raw === "credit30") return "credit30";
    if (raw === "cash" || raw === "transfer" || raw === "card") return raw;
    return "credit30";
  };

  const formik = useFormik({
    initialValues: {
      tradeName: initialData?.tradeName || "",
      legalName: initialData?.legalName || "",
      nit: initialData?.nit || "",
      nrc: initialData?.nrc || "",
      contactName: initialData?.contactName || "",
      phone: initialData?.phone || "",
      whatsapp: initialData?.whatsapp || "",
      email: initialData?.email || "",
      address: initialData?.address || "",
      paymentCondition: normalizePaymentCondition(initialData?.paymentCondition),
      billingPeriod: (
        initialData?.billingPeriod === "biweekly"
          ? "semi-monthly"
          : initialData?.billingPeriod || "monthly"
      ) as BillingPeriodId,
      minimumBookingLeadMinutes: initialData?.minimumBookingLeadMinutes ?? 180,
      creditLimit: initialData?.creditLimit ?? null,
      requiresInvoice: initialData?.requiresInvoice ?? true,
      requiresCCF: initialData?.requiresCCF ?? false,
      balance: initialData?.balance || 0,
      status: initialData?.status || ("active" as CompanyStatus),
      countryId: "sv" as const,
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // Las tarifas por categoría viajan como `fareRates`; el campo global está
        // deprecado y `updateCompany` no lo acepta.
        const fareRates: Record<string, number> = {};
        for (const [categoryId, raw] of Object.entries(rateInputs)) {
          const value = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(value) && value > 0) {
            fareRates[categoryId] = value;
          }
        }
        await onSubmit({ ...values, fareRates } as typeof values);
        formik.resetForm();
        onClose();
      } catch (err) {
        console.error("Error submitting company:", err);
      } finally {
        setSubmitting(false);
      }
    },
  });

  const retiredBiweekly = cadences.find((c) => c.id === "biweekly");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h5" fontWeight={600}>
          {isEditing ? "Editar Empresa B2B" : "Nueva Empresa B2B (El Salvador)"}
        </Typography>
      </DialogTitle>
      <form onSubmit={formik.handleSubmit}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Información General */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" color="primary" fontWeight={600}>
                Identificación Corporativa
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Nombre Comercial *</Typography>
              <CustomTextField
                fullWidth
                name="tradeName"
                placeholder="Ej. Distribuidora Central"
                value={formik.values.tradeName}
                onChange={formik.handleChange}
                error={formik.touched.tradeName && Boolean(formik.errors.tradeName)}
                helperText={formik.touched.tradeName && formik.errors.tradeName}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Razón Social *</Typography>
              <CustomTextField
                fullWidth
                name="legalName"
                placeholder="Ej. Distribuidora Central S.A. de C.V."
                value={formik.values.legalName}
                onChange={formik.handleChange}
                error={formik.touched.legalName && Boolean(formik.errors.legalName)}
                helperText={formik.touched.legalName && formik.errors.legalName}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">NIT (El Salvador) *</Typography>
              <CustomTextField
                fullWidth
                name="nit"
                placeholder="0614-010190-101-1"
                value={formik.values.nit}
                onChange={formik.handleChange}
                error={formik.touched.nit && Boolean(formik.errors.nit)}
                helperText={formik.touched.nit && formik.errors.nit}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">NRC (Registro Contribuyente) *</Typography>
              <CustomTextField
                fullWidth
                name="nrc"
                placeholder="123456-7"
                value={formik.values.nrc}
                onChange={formik.handleChange}
                error={formik.touched.nrc && Boolean(formik.errors.nrc)}
                helperText={formik.touched.nrc && formik.errors.nrc}
              />
            </Grid>

            {/* Contacto */}
            <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
              <Typography variant="subtitle2" color="primary" fontWeight={600}>
                Contacto Autorizado
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Nombre del Contacto *</Typography>
              <CustomTextField
                fullWidth
                name="contactName"
                placeholder="Ej. Juan Pérez"
                value={formik.values.contactName}
                onChange={formik.handleChange}
                error={formik.touched.contactName && Boolean(formik.errors.contactName)}
                helperText={formik.touched.contactName && formik.errors.contactName}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Correo Electrónico *</Typography>
              <CustomTextField
                fullWidth
                name="email"
                placeholder="corporativo@empresa.com"
                value={formik.values.email}
                onChange={formik.handleChange}
                error={formik.touched.email && Boolean(formik.errors.email)}
                helperText={formik.touched.email && formik.errors.email}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Teléfono *</Typography>
              <CustomTextField
                fullWidth
                name="phone"
                placeholder="+503 2222-0000"
                value={formik.values.phone}
                onChange={formik.handleChange}
                error={formik.touched.phone && Boolean(formik.errors.phone)}
                helperText={formik.touched.phone && formik.errors.phone}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">WhatsApp Operativo *</Typography>
              <CustomTextField
                fullWidth
                name="whatsapp"
                placeholder="+503 7777-0000"
                value={formik.values.whatsapp}
                onChange={formik.handleChange}
                error={formik.touched.whatsapp && Boolean(formik.errors.whatsapp)}
                helperText={formik.touched.whatsapp && formik.errors.whatsapp}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption">Dirección Fiscal / Operativa *</Typography>
              <CustomTextField
                fullWidth
                multiline
                rows={2}
                name="address"
                placeholder="Colonia Escalón, Calle El Mirador, San Salvador"
                value={formik.values.address}
                onChange={formik.handleChange}
                error={formik.touched.address && Boolean(formik.errors.address)}
                helperText={formik.touched.address && formik.errors.address}
              />
            </Grid>

            {/* Condiciones Comerciales */}
            <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
              <Typography variant="subtitle2" color="primary" fontWeight={600}>
                Condiciones Comerciales y Fiscales
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption">Condición de Pago *</Typography>
              <CustomTextField
                select
                fullWidth
                name="paymentCondition"
                value={formik.values.paymentCondition}
                onChange={formik.handleChange}
              >
                <MenuItem value="cash">Efectivo contra entrega</MenuItem>
                <MenuItem value="transfer">Transferencia Bancaria</MenuItem>
                <MenuItem value="card">Tarjeta de Crédito / Débito</MenuItem>
                <MenuItem value="credit_15">Crédito 15 Días</MenuItem>
                <MenuItem value="credit_30">Crédito 30 Días</MenuItem>
              </CustomTextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption">
                Cadencia de Corte / Facturación (`billingPeriod`) *
              </Typography>
              <CustomTextField
                select
                fullWidth
                name="billingPeriod"
                value={formik.values.billingPeriod}
                onChange={formik.handleChange}
                error={
                  formik.touched.billingPeriod &&
                  Boolean(formik.errors.billingPeriod)
                }
                helperText={
                  formik.touched.billingPeriod && formik.errors.billingPeriod
                }
              >
                {cadences.map((cadence) => (
                  <MenuItem
                    key={cadence.id}
                    value={cadence.id}
                    disabled={!cadence.active || !cadence.selectable}
                  >
                    {cadence.label}
                  </MenuItem>
                ))}
              </CustomTextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption">Estado de la Cuenta *</Typography>
              <CustomTextField
                select
                fullWidth
                name="status"
                value={formik.values.status}
                onChange={formik.handleChange}
              >
                {statuses.length === 0 ? (
                  <MenuItem value="" disabled>
                    Cargando estados…
                  </MenuItem>
                ) : (
                  statuses.map((option) => (
                    <MenuItem key={option.status} value={option.status}>
                      {option.label}
                    </MenuItem>
                  ))
                )}
              </CustomTextField>
            </Grid>
            {!isEditing && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info">
                  La empresa se crea con la tarifa del país en todas las categorías.
                  Las tarifas negociadas se cargan editándola, con el catálogo completo.
                </Alert>
              </Grid>
            )}
            {isEditing && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="primary" fontWeight={600}>
                  Tarifas por Categoría (USD / km)
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" mb={1}>
                  Vacío = tarifa del país. El catálogo se arma solo: una categoría
                  habilitada para B2B aparece acá con su tarifa editable.
                </Typography>
                {rateRows.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    Cargando categorías…
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {rateRows.map((row) => (
                      <Grid size={{ xs: 12, sm: 6 }} key={row.categoryId}>
                        <Typography variant="caption">{row.categoryName}</Typography>
                        <CustomTextField
                          fullWidth
                          type="number"
                          inputProps={{ step: "0.01", min: "0" }}
                          value={rateInputs[row.categoryId] ?? ""}
                          placeholder={row.fareRate.toFixed(2)}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setRateInputs((current) => ({
                              ...current,
                              [row.categoryId]: e.target.value,
                            }))
                          }
                          helperText={
                            row.hasNegotiatedRate
                              ? "Tarifa negociada de esta empresa"
                              : `Rige la del país: $${row.fareRate.toFixed(2)}`
                          }
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">
                Techo de Consumo Inicial ($ USD) — Vacío = SIN LÍMITE
              </Typography>
              <CustomTextField
                fullWidth
                type="number"
                inputProps={{ step: "10", min: "0" }}
                name="creditLimit"
                placeholder="Vacío = SIN LÍMITE (ej. 1200)"
                value={
                  formik.values.creditLimit === null ||
                  formik.values.creditLimit === undefined
                    ? ""
                    : formik.values.creditLimit
                }
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = e.target.value;
                  formik.setFieldValue(
                    "creditLimit",
                    val.trim() === "" ? null : Number(val)
                  );
                }}
                helperText="Define el techo inicial del Centro de Costo corporativo (CF-23)"
              />
            </Grid>
            {retiredBiweekly?.constraint && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Typography variant="caption">
                    <strong>Nota fiscal (`billingCadences`):</strong>{" "}
                    {retiredBiweekly.constraint}
                  </Typography>
                </Alert>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formik.values.requiresInvoice}
                    onChange={(e) =>
                      formik.setFieldValue("requiresInvoice", e.target.checked)
                    }
                  />
                }
                label="Requiere Factura Consumidor Final"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formik.values.requiresCCF}
                    onChange={(e) =>
                      formik.setFieldValue("requiresCCF", e.target.checked)
                    }
                  />
                }
                label="Requiere Comprobante de Crédito Fiscal (CCF)"
              />
            </Grid>

            {/* Parámetros Operativos B2B (G13, G14) */}
            {/* La anticipación SÓLO se edita en el alta: `updateCompany` no acepta el
                campo (vive en `updateCompanyCapabilities`), así que mostrarlo al
                editar era un campo que no guardaba nada. */}
            {!isEditing && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">Anticipación Mínima de Reserva (minutos) *</Typography>
              <CustomTextField
                fullWidth
                type="number"
                name="minimumBookingLeadMinutes"
                value={formik.values.minimumBookingLeadMinutes}
                onChange={formik.handleChange}
                error={
                  formik.touched.minimumBookingLeadMinutes &&
                  Boolean(formik.errors.minimumBookingLeadMinutes)
                }
                helperText={
                  (formik.touched.minimumBookingLeadMinutes &&
                    formik.errors.minimumBookingLeadMinutes) ||
                  "Mínimo 180 min (3 horas) requerido por backend para reservas B2B"
                }
              />
            </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption">País de Operación Fiscal (G14)</Typography>
              <CustomTextField
                fullWidth
                disabled
                value="El Salvador (sv)"
                helperText="Resuelto para jurisdicción El Salvador"
              />
            </Grid>

            {/* Activación Segura de Acceso — Portal B2B (D-22 / G12 / G22) */}
            <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ py: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  Activación de Cuenta sin Contraseña Temporal (D-22 / CF-43)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  El usuario administrador de la empresa (<strong>{formik.values.email || "correo corporativo"}</strong>)
                  recibirá automáticamente un correo oficial con su enlace de activación seguro de un solo uso para
                  establecer su contraseña definitiva en <code>/establecer-clave</code>.
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={formik.isSubmitting}
          >
            {isEditing ? "Guardar Cambios" : "Crear Empresa"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CompanyForm;

