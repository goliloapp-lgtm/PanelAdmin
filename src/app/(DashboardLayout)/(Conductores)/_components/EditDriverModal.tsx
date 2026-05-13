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
} from "@mui/material";
import Grid from '@mui/material/Grid';
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { updateDriver, deleteDriver } from "@/utils/driver";
import { getUser } from "@/utils/user";
import { Driver } from "./Riders";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

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

  const handleUpdate = async (values: Driver) => {
    try {
      const dataToUpdate: Partial<Driver> = {
        dniNumber: values.dniNumber ?? "",
        licensePlate: values.licensePlate ?? "",
        phoneNumber: values.phoneNumber ?? "",
        vehicleBrand: values.vehicleBrand ?? "",
        vehicleModel: values.vehicleModel ?? "",
        isUserVerified: values.isUserVerified ?? false,
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

  const handleDelete = async () => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este conductor?")) {
      try {
        await deleteDriver(driver.uid);
        toast.success("Conductor eliminado");
        if (onUpdate) onUpdate();
        onClose();
      } catch (error) {
        console.error("Error deleting driver:", error);
        toast.error("Ocurrió un error al eliminar el conductor");
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{readOnly ? "Información del Conductor" : "Verificar Conductor"}</DialogTitle>
      <Formik
        initialValues={{
          ...driver,
          dniNumber: driver.dniNumber ?? "",
          licensePlate: driver.licensePlate ?? "",
          phoneNumber: driver.phoneNumber ?? "",
          vehicleBrand: driver.vehicleBrand ?? "",
          vehicleModel: driver.vehicleModel ?? "",
          isUserVerified: driver.isUserVerified ?? false,
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
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="h6" gutterBottom>
                    Imágenes de Documentos
                  </Typography>
                  <Grid container spacing={2}>
                    {[
                      { src: driver.profileImageUrl, label: "Perfil" },
                      { src: driver.dniImageUrl, label: "DNI" },
                      { src: driver.licenseImageUrl, label: "Licencia" },
                      { src: driver.criminalRecordImageUrl, label: "Antecedentes" },
                    ].map((img, index) => (
                      <Grid size={{ xs: 6, sm: 3 }} key={index}>
                        <Typography variant="caption" align="center" component="div">{img.label}</Typography>
                        <Card>
                          <CardMedia
                            component="img"
                            image={img.src ?? ""}
                            alt={img.label}
                            sx={{ height: 100, objectFit: 'contain', cursor: img.src ? 'pointer' : 'default' }}
                            onClick={() => img.src && window.open(img.src, '_blank')}
                          />
                        </Card>
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
                      label="Número de DNI"
                      fullWidth
                      error={touched.dniNumber && !!errors.dniNumber}
                      helperText={<ErrorMessage name="dniNumber" />}
                      InputProps={{ readOnly: readOnly }}
                    />
                    <Field
                      name="licensePlate"
                      as={TextField}
                      label="Placa del Vehículo"
                      fullWidth
                      error={touched.licensePlate && !!errors.licensePlate}
                      helperText={<ErrorMessage name="licensePlate" />}
                      InputProps={{ readOnly: readOnly }}
                    />
                    <Field
                      name="phoneNumber"
                      as={TextField}
                      label="Teléfono"
                      fullWidth
                      error={touched.phoneNumber && !!errors.phoneNumber}
                      helperText={<ErrorMessage name="phoneNumber" />}
                      InputProps={{ readOnly: readOnly }}
                    />
                    <Field
                      name="vehicleBrand"
                      as={TextField}
                      label="Marca del Vehículo"
                      fullWidth
                      error={touched.vehicleBrand && !!errors.vehicleBrand}
                      helperText={<ErrorMessage name="vehicleBrand" />}
                      InputProps={{ readOnly: readOnly }}
                    />
                    <Field
                      name="vehicleModel"
                      as={TextField}
                      label="Modelo del Vehículo"
                      fullWidth
                      error={touched.vehicleModel && !!errors.vehicleModel}
                      helperText={<ErrorMessage name="vehicleModel" />}
                      InputProps={{ readOnly: readOnly }}
                    />
                    {!readOnly && (
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
              <Button onClick={onClose} variant="outlined">{readOnly ? "Cerrar" : "Cancelar"}</Button>
              {!readOnly && (
                <>
                  <Button color="error" onClick={handleDelete} variant="outlined">
                    Rechazar Conductor
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    Guardar Cambios
                  </Button>
                </>
              )}
            </DialogActions>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
};

export default EditDriverModal;
