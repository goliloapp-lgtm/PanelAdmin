
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  CircularProgress,
  Chip,
  Divider,
  Typography,
} from "@mui/material";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { updateUser, deleteUser } from "@/utils/user";
import { Passenger } from "../../(Pasajeros)/_components/ListPassengers";
import toast from "react-hot-toast";
import DeleteConfirmationDialog from "@/app/(DashboardLayout)/components/shared/DeleteConfirmationDialog";
import {
  getEmailVerificationStatusCallable,
  requestEmailVerificationCodeCallable,
} from "@/utils/functions";

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
});

const EditPassengerModal: React.FC<EditPassengerModalProps> = ({
  open,
  onClose,
  passenger,
  onUpdate,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ isVerified: boolean; verifiedAt?: string | null } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  useEffect(() => {
    if (open && passenger?.id) {
      const fetchStatus = async () => {
        setCheckingEmail(true);
        try {
          const res = await getEmailVerificationStatusCallable({ userId: passenger.id });
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
  }, [open, passenger]);

  const handleSendVerification = async () => {
    if (!passenger?.email) return;
    setSendingVerification(true);
    try {
      const res = await requestEmailVerificationCodeCallable({ email: passenger.email, locale: "es" });
      if (res.data.success) {
        toast.success("Código de verificación enviado al correo del pasajero.");
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

  const handleDeleteConfirm = async () => {
    try {
      await deleteUser(passenger.id);
      toast.success("Pasajero y sus datos asociados fueron eliminados");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error deleting user completely:", error);
      toast.error("Ocurrió un error al eliminar el pasajero");
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


                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" fontWeight={600}>
                  Estado de Correo Electrónico
                </Typography>
                {checkingEmail ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="textSecondary">Consultando estado...</Typography>
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
                          disabled={sendingVerification}
                        >
                          {sendingVerification ? "Enviando..." : "Enviar Correo de Verificación"}
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
                  <Typography variant="body2" color="textSecondary">No se pudo verificar el estado</Typography>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Cancelar</Button>
              <Button color="error" onClick={() => setIsConfirmOpen(true)}>
                Eliminar Usuario
              </Button>
              <Button type="submit" variant="contained" color="primary">
                Guardar Cambios
              </Button>
            </DialogActions>
          </Form>
        )}
      </Formik>
      <DeleteConfirmationDialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        itemName={`${passenger.firstName || ''} ${passenger.lastName || ''}`.trim()}
        itemType="pasajero"
      />
    </Dialog>
  );
};

export default EditPassengerModal;
