import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from "@mui/material";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { updateRider, deleteRider } from "@/utils/rider";
import { Rider } from "./ListRiders";
import toast from "react-hot-toast";

interface EditRiderModalProps {
  open: boolean;
  onClose: () => void;
  rider: Rider | null;
  onUpdate: () => void;
}

const validationSchema = Yup.object({
  driverName: Yup.string().required("El nombre es requerido"),
  licensePlate: Yup.string().required("La placa es requerida"),
  status: Yup.string().required("El estado es requerido"),
  phoneNumber: Yup.string().required("El teléfono es requerido"),
});

const EditRiderModal: React.FC<EditRiderModalProps> = ({
  open,
  onClose,
  rider,
  onUpdate,
}) => {
  if (!rider) return null;

  const handleUpdate = async (values: Rider) => {
    try {
      // We only update a subset of fields
      const dataToUpdate: Partial<Rider> = {
        driverName: values.driverName,
        licensePlate: values.licensePlate,
        status: values.status,
        phoneNumber: values.phoneNumber,
      };
      await updateRider(rider.driverId, dataToUpdate);
      toast.success("Cambios guardados correctamente");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating rider:", error);
      toast.error("Ocurrió un error al guardar los cambios");
    }
  };

  const handleDelete = async () => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este conductor?")) {
      try {
        await deleteRider(rider.driverId);
        toast.success("Conductor eliminado");
        // onUpdate will be called automatically by the realtime listener
        onClose();
      } catch (error) {
        console.error("Error deleting rider:", error);
        toast.error("Ocurrió un error al eliminar el conductor");
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar Conductor</DialogTitle>
      <Formik
        initialValues={rider}
        validationSchema={validationSchema}
        onSubmit={handleUpdate}
        enableReinitialize
      >
        {({ errors, touched }) => (
          <Form>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
                <Field
                  name="driverName"
                  as={TextField}
                  label="Nombre del Conductor"
                  fullWidth
                  error={touched.driverName && !!errors.driverName}
                  helperText={<ErrorMessage name="driverName" />}
                />
                <Field
                  name="licensePlate"
                  as={TextField}
                  label="Placa del Vehículo"
                  fullWidth
                  error={touched.licensePlate && !!errors.licensePlate}
                  helperText={<ErrorMessage name="licensePlate" />}
                />
                 <Field
                  name="phoneNumber"
                  as={TextField}
                  label="Teléfono"
                  fullWidth
                  error={touched.phoneNumber && !!errors.phoneNumber}
                  helperText={<ErrorMessage name="phoneNumber" />}
                />
                <Field
                  name="status"
                  as={TextField}
                  label="Estado"
                  fullWidth
                  error={touched.status && !!errors.status}
                  helperText={<ErrorMessage name="status" />}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Cancelar</Button>
              <Button color="error" onClick={handleDelete}>
                Eliminar Conductor
              </Button>
              <Button type="submit" variant="contained" color="primary">
                Guardar Cambios
              </Button>
            </DialogActions>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
};

export default EditRiderModal;
