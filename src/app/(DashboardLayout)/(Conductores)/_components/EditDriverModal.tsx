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
import { updateDriver, deleteDriver } from "@/utils/driver";
import { getUser, deleteUser } from "@/utils/user";
import { Driver } from "./Riders";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import DeleteConfirmationDialog from "@/app/(DashboardLayout)/components/shared/DeleteConfirmationDialog";
import {
  getEmailVerificationStatusCallable,
  requestEmailVerificationCodeCallable,
} from "@/utils/functions";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseApp } from "@/utils/firebase";

interface UserData {
  firstName?: string;
  lastName?: string;
  email?: string;
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

  useEffect(() => {
    if (open) {
      setIsEditing(!readOnly);
    }
  }, [open, readOnly]);

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
      const res = await requestEmailVerificationCodeCallable({ email: userData.email, locale: "es" });
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
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Error al subir el documento");
    } finally {
      setUploadingField(null);
    }
  };

  const handleUpdate = async (values: Driver) => {
    try {
      const dataToUpdate: Partial<Driver> = {
        dniNumber: values.dniNumber ?? "",
        licensePlate: values.licensePlate ?? "",
        phoneNumber: values.phoneNumber ?? "",
        vehicleBrand: values.vehicleBrand ?? "",
        vehicleModel: values.vehicleModel ?? "",
        isUserVerified: values.isUserVerified ?? false,
        profileImageUrl: values.profileImageUrl ?? "",
        licenseImageUrl: values.licenseImageUrl ?? "",
        criminalRecordImageUrl: values.criminalRecordImageUrl ?? "",
      };
      await updateDriver(driver.uid, dataToUpdate);
      toast.success("Cambios guardados correctamente");
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating driver:", error);
      toast.error("Ocurrió un error al guardar los cambios");
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      // Delete Firestore drivers doc
      await deleteDriver(driver.uid);

      // Delete Firestore users doc if present
      if (driver.userId) {
        await deleteUser(driver.userId);
      }

      toast.success("Conductor y sus datos asociados fueron eliminados");
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error deleting driver completely:", error);
      toast.error("Ocurrió un error al eliminar el conductor");
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
          isUserVerified: driver.isUserVerified ?? false,
          profileImageUrl: driver.profileImageUrl ?? "",
          licenseImageUrl: driver.licenseImageUrl ?? "",
          criminalRecordImageUrl: driver.criminalRecordImageUrl ?? "",
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
                        </Box>
                      ) : (
                        <Typography variant="body2" color="textSecondary">No disponible</Typography>
                      )}
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="h6" gutterBottom>
                    Imágenes de Documentos
                  </Typography>
                  <Grid container spacing={2}>
                    {[
                      { src: values.profileImageUrl, label: "Perfil", field: "profileImageUrl" },
                      { src: values.licenseImageUrl, label: "Licencia", field: "licenseImageUrl" },
                      { src: values.criminalRecordImageUrl, label: "Antecedentes", field: "criminalRecordImageUrl" },
                    ].map((img, index) => (
                      <Grid size={{ xs: 6, sm: 4 }} key={index}>
                        <Typography variant="caption" align="center" component="div">{img.label}</Typography>
                        <Card sx={{ mb: 1 }}>
                          <CardMedia
                            component="img"
                            image={img.src ?? ""}
                            alt={img.label}
                            sx={{ height: 100, objectFit: 'contain', cursor: img.src ? 'pointer' : 'default' }}
                            onClick={() => img.src && window.open(img.src, '_blank')}
                          />
                        </Card>
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
                    ))}
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
                          checked={values.isUserVerified}
                          onChange={(e) => setFieldValue('isUserVerified', e.target.checked)}
                          name="isUserVerified"
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
