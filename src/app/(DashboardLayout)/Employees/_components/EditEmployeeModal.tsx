import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Typography,
} from "@mui/material";
import { updateUser } from "@/utils/user";
import { Employee } from "./ListEmployees";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { firebaseApp } from "@/utils/firebase";
import toast from "react-hot-toast";

interface EditEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
  onUpdate: () => void;
}

interface RoleDoc {
  id: string;
  name: string;
  description: string;
}

const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  open,
  onClose,
  employee,
  onUpdate,
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const fetchRoles = async () => {
        setLoadingRoles(true);
        try {
          const db = getFirestore(firebaseApp);
          const snap = await getDocs(collection(db, "roles"));
          const fetchedRoles: RoleDoc[] = [];
          snap.forEach((doc) => {
            const data = doc.data();
            fetchedRoles.push({
              id: doc.id,
              name: data.name || "N/A",
              description: data.description || "",
            });
          });
          setRoles(fetchedRoles);
        } catch (error) {
          console.error("Error fetching roles:", error);
          toast.error("Error al cargar roles disponibles");
        } finally {
          setLoadingRoles(false);
        }
      };

      fetchRoles();
      if (employee) {
        setSelectedRoleId(employee.roleId || "");
      }
    }
  }, [open, employee]);

  if (!employee) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      // If selectedRoleId is empty or "remove", set role field to empty string in db
      const newRoleValue = selectedRoleId === "remove" || !selectedRoleId ? "" : selectedRoleId;
      await updateUser(employee.id, { role: newRoleValue });
      toast.success("Rol actualizado con éxito");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating employee role:", error);
      toast.error("Ocurrió un error al actualizar el rol");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gestionar Rol de Empleado</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2 }}>
          <TextField
            label="Nombre"
            value={`${employee.firstName} ${employee.lastName}`}
            InputProps={{ readOnly: true }}
            variant="filled"
            fullWidth
          />
          <TextField
            label="Email"
            value={employee.email}
            InputProps={{ readOnly: true }}
            variant="filled"
            fullWidth
          />
          <TextField
            label="Teléfono"
            value={employee.phone}
            InputProps={{ readOnly: true }}
            variant="filled"
            fullWidth
          />

          <FormControl fullWidth variant="outlined">
            <InputLabel id="role-select-label">Rol del Empleado</InputLabel>
            {loadingRoles ? (
              <Box sx={{ display: "flex", alignItems: "center", p: 1.5 }}>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                <Typography variant="body2">Cargando roles...</Typography>
              </Box>
            ) : (
              <Select
                labelId="role-select-label"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                label="Rol del Empleado"
              >
                <MenuItem value="remove">
                  <em>Sin Rol (Remover)</em>
                </MenuItem>
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name.toUpperCase()} {r.description ? `(${r.description})` : ""}
                  </MenuItem>
                ))}
              </Select>
            )}
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} disabled={saving} variant="outlined">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={saving || loadingRoles}
        >
          {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditEmployeeModal;
