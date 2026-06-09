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
  Autocomplete,
} from "@mui/material";
import { updateUser } from "@/utils/user";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { firebaseApp } from "@/utils/firebase";
import toast from "react-hot-toast";

interface AssignRoleModalProps {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface UserOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role?: string;
}

interface RoleDoc {
  id: string;
  name: string;
  description: string;
}

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({
  open,
  onClose,
  onUpdate,
}) => {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        setLoading(true);
        setSelectedUser(null);
        setSelectedRoleId("");
        try {
          const db = getFirestore(firebaseApp);
          
          // 1. Fetch all roles
          const rolesSnap = await getDocs(collection(db, "roles"));
          const fetchedRoles: RoleDoc[] = [];
          const rolesMap: Record<string, boolean> = {};
          
          rolesSnap.forEach((doc) => {
            const data = doc.data();
            const roleId = doc.id;
            fetchedRoles.push({
              id: roleId,
              name: data.name || "N/A",
              description: data.description || "",
            });
            rolesMap[roleId] = true;
          });
          setRoles(fetchedRoles);

          // 2. Fetch all users
          const usersSnap = await getDocs(collection(db, "users"));
          const fetchedUsers: UserOption[] = [];
          
          usersSnap.forEach((doc) => {
            const data = doc.data();
            const userRole = data.role || "";
            
            // Exclude users who already have an active employee role (present in rolesMap)
            const hasEmployeeRole = rolesMap[userRole] && userRole !== "passenger";
            
            if (!hasEmployeeRole) {
              fetchedUsers.push({
                id: doc.id,
                email: data.email || "N/A",
                firstName: data.firstName || "N/A",
                lastName: data.lastName || "N/A",
                phone: data.phone || "N/A",
                role: userRole,
              });
            }
          });
          
          // Sort users by first name
          fetchedUsers.sort((a, b) => a.firstName.localeCompare(b.firstName));
          setUsers(fetchedUsers);
        } catch (error) {
          console.error("Error loading data for assignment:", error);
          toast.error("Error al cargar los datos de asignación");
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [open]);

  const handleAssign = async () => {
    if (!selectedUser) {
      toast.error("Por favor, seleccione un usuario.");
      return;
    }
    if (!selectedRoleId) {
      toast.error("Por favor, seleccione un rol.");
      return;
    }

    setSaving(true);
    try {
      await updateUser(selectedUser.id, { role: selectedRoleId });
      toast.success("Rol asignado exitosamente");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error assigning role:", error);
      toast.error("Ocurrió un error al asignar el rol");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Asignar Rol a un Usuario</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, gap: 1.5, alignItems: "center" }}>
            <CircularProgress size={24} />
            <Typography variant="body2">Cargando usuarios y roles...</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
            <Autocomplete
              options={users}
              getOptionLabel={(option) =>
                `${option.firstName} ${option.lastName} (${option.email})`
              }
              value={selectedUser}
              onChange={(event, newValue) => setSelectedUser(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Buscar Usuario por Nombre o Email"
                  placeholder="Escribe para buscar..."
                  variant="outlined"
                  fullWidth
                />
              )}
              noOptionsText="No se encontraron usuarios elegibles"
            />

            {selectedUser && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Detalles del Usuario Seleccionado
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Nombre completo:</strong> {selectedUser.firstName} {selectedUser.lastName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Email:</strong> {selectedUser.email}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Teléfono:</strong> {selectedUser.phone}
                </Typography>
                {selectedUser.role && selectedUser.role !== "" && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Rol actual:</strong> {selectedUser.role}
                  </Typography>
                )}
              </Box>
            )}

            <FormControl fullWidth variant="outlined">
              <InputLabel id="assign-role-select-label">Rol a Asignar</InputLabel>
              <Select
                labelId="assign-role-select-label"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                label="Rol a Asignar"
                disabled={!selectedUser}
              >
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name.toUpperCase()} {r.description ? `(${r.description})` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} disabled={saving} variant="outlined">
          Cancelar
        </Button>
        <Button
          onClick={handleAssign}
          variant="contained"
          color="primary"
          disabled={saving || loading || !selectedUser || !selectedRoleId}
        >
          {saving ? "Asignando..." : "Asignar Rol"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssignRoleModal;
