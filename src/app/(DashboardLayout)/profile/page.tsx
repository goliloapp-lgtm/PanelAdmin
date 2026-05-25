'use client'
import React, { useState, useEffect, useRef } from "react";
import AuthGuard from "../components/AuthGuard";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  TextField,
  Button,
  Avatar,
  IconButton,
  CircularProgress,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { CameraAlt } from "@mui/icons-material";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseApp } from "@/utils/firebase";
import toast from "react-hot-toast";
import { getUserRole } from "@/utils/adminCheck";
import { useRouter } from "next/navigation";
import {
  requestAccountDeletionCodeCallable,
  confirmAccountDeletionCallable,
} from "@/utils/functions";

export default function ProfilePage() {
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const storage = getStorage(firebaseApp);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Account Deletion States
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleRequestDeleteCode = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await requestAccountDeletionCodeCallable({ locale: "es" });
      if (res.data.success) {
        toast.success(res.data.message || "Código enviado a tu correo.");
        setDeleteStep(2);
      } else {
        setDeleteError(res.data.message || "Error al solicitar código");
      }
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || "No se pudo enviar el código de eliminación");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await confirmAccountDeletionCallable({
        userId: user.uid,
        code: deleteCode,
      });
      if (res.data.success) {
        toast.success("Cuenta eliminada permanentemente.");
        setDeleteOpen(false);
        await auth.signOut();
        router.push("/authentication/login");
      } else {
        setDeleteError(res.data.message || "Error al confirmar eliminación");
      }
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || "Código inválido o error del sistema");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleOpenDeleteDialog = () => {
    setDeleteStep(1);
    setDeleteCode("");
    setDeleteError("");
    setDeleteOpen(true);
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleName, setRoleName] = useState("Cargando...");
  const [profileImageUrl, setProfileImageUrl] = useState("/images/profile/user-1.jpg");

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    async function loadUserProfile() {
      try {
        const userRef = doc(db, "users", user!.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setFirstName(data.firstName || "");
          setLastName(data.lastName || "");
          setEmail(data.email || user!.email || "");
          setPhone(data.phone || "");
          setProfileImageUrl(data.profileImageUrl || data.profilePhoto || user!.photoURL || "/images/profile/user-1.jpg");
        } else {
          setEmail(user!.email || "");
        }

        const role = await getUserRole(user!.uid);
        if (role) {
          setRoleName(role.name.toUpperCase() + ` (${role.description})`);
        } else {
          setRoleName("SIN ROL ASIGNADO");
        }
      } catch (error) {
        console.error("Error loading user profile:", error);
        toast.error("Error al cargar los datos del perfil");
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [auth.currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        firstName,
        lastName,
        phone,
        profileImageUrl,
      });

      toast.success("Perfil actualizado con éxito");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Ocurrió un error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) return;

    setUploading(true);
    try {
      const imageRef = sRef(storage, `admin-profiles/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(imageRef, file);
      const downloadUrl = await getDownloadURL(imageRef);
      setProfileImageUrl(downloadUrl);
      toast.success("Foto de perfil subida correctamente");
    } catch (error) {
      console.error("Error uploading profile image:", error);
      toast.error("Error al subir la imagen de perfil");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AuthGuard>
      <PageContainer title="Mi Perfil" description="Edita los datos de tu cuenta">
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
            <CircularProgress color="primary" />
            <Typography variant="body1" color="textSecondary">
              Cargando perfil...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ maxWidth: 800, mx: "auto", mt: 2 }}>
            <Typography variant="h4" fontWeight="700" sx={{ mb: 3 }}>
              Configuración de Perfil
            </Typography>
            <Card>
              <CardContent sx={{ p: 4 }}>
                <form onSubmit={handleSave}>
                  <Grid container spacing={4}>
                    {/* Left side: Avatar Upload */}
                    <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ position: 'relative', mb: 2 }}>
                        <Avatar
                          src={profileImageUrl}
                          alt="Foto de perfil"
                          sx={{ width: 140, height: 140, border: '4px solid', borderColor: 'primary.light' }}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          onChange={handleImageChange}
                        />
                        <IconButton
                          color="primary"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            bgcolor: 'background.paper',
                            boxShadow: 3,
                            '&:hover': { bgcolor: 'primary.light', color: 'primary.contrastText' }
                          }}
                        >
                          {uploading ? <CircularProgress size={24} /> : <CameraAlt />}
                        </IconButton>
                      </Box>
                      <Typography variant="body2" color="textSecondary" align="center">
                        Haz clic en el icono para subir una nueva foto
                      </Typography>
                    </Grid>

                    {/* Right side: User Form Fields */}
                    <Grid size={{ xs: 12, md: 8 }}>
                      <Stack spacing={3}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="Nombre"
                              fullWidth
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              required
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="Apellido"
                              fullWidth
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              required
                            />
                          </Grid>
                        </Grid>

                        <TextField
                          label="Correo Electrónico"
                          fullWidth
                          value={email}
                          InputProps={{ readOnly: true }}
                          variant="filled"
                        />

                        <TextField
                          label="Teléfono"
                          fullWidth
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />

                        <TextField
                          label="Rol Administrativo"
                          fullWidth
                          value={roleName}
                          InputProps={{ readOnly: true }}
                          variant="filled"
                        />

                        <Divider />

                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                          <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            size="large"
                            disabled={saving}
                            sx={{ px: 4 }}
                          >
                            {saving ? "Guardando..." : "Guardar Cambios"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Grid>
                  </Grid>
                </form>
              </CardContent>
            </Card>

            {/* Danger Zone Card */}
            <Card sx={{ mt: 3, border: '1px solid', borderColor: 'error.light' }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" fontWeight="600" color="error" sx={{ mb: 1 }}>
                  Zona de Peligro
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                  Una vez que elimines tu cuenta de administrador, no habrá marcha atrás. Todos tus datos y accesos serán eliminados permanentemente.
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  size="large"
                  onClick={handleOpenDeleteDialog}
                >
                  Eliminar Mi Cuenta de Administrador
                </Button>
              </CardContent>
            </Card>

            {/* Account Deletion Dialog */}
            <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)} maxWidth="xs" fullWidth>
              <DialogTitle color="error" fontWeight="600">Eliminar Cuenta de Administrador</DialogTitle>
              <DialogContent>
                {deleteStep === 1 ? (
                  <Box sx={{ mt: 1 }}>
                    <DialogContentText sx={{ mb: 3, color: 'text.primary' }}>
                      ¿Estás completamente seguro de que deseas eliminar tu cuenta? Esta acción es <strong>irreversible</strong>.
                    </DialogContentText>
                    <DialogContentText sx={{ mb: 3 }}>
                      Al hacer clic en el botón a continuación, se enviará un código de verificación de 6 dígitos a tu correo electrónico para confirmar la eliminación.
                    </DialogContentText>
                    {deleteError && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{deleteError}</Typography>}
                    <DialogActions sx={{ px: 0 }}>
                      <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>Cancelar</Button>
                      <Button onClick={handleRequestDeleteCode} variant="contained" color="error" disabled={deleteLoading}>
                        {deleteLoading ? <CircularProgress size={24} color="inherit" /> : "Enviar Código de Confirmación"}
                      </Button>
                    </DialogActions>
                  </Box>
                ) : (
                  <Box component="form" onSubmit={handleConfirmDelete} sx={{ mt: 1 }}>
                    <DialogContentText sx={{ mb: 2, color: 'text.primary' }}>
                      Hemos enviado un código de confirmación a tu correo. Por favor, ingrésalo a continuación para confirmar la eliminación de tu cuenta.
                    </DialogContentText>
                    <TextField
                      autoFocus
                      label="Código de 6 dígitos"
                      fullWidth
                      variant="outlined"
                      value={deleteCode}
                      onChange={(e) => setDeleteCode(e.target.value)}
                      required
                      disabled={deleteLoading}
                      inputProps={{ maxLength: 6 }}
                      sx={{ mb: 2 }}
                    />
                    {deleteError && <Typography color="error" variant="body2" sx={{ mt: 1, mb: 1 }}>{deleteError}</Typography>}
                    <DialogActions sx={{ px: 0, mt: 2 }}>
                      <Button onClick={() => setDeleteStep(1)} disabled={deleteLoading}>Atrás</Button>
                      <Button type="submit" variant="contained" color="error" disabled={deleteLoading}>
                        {deleteLoading ? <CircularProgress size={24} color="inherit" /> : "Eliminar Cuenta Permanentemente"}
                      </Button>
                    </DialogActions>
                  </Box>
                )}
              </DialogContent>
            </Dialog>
          </Box>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
