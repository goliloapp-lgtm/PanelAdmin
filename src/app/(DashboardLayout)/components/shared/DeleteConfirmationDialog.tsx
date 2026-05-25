import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Typography,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  itemName: string;
  itemType: "conductor" | "usuario" | "pasajero";
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onClose,
  onConfirm,
  itemName,
  itemType,
}) => {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (confirmText.toUpperCase() !== "ELIMINAR") return;
    setLoading(true);
    try {
      await onConfirm();
      setConfirmText("");
    } catch (error) {
      console.error("Error during deletion:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setConfirmText("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "error.light", color: "error.contrastText", py: 2 }}>
        <WarningAmberIcon fontSize="large" />
        <Typography variant="h6" fontWeight="bold">
          Confirmar Eliminación
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <DialogContentText sx={{ mb: 2 }}>
          Esta acción es <strong>irreversible</strong> y eliminará por completo todos los datos asociados a este {itemType}: <strong>{itemName}</strong> de la base de datos (Firestore y Realtime Database).
        </DialogContentText>
        <DialogContentText sx={{ mb: 3, fontWeight: "bold" }}>
          Para confirmar, escribe la palabra <strong>ELIMINAR</strong> a continuación:
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="ELIMINAR"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={loading}
          inputProps={{ style: { textTransform: "uppercase" } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} disabled={loading} variant="outlined">
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          color="error"
          variant="contained"
          disabled={confirmText.toUpperCase() !== "ELIMINAR" || loading}
        >
          {loading ? "Eliminando..." : "Eliminar Permanentemente"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;
