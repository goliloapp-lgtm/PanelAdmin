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
} from "@mui/material";
import { IconBrandGoogle } from "@tabler/icons-react";
import Link from "next/link";

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
              component={Link}
              href="/"
              fontWeight="500"
              sx={{
                textDecoration: "none",
                color: "primary.main",
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

      {subtitle}
    </>
  );
};

export default AuthLogin;
