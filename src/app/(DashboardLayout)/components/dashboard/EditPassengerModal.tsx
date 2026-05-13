
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
import { updateUser, deleteUser } from "@/utils/user";
import { Passenger } from "../../(Pasajeros)/_components/ListPassengers";
import toast from "react-hot-toast";

interface EditPassengerModalProps {
  open: boolean;
  onClose: () => void;
  passenger: Passenger | null;
  onUpdate: () => void;
}

const validationSchema = Yup.object({
  firstName: Yup.string().required("El nombre es requerido"),
  lastName: Yup.string().required("El apellido es requerido"),
  email: Yup.string().email("Email inválido").required("El email es requerido"),
  phone: Yup.string().required("El teléfono es requerido"),
  role: Yup.string().required("El rol es requerido"),
});

const EditPassengerModal: React.FC<EditPassengerModalProps> = ({
  open,
  onClose,
  passenger,
  onUpdate,
}) => {
  if (!passenger) return null;

  const handleUpdate = async (values: Passenger) => {
    try {
      await updateUser(passenger.id, values);
      toast.success("Cambios guardados correctamente");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Ocurrió un error al guardar los cambios");
    }
  };

  const handleDelete = async () => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este usuario?")) {
      try {
        await deleteUser(passenger.id);
        toast.success("Usuario eliminado");
        onUpdate();
        onClose();
      } catch (error) {
        console.error("Error deleting user:", error);
        toast.error("Ocurrió un error al eliminar el usuario");
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar Pasajero</DialogTitle>
      <Formik
        initialValues={passenger}
        validationSchema={validationSchema}
        onSubmit={handleUpdate}
      >
        {({ errors, touched }) => (
          <Form>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Field
                  name="firstName"
                  as={TextField}
                  label="Nombre"
                  fullWidth
                  error={touched.firstName && !!errors.firstName}
                  helperText={<ErrorMessage name="firstName" />}
                />
                <Field
                  name="lastName"
                  as={TextField}
                  label="Apellido"
                  fullWidth
                  error={touched.lastName && !!errors.lastName}
                  helperText={<ErrorMessage name="lastName" />}
                />
                <Field
                  name="email"
                  as={TextField}
                  label="Email"
                  fullWidth
                  error={touched.email && !!errors.email}
                  helperText={<ErrorMessage name="email" />}
                />
                <Field
                  name="phone"
                  as={TextField}
                  label="Teléfono"
                  fullWidth
                  error={touched.phone && !!errors.phone}
                  helperText={<ErrorMessage name="phone" />}
                />
                <Field
                  name="role"
                  as={TextField}
                  label="Rol"
                  fullWidth
                  error={touched.role && !!errors.role}
                  helperText={<ErrorMessage name="role" />}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Cancelar</Button>
              <Button color="error" onClick={handleDelete}>
                Eliminar Usuario
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

export default EditPassengerModal;
