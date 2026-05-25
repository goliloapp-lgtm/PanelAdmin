'use client'

import React, { useState } from "react";
import AuthGuard from "../components/AuthGuard";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  CircularProgress,
  Stack,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from "@mui/material";
import {
  runCleanupOnDemandCallable,
  cleanupRideRequestsOnlyCallable,
  cleanupInactiveDriversOnlyCallable,
  sendWelcomeEmailCallable,
  requestEmailVerificationCodeCallable,
  verifyEmailCodeCallable,
  getEmailVerificationStatusCallable,
} from "@/utils/functions";
import toast from "react-hot-toast";

export default function MaintenancePage() {
  // General states
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  // Cleanup results states
  const [cleanupResult, setCleanupResult] = useState<{
    success: boolean;
    tripsCleaned?: number;
    driversCleaned?: number;
    message: string;
  } | null>(null);

  // Email flows states
  const [welcomeEmail, setWelcomeEmail] = useState("");
  const [welcomeName, setWelcomeName] = useState("");
  const [welcomeLocale, setWelcomeLocale] = useState<"es" | "en">("es");

  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyLocale, setVerifyLocale] = useState<"es" | "en">("es");

  const [checkEmail, setCheckEmail] = useState("");
  const [checkCode, setCheckCode] = useState("");

  const [statusUserId, setStatusUserId] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<{
    isVerified: boolean;
    verifiedAt?: string | null;
  } | null>(null);

  // --- CLEANUP HANDLERS ---
  const handleFullCleanup = async () => {
    setLoadingAction("full-cleanup");
    setCleanupResult(null);
    try {
      const res = await runCleanupOnDemandCallable();
      setCleanupResult(res.data);
      toast.success("Limpieza completa ejecutada con éxito");
    } catch (err: any) {
      console.error(err);
      toast.error(`Error al ejecutar limpieza completa: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTripsCleanup = async () => {
    setLoadingAction("trips-cleanup");
    setCleanupResult(null);
    try {
      const res = await cleanupRideRequestsOnlyCallable();
      setCleanupResult(res.data);
      toast.success("Limpieza de viajes completada");
    } catch (err: any) {
      console.error(err);
      toast.error(`Error al limpiar viajes: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDriversCleanup = async () => {
    setLoadingAction("drivers-cleanup");
    setCleanupResult(null);
    try {
      const res = await cleanupInactiveDriversOnlyCallable();
      setCleanupResult(res.data);
      toast.success("Limpieza de conductores inactivos completada");
    } catch (err: any) {
      console.error(err);
      toast.error(`Error al limpiar conductores: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // --- EMAIL FLOW HANDLERS ---
  const handleSendWelcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!welcomeEmail) return;
    setLoadingAction("welcome-email");
    try {
      const res = await sendWelcomeEmailCallable({
        email: welcomeEmail,
        displayName: welcomeName || undefined,
        locale: welcomeLocale,
      });
      if (res.data.success) {
        toast.success(res.data.message || "Correo de bienvenida enviado!");
        setWelcomeEmail("");
        setWelcomeName("");
      } else {
        toast.error(res.data.message || "Ocurrió un error al enviar el correo");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Error: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRequestVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyEmail) return;
    setLoadingAction("request-verification");
    try {
      const res = await requestEmailVerificationCodeCallable({
        email: verifyEmail,
        locale: verifyLocale,
      });
      if (res.data.success) {
        toast.success(res.data.message || "Código de verificación enviado!");
        setCheckEmail(verifyEmail); // Prefill checking form
        setVerifyEmail("");
      } else {
        toast.error(res.data.message || "Error al solicitar el código");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Error: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkEmail || !checkCode) return;
    setLoadingAction("verify-code");
    try {
      const res = await verifyEmailCodeCallable({
        email: checkEmail,
        code: checkCode,
      });
      if (res.data.success) {
        toast.success(res.data.message || "Código verificado y correo marcado con éxito!");
        setCheckCode("");
      } else {
        toast.error(res.data.message || "Error al verificar código");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Error: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusUserId) return;
    setLoadingAction("check-status");
    setVerificationStatus(null);
    try {
      const res = await getEmailVerificationStatusCallable({
        userId: statusUserId,
      });
      setVerificationStatus(res.data);
      toast.success("Estado de verificación recuperado");
    } catch (err: any) {
      console.error(err);
      toast.error(`Error al recuperar estado: ${err.message || err}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <AuthGuard>
      <PageContainer title="Mantenimiento de Datos" description="Operaciones de limpieza y simulador de correos">
        <Box sx={{ mt: 2 }}>
          <Typography variant="h4" fontWeight="700" sx={{ mb: 1 }}>
            Mantenimiento y Control
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mb: 4 }}>
            Ejecuta las Cloud Functions de limpieza para liberar espacio de ride requests antiguos y conductores inactivos, o simula y diagnostica los correos y verificaciones.
          </Typography>

          <Grid container spacing={3}>
            {/* Left Column: Database Cleanups */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" fontWeight="600" sx={{ mb: 2 }}>
                    Limpieza de Base de Datos
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                    Estas operaciones remueven registros obsoletos del Realtime Database y actualizan el estado de actividad de los conductores en Firestore.
                  </Typography>

                  <Stack spacing={2} sx={{ mb: 4 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      onClick={handleFullCleanup}
                      disabled={loadingAction !== null}
                      fullWidth
                    >
                      {loadingAction === "full-cleanup" ? (
                        <CircularProgress size={24} color="inherit" />
                      ) : (
                        "Ejecutar Limpieza Completa (Bajo Demanda)"
                      )}
                    </Button>

                    <Button
                      variant="outlined"
                      color="secondary"
                      size="medium"
                      onClick={handleTripsCleanup}
                      disabled={loadingAction !== null}
                      fullWidth
                    >
                      {loadingAction === "trips-cleanup" ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        "Limpiar Solo Ride Requests Completados"
                      )}
                    </Button>

                    <Button
                      variant="outlined"
                      color="warning"
                      size="medium"
                      onClick={handleDriversCleanup}
                      disabled={loadingAction !== null}
                      fullWidth
                    >
                      {loadingAction === "drivers-cleanup" ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        "Limpiar Conductores Inactivos (+ Firestore)"
                      )}
                    </Button>
                  </Stack>

                  <Divider />

                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                      Resultado de la Última Ejecución
                    </Typography>
                    {cleanupResult ? (
                      <Alert severity={cleanupResult.success ? "success" : "error"} sx={{ mt: 1 }}>
                        <Typography variant="body2" fontWeight="600">
                          {cleanupResult.message}
                        </Typography>
                        {cleanupResult.success && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" display="block">
                              • Solicitudes de viajes eliminadas: {cleanupResult.tripsCleaned ?? 0}
                            </Typography>
                            <Typography variant="caption" display="block">
                              • Conductores limpiados de RTDB y desactivados en Firestore: {cleanupResult.driversCleaned ?? 0}
                            </Typography>
                          </Box>
                        )}
                      </Alert>
                    ) : (
                      <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                        No se ha ejecutado ninguna limpieza en esta sesión.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Right Column: Email Flows & Verification Simulator */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" fontWeight="600" sx={{ mb: 2 }}>
                    Pruebas y Diagnóstico de Correos
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                    Monitorea y prueba los flujos de correo electrónico y de verificación para usuarios (pasajeros/conductores).
                  </Typography>

                  {/* Welcome Email Simulator */}
                  <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1, mt: 1 }}>
                    1. Simular Envío de Correo de Bienvenida
                  </Typography>
                  <Box component="form" onSubmit={handleSendWelcome} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Correo electrónico"
                          size="small"
                          fullWidth
                          value={welcomeEmail}
                          onChange={(e) => setWelcomeEmail(e.target.value)}
                          required
                          type="email"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Nombre (opcional)"
                          size="small"
                          fullWidth
                          value={welcomeName}
                          onChange={(e) => setWelcomeName(e.target.value)}
                        />
                      </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Idioma</InputLabel>
                        <Select
                          value={welcomeLocale}
                          label="Idioma"
                          onChange={(e) => setWelcomeLocale(e.target.value as any)}
                        >
                          <MenuItem value="es">Español</MenuItem>
                          <MenuItem value="en">Inglés</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        type="submit"
                        variant="contained"
                        color="secondary"
                        disabled={loadingAction !== null}
                        size="medium"
                      >
                        {loadingAction === "welcome-email" ? <CircularProgress size={20} /> : "Enviar Correo"}
                      </Button>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  {/* Verification Code Requester */}
                  <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                    2. Enviar Código de Verificación de Correo (15 min TTL)
                  </Typography>
                  <Box component="form" onSubmit={handleRequestVerification} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 8 }}>
                        <TextField
                          label="Correo a verificar"
                          size="small"
                          fullWidth
                          value={verifyEmail}
                          onChange={(e) => setVerifyEmail(e.target.value)}
                          required
                          type="email"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Idioma</InputLabel>
                          <Select
                            value={verifyLocale}
                            label="Idioma"
                            onChange={(e) => setVerifyLocale(e.target.value as any)}
                          >
                            <MenuItem value="es">Español</MenuItem>
                            <MenuItem value="en">Inglés</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={loadingAction !== null}
                      >
                        {loadingAction === "request-verification" ? <CircularProgress size={20} /> : "Enviar Código"}
                      </Button>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  {/* Verification Code Tester */}
                  <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                    3. Validar Código de Correo e Iniciar Verificación
                  </Typography>
                  <Box component="form" onSubmit={handleVerifyCode} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 7 }}>
                        <TextField
                          label="Correo electrónico"
                          size="small"
                          fullWidth
                          value={checkEmail}
                          onChange={(e) => setCheckEmail(e.target.value)}
                          required
                          type="email"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                          label="Código de 6 dígitos"
                          size="small"
                          fullWidth
                          value={checkCode}
                          onChange={(e) => setCheckCode(e.target.value)}
                          required
                          inputProps={{ maxLength: 6 }}
                        />
                      </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        type="submit"
                        variant="contained"
                        color="success"
                        disabled={loadingAction !== null}
                        sx={{ color: '#fff' }}
                      >
                        {loadingAction === "verify-code" ? <CircularProgress size={20} /> : "Verificar e Iniciar"}
                      </Button>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  {/* Status Checker */}
                  <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                    4. Consultar Estado de Verificación de Correo
                  </Typography>
                  <Box component="form" onSubmit={handleCheckStatus} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField
                        label="User ID (UID de Firebase)"
                        size="small"
                        fullWidth
                        value={statusUserId}
                        onChange={(e) => setStatusUserId(e.target.value)}
                        required
                      />
                      <Button
                        type="submit"
                        variant="outlined"
                        color="primary"
                        disabled={loadingAction !== null}
                      >
                        {loadingAction === "check-status" ? <CircularProgress size={20} /> : "Consultar"}
                      </Button>
                    </Box>
                    {verificationStatus !== null && (
                      <Alert severity={verificationStatus.isVerified ? "success" : "warning"} sx={{ mt: 1 }}>
                        <Typography variant="body2" fontWeight="600">
                          {verificationStatus.isVerified
                            ? "✅ El correo del usuario ya está VERIFICADO"
                            : "⚠️ El correo del usuario NO está verificado"}
                        </Typography>
                        {verificationStatus.isVerified && verificationStatus.verifiedAt && (
                          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                            Fecha de verificación: {new Date(verificationStatus.verifiedAt).toLocaleString()}
                          </Typography>
                        )}
                      </Alert>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </PageContainer>
    </AuthGuard>
  );
}
