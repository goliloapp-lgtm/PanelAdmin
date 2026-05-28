import React, { useState } from "react";
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
} from "@mui/material";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { updateRider, deleteRider } from "@/utils/rider";
import { updateDriver, deleteDriver } from "@/utils/driver";
import { updateUser, deleteUser } from "@/utils/user";
import { Rider } from "./ListRiders";
import toast from "react-hot-toast";
import DeleteConfirmationDialog from "@/app/(DashboardLayout)/components/shared/DeleteConfirmationDialog";
import { deactivateDriverCallable } from "@/utils/functions";

interface EditRiderModalProps {
  open: boolean;
  onClose: () => void;
  rider: Rider | null;
  onUpdate: () => void;
}

const validationSchema = Yup.object({
  driverName: Yup.string().required("El nombre es requerido"),
  licensePlate: Yup.string().required("La placa es requerida"),
  phoneNumber: Yup.string().required("El teléfono es requerido"),
});

const EditRiderModal: React.FC<EditRiderModalProps> = ({
  open,
  onClose,
  rider,
  onUpdate,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  if (!rider) return null;

  const handleUpdate = async (values: Rider & { isConductorActive?: boolean }) => {
    try {
      if (values.isConductorActive === false) {
        // If driver is deactivated, use the backend Cloud Function to clean up active session
        await deactivateDriverCallable({ driverId: rider.driverId });
      } else {
        // Otherwise, update live status in RTDB
        const rtdbData: Partial<Rider> & { isActive?: boolean } = {
          driverName: values.driverName,
          licensePlate: values.licensePlate,
          status: "disponible",
          isActive: true,
          phoneNumber: values.phoneNumber,
        };
        await updateRider(rider.driverId, rtdbData);
      }

      // Update Firestore 'drivers' collection (persistent profile)
      await updateDriver(rider.driverId, {
        licensePlate: values.licensePlate,
        phoneNumber: values.phoneNumber,
        isConductorActive: values.isConductorActive ?? false,
      });

      // 3. Update Firestore 'users' collection (first and last name) if userId is present
      if (rider.userId) {
        const nameParts = values.driverName.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ");
        await updateUser(rider.userId, {
          firstName,
          lastName,
        });
      }

      toast.success("Cambios guardados correctamente");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating rider:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Error al guardar: ${errMsg}`);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      // Delete from RTDB
      await deleteRider(rider.driverId);
      
      // Delete from Firestore drivers
      await deleteDriver(rider.driverId);
      
      // Delete from Firestore users
      if (rider.userId) {
        await deleteUser(rider.userId);
      }
      
      toast.success("Conductor y todos sus datos asociados fueron eliminados de las colecciones");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error deleting rider completely:", error);
      toast.error("Ocurrió un error al eliminar los datos del conductor");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar Conductor</DialogTitle>
      <Formik
        initialValues={{
          ...rider,
          isConductorActive: rider.isConductorActive ?? false
        }}
        validationSchema={validationSchema}
        onSubmit={handleUpdate}
        enableReinitialize
      >
        {({ errors, touched, values, setFieldValue }) => (
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
                {rider.isConductorActive && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.isConductorActive}
                        onChange={(e) => {
                          if (!e.target.checked) {
                            setFieldValue('isConductorActive', false);
                          }
                        }}
                        disabled={!values.isConductorActive}
                        name="isConductorActive"
                      />
                    }
                    label="Conductor Activo"
                  />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Cancelar</Button>
              <Button color="error" onClick={() => setIsConfirmOpen(true)}>
                Eliminar Conductor
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
        itemName={rider.driverName}
        itemType="conductor"
      />
    </Dialog>
  );
};

export default EditRiderModal;
