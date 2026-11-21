import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControlLabel,
  Switch,
  Typography,
  Divider,
  Card,
  CardMedia,
  CircularProgress,
  Chip,
} from "@mui/material";
import Grid from '@mui/material/Grid';
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { updateDriver } from "@/utils/driver";
import { getUser } from "@/utils/user";
import { deleteRider } from "@/utils/rider";
import { Driver } from "./Riders";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import DeleteConfirmationDialog from "@/app/(DashboardLayout)/components/shared/DeleteConfirmationDialog";
import {
  adminDeleteUserCallable,
  approveCountryMembershipCallable,
  getEmailVerificationStatusCallable,
  requestEmailVerificationCodeCallable,
  reviewMembershipDocumentCallable,
  setDriverVerificationCallable,
} from "@/utils/functions";
import { formatFriendlyError } from "@/utils/friendlyError";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { db, firebaseApp } from "@/utils/firebase";

interface MembershipDocEntry {
  type: string;
  status?: string;
  name?: string;
  fileUrl?: string;
  url?: string;
  rejectionReason?: string;
}

const DOC_TYPE_ALIASES: Record<string, string[]> = {
  identityDocument: ["identityDocument", "svIdentityDocument", "identity_document"],
  driversLicense: ["driversLicense", "svDriversLicense", "drivers_license"],
  criminalRecord: ["criminalRecord", "svCriminalRecord", "criminal_record"],
  insuranceCard: ["insuranceCard", "svInsuranceCard", "insurance_card"],
  vehicleRegistration: ["vehicleRegistration", "svVehicleRegistration", "vehicle_registration"],
};

interface UserData {
  firstName?: string;
  lastName?: string;
  email?: string;
  countryId?: string;
}

interface EditDriverModalProps {
  open: boolean;
  onClose: () => void;
  driver: Driver | null;
  onUpdate?: () => void;
  readOnly?: boolean;
}

const validationSchema = Yup.object({
  dniNumber: Yup.string(),
  licensePlate: Yup.string(),
  phoneNumber: Yup.string(),
  vehicleBrand: Yup.string(),
  vehicleModel: Yup.string(),
});

const EditDriverModal: React.FC<EditDriverModalProps> = ({
  open,
  onClose,
  driver,
  onUpdate,
  readOnly = false,
}) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ isVerified: boolean; verifiedAt?: string | null } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [isEditing, setIsEditing] = useState(!readOnly);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [membershipDocs, setMembershipDocs] = useState<MembershipDocEntry[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<string>("");
  const [reviewingDocType, setReviewingDocType] = useState<string | null>(null);

  const resolvedCountryCode = String(
    (driver as any)?.countryId || userData?.countryId || "sv"
  )
    .trim()
    .toLowerCase();

  const fetchMembershipData = async (uid: string, code: string) => {
    if (!uid || !code) return;
    try {
      const snap = await getDoc(doc(db, "users", uid, "countryMemberships", code));
      if (snap.exists()) {
        const data = snap.data();
        setMembershipStatus(typeof data.status === "string" ? data.status : "");
        setMembershipDocs(Array.isArray(data.documents) ? data.documents : []);
      } else {
        setMembershipStatus("");
        setMembershipDocs([]);
      }
    } catch (err) {
      console.warn("[EditDriverModal] Error reading countryMembership:", err);
    }
  };

  useEffect(() => {
    if (open) {
      setIsEditing(!readOnly);
    }
  }, [open, readOnly]);

  useEffect(() => {
    if (open && driver) {
      const targetUid = driver.userId || driver.uid;
      fetchMembershipData(targetUid, resolvedCountryCode);
    } else {
      setMembershipDocs([]);
      setMembershipStatus("");
    }
  }, [open, driver, resolvedCountryCode]);

  useEffect(() => {
    if (open && driver?.userId) {
      const fetchStatus = async () => {
        setCheckingEmail(true);
        try {
          const res = await getEmailVerificationStatusCallable({ userId: driver.userId });
          setEmailStatus(res.data);
        } catch (error) {
          console.error("Error fetching email status:", error);
        } finally {
          setCheckingEmail(false);
        }
      };
      fetchStatus();
    } else {
      setEmailStatus(null);
    }
  }, [open, driver]);

  const handleSendVerification = async () => {
    if (!userData?.email) return;
    setSendingVerification(true);
    try {
      const res = await requestEmailVerificationCodeCallable({ email: userData.email });
      if (res.data.success) {
        toast.success("Código de verificación enviado al correo del conductor.");
      } else {
        toast.error("Error al enviar código de verificación.");
      }
    } catch (error: any) {
      console.error("Error sending verification code:", error);
      toast.error(`Error: ${error.message || error}`);
    } finally {
      setSendingVerification(false);
    }
  };

  useEffect(() => {
    if (driver?.userId) {
      const fetchUserData = async () => {
        const data = await getUser(driver.userId);
        if (data) {
          setUserData(data);
        }
      };
      fetchUserData();
    }
  }, [driver]);

  if (!driver) return null;

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: string,
    setFieldValue: (field: string, value: any) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    try {
      const storage = getStorage(firebaseApp);
      const imageRef = sRef(storage, `drivers/${driver.uid}/${field}_${Date.now()}_${file.name}`);
      await uploadBytes(imageRef, file);
      const downloadUrl = await getDownloadURL(imageRef);
      setFieldValue(field, downloadUrl);
      toast.success("Documento subido correctamente");
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(`Error al subir el documento: ${error.message || error}`);
    } finally {
      setUploadingField(null);
    }
  };

  const findMembershipDoc = (canonicalType: string): MembershipDocEntry | undefined => {
    const aliases = DOC_TYPE_ALIASES[canonicalType] || [canonicalType];
    return membershipDocs.find((d) => d && typeof d.type === "string" && aliases.includes(d.type));
  };

  const handleReviewDocument = async (
    canonicalType: string,
    decision: "accepted" | "rejected"
  ) => {
    const targetUserId = driver.userId || driver.uid;
    const countryCode = resolvedCountryCode || "sv";
    const matched = findMembershipDoc(canonicalType);
    const backendType = matched?.type || canonicalType;

    setReviewingDocType(canonicalType);
    try {
      await reviewMembershipDocumentCallable({
        userId: targetUserId,
        code: countryCode,
        type: backendType,
        decision,
        ...(decision === "rejected"
          ? { rejectionReason: "Documento rechazado en revisión de panel" }
          : {}),
      });
      toast.success(
        decision === "accepted"
          ? "Documento aceptado correctamente"
          : "Documento marcado como rechazado"
      );
      await fetchMembershipData(targetUserId, countryCode);
    } catch (error) {
      console.error("[EditDriverModal] Error reviewing document:", error);
      toast.error(
        formatFriendlyError(error, "No se pudo actualizar el estado del documento")
      );
    } finally {
      setReviewingDocType(null);
    }
  };

  const handleUpdate = async (values: Driver) => {
    try {
      const isApproved = values.verificationStatus === "verified";
      const currentApproved = driver.verificationStatus === "verified";
      const targetUserId = driver.userId || driver.uid;
      const countryCode = String(
        (driver as any)?.countryId || userData?.countryId || ""
      )
        .trim()
        .toLowerCase();

      // CF-37: Manejo de estado de verificación mediante callable oficial
      if (isApproved !== currentApproved) {
        if (isApproved) {
          // LA MEMBRESÍA VA PRIMERO, Y SUS DOCUMENTOS NO SE ACEPTAN ACÁ.
          //
          // El claim `countryIds` lo emite la membresía de país. Con el conductor
          // aprobado primero, un fallo de la membresía lo dejaba verificado y sin
          // claim: el estado inconsistente que esto cierra. Y aceptar los documentos
          // en bloque marcaba `accepted` lo que nadie había mirado; ahora el operador
          // los acepta uno por uno y, si falta alguno, el backend rechaza nombrando
          // cuál — ese mensaje se muestra tal cual, sin tragarse el fallo.
          if (countryCode) {
            try {
              await approveCountryMembershipCallable({
                userId: targetUserId,
                code: countryCode,
              });
            } catch (memErr: any) {
              const msg = String(memErr?.message || "").toLowerCase();
              // Si la membresía ya estaba activa ("already active"), continuamos a verificar;
              // cualquier otro fallo (documentos sin aceptar, faltantes o permisos) se propaga.
              if (!msg.includes("already active")) {
                throw memErr;
              }
            }
          }
          await setDriverVerificationCallable({
            driverId: driver.uid,
            verified: true,
          });
        } else {
          await setDriverVerificationCallable({
            driverId: driver.uid,
            verified: false,
            reason: "Verificación revocada desde el panel administrativo",
          });
        }
      }

      const dataToUpdate: Partial<Driver> = {
        dniNumber: values.dniNumber ?? "",
        phoneNumber: values.phoneNumber ?? "",
        profileImageUrl: values.profileImageUrl ?? "",
        licenseImageUrl: values.licenseImageUrl ?? "",
        criminalRecordImageUrl: values.criminalRecordImageUrl ?? "",
        insuranceCardImageUrl: values.insuranceCardImageUrl ?? "",
        vehicleRegistrationImageUrl: values.vehicleRegistrationImageUrl ?? "",
      };
      await updateDriver(driver.uid, dataToUpdate);
      toast.success("Cambios guardados correctamente");
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating driver:", error);
      toast.error(
        formatFriendlyError(error, "Ocurrió un error al guardar los cambios")
      );
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const targetUserId = driver.userId || driver.uid;
      // Elimina cuenta de Firebase Auth + users + drivers + wallets + reactivationTokens
      await adminDeleteUserCallable({ userId: targetUserId });

      // Limpieza best-effort en RTDB si estaba registrado en presencia activa
      try {
        await deleteRider(driver.uid);
      } catch (rtdbErr) {
        console.warn("[EditDriverModal] RTDB cleanup note:", rtdbErr);
      }

      toast.success("Conductor y su cuenta de acceso fueron eliminados por completo");
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error deleting driver completely:", error);
      toast.error(
        formatFriendlyError(error, "Ocurrió un error al eliminar el conductor")
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{isEditing ? "Editar Conductor" : "Información del Conductor"}</DialogTitle>
      <Formik
        initialValues={{
          ...driver,
          dniNumber: driver.dniNumber ?? "",
          licensePlate: driver.licensePlate ?? "",
          phoneNumber: driver.phoneNumber ?? "",
          vehicleBrand: driver.vehicleBrand ?? "",
          vehicleModel: driver.vehicleModel ?? "",
          verificationStatus: driver.verificationStatus ?? "pending",
          profileImageUrl: driver.profileImageUrl ?? "",
          licenseImageUrl: driver.licenseImageUrl ?? "",
          criminalRecordImageUrl: driver.criminalRecordImageUrl ?? "",
          insuranceCardImageUrl: driver.insuranceCardImageUrl ?? "",
          vehicleRegistrationImageUrl: driver.vehicleRegistrationImageUrl ?? "",
        }}
        validationSchema={validationSchema}
        onSubmit={handleUpdate}
        enableReinitialize
      >
        {({ values, setFieldValue, errors, touched }) => (
          <Form>
            <DialogContent>
              <Grid container spacing={4}>
                {/* User and Documents Column */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="h6" gutterBottom>
                    Datos del Usuario
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
                    <TextField
                      label="Nombre"
                      value={userData?.firstName ?? "Cargando..."}
                      InputProps={{ readOnly: true }}
                      variant="filled"
                    />
                    <TextField
                      label="Apellido"
                      value={userData?.lastName ?? "Cargando..."}
                      InputProps={{ readOnly: true }}
                      variant="filled"
                    />
                    <TextField
                      label="Email"
                      value={userData?.email ?? "Cargando..."}
                      InputProps={{ readOnly: true }}
                      variant="filled"
                    />

                    {/* Email Verification Status Card */}
                    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                        Estado de Verificación de Correo
                      </Typography>
                      {checkingEmail ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="textSecondary">Consultando...</Typography>
                        </Box>
                      ) : emailStatus ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Chip
                              label={emailStatus.isVerified ? "Verificado" : "No verificado"}
                              color={emailStatus.isVerified ? "success" : "warning"}
                              size="small"
                            />
                            {!emailStatus.isVerified && (
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={handleSendVerification}
                                disabled={sendingVerification || !userData?.email}
                              >
                                {sendingVerification ? "Enviando..." : "Enviar Código"}
                              </Button>
                            )}
                          </Box>
                          {emailStatus.isVerified && emailStatus.verifiedAt && (
                            <Typography variant="caption" color="textSecondary">
                              Verificado el: {new Date(emailStatus.verifiedAt).toLocaleString()}
                            </Typography>
                          )}
                          <Typography variant="caption" color="textSecondary">
                            Este código solo confirma el correo inicial. Al activar «Marcar como Verificado», el sistema envía automáticamente el aviso de cuenta aprobada.
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="textSecondary">No disponible</Typography>
                      )}
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="h6">
                      Imágenes y Revisión de Documentos
                    </Typography>
                    {membershipStatus && (
                      <Chip
                        label={`Membresía (${resolvedCountryCode.toUpperCase()}): ${
                          membershipStatus === "active"
                            ? "Activa"
                            : membershipStatus === "pending" || membershipStatus === "in_review"
                            ? "En revisión"
                            : membershipStatus
                        }`}
                        color={membershipStatus === "active" ? "success" : "warning"}
                        size="small"
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 1.5 }}>
                    Para aprobar al conductor, revisa y acepta cada documento individualmente (CF-104).
                  </Typography>
                  <Grid container spacing={2}>
                    {[
                      { src: values.profileImageUrl, label: "DUI / Identidad", field: "profileImageUrl", docType: "identityDocument" },
                      { src: values.licenseImageUrl, label: "Licencia", field: "licenseImageUrl", docType: "driversLicense" },
                      { src: values.criminalRecordImageUrl, label: "Antecedentes (PNC)", field: "criminalRecordImageUrl", docType: "criminalRecord" },
                      { src: values.insuranceCardImageUrl, label: "Tarjeta de Seguro", field: "insuranceCardImageUrl", docType: "insuranceCard" },
                      { src: values.vehicleRegistrationImageUrl, label: "Tarjeta Circulación", field: "vehicleRegistrationImageUrl", docType: "vehicleRegistration" },
                    ].map((img, index) => {
                      const matchedDoc = findMembershipDoc(img.docType);
                      const docStatus = matchedDoc?.status || "";
                      const displaySrc = img.src || matchedDoc?.fileUrl || matchedDoc?.url || "";
                      const isAccepted = docStatus === "accepted" || docStatus === "approved";
                      const isRejected = docStatus === "rejected";
                      const isReviewing = reviewingDocType === img.docType;

                      return (
                        <Grid size={{ xs: 6, sm: 4 }} key={index}>
                          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 0.5, gap: 0.5 }}>
                            <Typography variant="caption" align="center" fontWeight={600} component="div">
                              {img.label}
                            </Typography>
                            <Chip
                              label={
                                isAccepted
                                  ? "Aceptado"
                                  : isRejected
                                  ? "Rechazado"
                                  : matchedDoc
                                  ? "Pendiente"
                                  : "Sin registro"
                              }
                              color={
                                isAccepted
                                  ? "success"
                                  : isRejected
                                  ? "error"
                                  : matchedDoc
                                  ? "warning"
                                  : "default"
                              }
                              variant={matchedDoc ? "filled" : "outlined"}
                              size="small"
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          </Box>
                          <Card sx={{ mb: 1 }}>
                            <CardMedia
                              component="img"
                              image={displaySrc}
                              alt={img.label}
                              sx={{ height: 100, objectFit: "contain", cursor: displaySrc ? "pointer" : "default" }}
                              onClick={() => displaySrc && window.open(displaySrc, "_blank")}
                            />
                          </Card>
                          {isEditing && !readOnly && matchedDoc && (
                            <Box sx={{ display: "flex", gap: 0.5, mb: 0.75 }}>
                              <Button
                                variant={isAccepted ? "contained" : "outlined"}
                                color="success"
                                size="small"
                                fullWidth
                                disabled={isReviewing || isAccepted}
                                onClick={() => handleReviewDocument(img.docType, "accepted")}
                                sx={{ fontSize: "0.7rem", py: 0.25, minWidth: 0 }}
                              >
                                Aceptar
                              </Button>
                              <Button
                                variant={isRejected ? "contained" : "outlined"}
                                color="error"
                                size="small"
                                fullWidth
                                disabled={isReviewing || isRejected}
                                onClick={() => handleReviewDocument(img.docType, "rejected")}
                                sx={{ fontSize: "0.7rem", py: 0.25, minWidth: 0 }}
                              >
                                Rechazar
                              </Button>
                            </Box>
                          )}
                          {isEditing && (
                            <Box sx={{ display: "flex", justifyContent: "center" }}>
                              <Button
                                variant="outlined"
                                component="label"
                                size="small"
                                disabled={uploadingField === img.field}
                                startIcon={uploadingField === img.field ? <CircularProgress size={16} /> : null}
                                fullWidth
                              >
                                {uploadingField === img.field ? "Subiendo..." : "Subir"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  onChange={(e) => handleImageUpload(e, img.field, setFieldValue)}
                                />
                              </Button>
                            </Box>
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                </Grid>

                {/* Editable Driver Data Column */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="h6" gutterBottom>
                    Datos del Vehículo y Conductor (Editables)
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Field
                      name="dniNumber"
                      as={TextField}
                      label="Número de identificación"
                      fullWidth
                      error={touched.dniNumber && !!errors.dniNumber}
                      helperText={<ErrorMessage name="dniNumber" />}
                      InputProps={{ readOnly: !isEditing }}
                    />
                    <Field
                      name="licensePlate"
                      as={TextField}
                      label="Placa del Vehículo"
                      fullWidth
                      error={touched.licensePlate && !!errors.licensePlate}
                      helperText={<ErrorMessage name="licensePlate" />}
                      InputProps={{ readOnly: !isEditing }}
                    />
                    <Field
                      name="phoneNumber"
                      as={TextField}
                      label="Teléfono"
                      fullWidth
                      error={touched.phoneNumber && !!errors.phoneNumber}
                      helperText={<ErrorMessage name="phoneNumber" />}
                      InputProps={{ readOnly: !isEditing }}
                    />
                    <Field
                      name="vehicleBrand"
                      as={TextField}
                      label="Marca del Vehículo"
                      fullWidth
                      error={touched.vehicleBrand && !!errors.vehicleBrand}
                      helperText={<ErrorMessage name="vehicleBrand" />}
                      InputProps={{ readOnly: !isEditing }}
                    />
                    <Field
                      name="vehicleModel"
                      as={TextField}
                      label="Modelo del Vehículo"
                      fullWidth
                      error={touched.vehicleModel && !!errors.vehicleModel}
                      helperText={<ErrorMessage name="vehicleModel" />}
                      InputProps={{ readOnly: !isEditing }}
                    />
                    {isEditing && !readOnly && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={values.verificationStatus === "verified"}
                          onChange={(e) => setFieldValue('verificationStatus', e.target.checked ? 'verified' : 'pending')}
                          name="verificationStatus"
                        />
                      }
                      label="Marcar como Verificado"
                    />
                    )}
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              {!isEditing ? (
                <>
                  <Button onClick={onClose} variant="outlined">Cerrar</Button>
                  <Button onClick={() => setIsEditing(true)} variant="contained" color="primary">
                    Editar
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => {
                    if (readOnly) {
                      setIsEditing(false);
                    } else {
                      onClose();
                    }
                  }} variant="outlined">
                    Cancelar
                  </Button>
                  {!readOnly && (
                    <Button color="error" onClick={() => setIsConfirmOpen(true)} variant="outlined">
                      Rechazar Conductor
                    </Button>
                  )}
                  <Button type="submit" variant="contained" color="primary">
                    Guardar Cambios
                  </Button>
                </>
              )}
            </DialogActions>
          </Form>
        )}
      </Formik>
      <DeleteConfirmationDialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        itemName={userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : "Conductor sin verificar"}
        itemType="conductor"
      />
    </Dialog>
  );
};

export default EditDriverModal;
