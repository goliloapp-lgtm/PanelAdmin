"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/utils/firebase";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";

function EstablecerClaveAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || "";

  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setError("Enlace inválido: falta el código de activación (oobCode).");
      setVerifying(false);
      return;
    }

    let active = true;
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (active) {
          setEmail(resolvedEmail);
          setVerifying(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("El enlace ha expirado o ya fue utilizado.");
          setVerifying(false);
        }
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
      setTimeout(() => router.push("/authentication/login"), 2000);
    } catch (err: any) {
      setError(err?.message || "No se pudo establecer la contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bgcolor="#f2f6fa"
      p={2}
    >
      <Card sx={{ maxWidth: 440, width: "100%", p: 1 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Establecer Contraseña · Lilo Admin
          </Typography>
          <Typography variant="body2" color="textSecondary" mb={2.5}>
            Configura tu contraseña de plataforma para ingresar al panel administrativo.
          </Typography>

          {verifying ? (
            <Box textAlign="center" py={4}>
              <CircularProgress size={28} />
            </Box>
          ) : success ? (
            <Alert severity="success">
              Contraseña establecida correctamente. Redirigiendo a inicio de sesión...
            </Alert>
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                {email && (
                  <Alert severity="info">
                    Cuenta: <strong>{email}</strong>
                  </Alert>
                )}
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  type="password"
                  label="Nueva contraseña (mín. 8 caracteres)"
                  size="small"
                  fullWidth
                  required
                  disabled={!oobCode || submitting}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <TextField
                  type="password"
                  label="Confirmar contraseña"
                  size="small"
                  fullWidth
                  required
                  disabled={!oobCode || submitting}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={!oobCode || submitting}
                >
                  {submitting ? "Guardando..." : "Guardar Contraseña"}
                </Button>
              </Stack>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default function EstablecerClaveAdminPage() {
  return (
    <Suspense
      fallback={
        <Box
          minHeight="100vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <CircularProgress />
        </Box>
      }
    >
      <EstablecerClaveAdminContent />
    </Suspense>
  );
}
