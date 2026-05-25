import React, { useState } from "react";
import { login, logout, loginWithGoogle } from "@/utils/auth";
import { isUserAdmin } from "@/utils/adminCheck";
import { useRouter } from "next/navigation";

import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Button,
  Stack,
  Checkbox,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  CircularProgress,
} from "@mui/material";
import { IconBrandGoogle } from "@tabler/icons-react";
import Link from "next/link";
import {
  requestPasswordResetCodeCallable,
  verifyPasswordResetCodeAndUpdatePasswordCallable,
} from "@/utils/functions";
import toast from "react-hot-toast";

import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";

interface loginType {
  title?: string;
  subtitle?: React.ReactNode;
  subtext?: React.ReactNode;
}

const AuthLogin = ({ title, subtitle, subtext }: loginType) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  // Password Reset Dialog States
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    setResetError("");
    try {
      const res = await requestPasswordResetCodeCallable({ email: resetEmail, locale: "es" });
      if (res.data.success) {
        toast.success(res.data.message || "Código enviado. Revisa tu correo.");
        setResetStep(2);
      } else {
        setResetError(res.data.message || "Error al solicitar código");
      }
    } catch (err: any) {
      console.error(err);
      setResetError(err.message || "Ocurrió un error al enviar el código");
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetAndChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetCode || !resetNewPassword) return;
    setResetLoading(true);
    setResetError("");
    try {
      const res = await verifyPasswordResetCodeAndUpdatePasswordCallable({
        email: resetEmail,
        code: resetCode,
        newPassword: resetNewPassword,
      });
      if (res.data.success) {
        toast.success("Contraseña actualizada con éxito.");
        setResetOpen(false);
        // Reset states
        setResetStep(1);
        setResetEmail("");
        setResetCode("");
        setResetNewPassword("");
      } else {
        setResetError(res.data.message || "Error al actualizar contraseña");
      }
    } catch (err: any) {
      console.error(err);
      setResetError(err.message || "Código inválido o contraseña débil");
    } finally {
      setResetLoading(false);
    }
  };

  const handleOpenResetDialog = () => {
    setResetEmail(email); // Autofill with email entered in login form
    setResetStep(1);
    setResetError("");
    setResetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const userCredential = await login(email, password);
      const uid = userCredential.user.uid;
      const isAdmin = await isUserAdmin(uid);
      console.log("Is user admin:", isAdmin);
      if (isAdmin) {
        router.push("/");
      } else {
        await logout();
        setError("Solo los administradores pueden iniciar sesión.");
      }
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    try {
      const userCredential = await loginWithGoogle();
      const uid = userCredential.user.uid;
      const isAdmin = await isUserAdmin(uid);
      console.log("Is user admin (Google):", isAdmin);
      if (isAdmin) {
        router.push("/");
      } else {
        await logout();
        setError("Solo los administradores pueden iniciar sesión.");
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || "Error al iniciar sesión con Google");
      }
    }
  };

  return (
    <>
      {title ? (
        <Typography fontWeight="700" variant="h2" mb={1}>
          {title}
        </Typography>
      ) : null}

      {subtext}

      <form onSubmit={handleSubmit}>
        <Stack>
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              component="label"
              htmlFor="email"
              mb="5px"
            >
              Correo
            </Typography>
            <CustomTextField
              id="email"
              name="email"
              variant="outlined"
              fullWidth
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="Correo"
            />
          </Box>
          <Box mt="25px">
            <Typography
              variant="subtitle1"
              fontWeight={600}
              component="label"
              htmlFor="password"
              mb="5px"
            >
              Contraseña
            </Typography>
            <CustomTextField
              id="password"
              name="password"
              type="password"
              variant="outlined"
              fullWidth
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="Contraseña"
            />
          </Box>
          <Stack
            justifyContent="space-between"
            direction="row"
            alignItems="center"
            my={2}
          >
            <FormGroup>
              <FormControlLabel
                control={<Checkbox defaultChecked />}
                label="Recordar este dispositivo"
              />
            </FormGroup>
            <Typography
              fontWeight="500"
              onClick={handleOpenResetDialog}
              sx={{
                textDecoration: "none",
                color: "primary.main",
                cursor: "pointer",
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              ¿Olvidaste tu contraseña?
            </Typography>
          </Stack>
        </Stack>
        <Box>
          <Button
            color="primary"
            variant="contained"
            size="large"
            fullWidth
            type="submit"
          >
            Iniciar Sesión
          </Button>
          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
        </Box>
      </form>

      <Box sx={{ my: 3, display: 'flex', alignItems: 'center' }}>
        <Divider sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ mx: 2, color: 'text.secondary' }}>
          o
        </Typography>
        <Divider sx={{ flexGrow: 1 }} />
      </Box>

      <Button
        variant="outlined"
        color="inherit"
        fullWidth
        size="large"
        startIcon={<IconBrandGoogle />}
        onClick={handleGoogleLogin}
        sx={{
          textTransform: 'none',
          borderColor: 'divider',
          fontWeight: 500,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          }
        }}
      >
        Iniciar Sesión con Google
      </Button>

      <Dialog open={resetOpen} onClose={() => !resetLoading && setResetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Recuperar Contraseña</DialogTitle>
        <DialogContent>
          {resetStep === 1 ? (
            <Box component="form" onSubmit={handleRequestResetCode} sx={{ mt: 1 }}>
              <DialogContentText sx={{ mb: 2 }}>
                Ingresa tu dirección de correo electrónico para recibir un código de verificación de 6 dígitos.
              </DialogContentText>
              <TextField
                autoFocus
                label="Correo Electrónico"
                type="email"
                fullWidth
                variant="outlined"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                disabled={resetLoading}
                sx={{ mb: 1 }}
              />
              {resetError && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{resetError}</Typography>}
              <DialogActions sx={{ px: 0, mt: 2 }}>
                <Button onClick={() => setResetOpen(false)} disabled={resetLoading}>Cancelar</Button>
                <Button type="submit" variant="contained" color="primary" disabled={resetLoading}>
                  {resetLoading ? <CircularProgress size={24} color="inherit" /> : "Enviar Código"}
                </Button>
              </DialogActions>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleVerifyResetAndChange} sx={{ mt: 1 }}>
              <DialogContentText sx={{ mb: 2 }}>
                Hemos enviado un código a <strong>{resetEmail}</strong>. Ingrésalo a continuación junto con tu nueva contraseña.
              </DialogContentText>
              <TextField
                autoFocus
                label="Código de 6 dígitos"
                fullWidth
                variant="outlined"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                required
                disabled={resetLoading}
                inputProps={{ maxLength: 6 }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Nueva Contraseña"
                type="password"
                fullWidth
                variant="outlined"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                required
                disabled={resetLoading}
              />
              {resetError && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{resetError}</Typography>}
              <DialogActions sx={{ px: 0, mt: 2 }}>
                <Button onClick={() => setResetStep(1)} disabled={resetLoading}>Atrás</Button>
                <Button type="submit" variant="contained" color="primary" disabled={resetLoading}>
                  {resetLoading ? <CircularProgress size={24} color="inherit" /> : "Cambiar Contraseña"}
                </Button>
              </DialogActions>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {subtitle}
    </>
  );
};

export default AuthLogin;
