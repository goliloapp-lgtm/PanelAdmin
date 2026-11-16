"use client";

import React, { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Stack,
  Typography,
  Tooltip,
} from "@mui/material";
import {
  IconArrowLeft,
  IconEdit,
  IconPhone,
  IconBrandWhatsapp,
  IconMail,
  IconMapPin,
  IconReceiptTax,
  IconBuilding,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { B2BCompany } from "@/types/b2b";
import {
  getB2BCompanyById,
  getOperatingCountriesFromClaims,
  updateB2BCompany,
} from "@/services/b2b";
import StatusBadge from "../../_components/StatusBadge";
import CompanyBalanceCard from "../../_components/CompanyBalanceCard";
import CostCenterManager from "../../_components/CostCenterManager";
import CompanyForm from "../../_components/CompanyForm";
import toast from "react-hot-toast";

export default function EmpresaDetailPage() {
  const params = useParams();
  const companyId = params?.id as string;

  const [company, setCompany] = useState<B2BCompany | null>(null);
  // País del path del que se leyó la empresa. Manda en TODA lectura y escritura
  // de esta pantalla: la empresa puede vivir en cualquiera de los países donde
  // opera la cuenta, no en un `sv` fijo, y el servicio no adivina el país.
  const [companyCountry, setCompanyCountry] = useState<string>("");
  // Empresa que no está en ninguno de los países del operador (o cuenta sin
  // países declarados): se explica el caso en pantalla, sin caer a `sv`.
  const [scopeMessage, setScopeMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEditModal, setOpenEditModal] = useState(false);

  const fetchCompany = async () => {
    try {
      setLoading(true);
      // Los países salen del MISMO claim `countryIds` que usa el listado: son
      // los que evalúa `isInCountry()` en firestore.rules.
      const operatingCountries = await getOperatingCountriesFromClaims();

      if (operatingCountries.length === 0) {
        setCompany(null);
        setCompanyCountry("");
        setScopeMessage(
          "Tu cuenta no declara países donde operar. Pide a un administrador que asigne tu país para ver las empresas."
        );
        return;
      }

      // Se prueba `countries/{cc}/b2bCompanies/{id}` en el orden del claim y el
      // primer hit gana. Ese país es el que después viaja a las escrituras.
      let resolvedCompany: B2BCompany | null = null;
      let resolvedCountry = "";
      for (const countryCode of operatingCountries) {
        const data = await getB2BCompanyById(companyId, countryCode);
        if (data) {
          resolvedCompany = data;
          resolvedCountry = countryCode;
          break;
        }
      }

      if (!resolvedCompany) {
        setCompany(null);
        setCompanyCountry("");
        setScopeMessage(
          `La empresa ${companyId} no existe o no está en los países donde operás (${operatingCountries
            .map((countryCode) => countryCode.toUpperCase())
            .join(", ")}).`
        );
        return;
      }

      setScopeMessage(null);
      setCompany(resolvedCompany);
      setCompanyCountry(resolvedCountry);
    } catch (err) {
      console.error("Error fetching company:", err);
      setCompany(null);
      setCompanyCountry("");
      setScopeMessage("No pudimos cargar los datos de la empresa.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    }
  }, [companyId]);

  const handleUpdate = async (
    data: Omit<B2BCompany, "id" | "createdAt" | "updatedAt">
  ) => {
    // Sin país resuelto no se escribe: el servicio completaría `sv` y esta
    // pantalla nunca escribe en una ruta que no leyó.
    if (!companyCountry) {
      toast.error("No se pudo determinar el país de la empresa.");
      throw new Error("country-not-resolved");
    }
    try {
      // El país resuelto viaja en la escritura: los datos del formulario no
      // deciden sobre qué ruta se escribe.
      await updateB2BCompany(companyId, data, companyCountry);
      toast.success("Empresa actualizada");
      fetchCompany();
    } catch (err) {
      toast.error("Error al actualizar empresa");
      throw err;
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  // La empresa no está en ningún país donde la cuenta opera: se dice, en vez de
  // mostrar un perfil vacío o de rebotar al listado sin explicación.
  if (scopeMessage) {
    return (
      <PageContainer
        title="Empresa no disponible | Detalle Empresa B2B"
        description="Perfil corporativo, datos fiscales y centros de costo"
      >
        <Alert severity="warning" sx={{ mb: 3 }}>
          {scopeMessage}
        </Alert>
        <Button
          component={Link}
          href="/Empresas"
          startIcon={<IconArrowLeft size={18} />}
          color="inherit"
        >
          Volver a Empresas
        </Button>
      </PageContainer>
    );
  }

  if (!company || !companyCountry) return null;

  return (
    <PageContainer
      title={`${company.tradeName} | Detalle Empresa B2B`}
      description="Perfil corporativo, datos fiscales y centros de costo"
    >
      {/* Botón Volver y Header */}
      <Box sx={{ mb: 3 }}>
        <Button
          component={Link}
          href="/Empresas"
          startIcon={<IconArrowLeft size={18} />}
          sx={{ mb: 2 }}
          color="inherit"
        >
          Volver a Empresas
        </Button>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h3" fontWeight={700}>
                {company.tradeName}
              </Typography>
              <StatusBadge status={company.status} type="company" />
            </Stack>
            <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 0.5 }}>
              {company.legalName}
            </Typography>
          </Box>

          <Button
            variant="outlined"
            startIcon={<IconEdit size={18} />}
            onClick={() => setOpenEditModal(true)}
          >
            Editar Empresa
          </Button>
        </Stack>
      </Box>

      {/* Contenido Principal */}
      <Grid container spacing={3}>
        {/* Columna Izquierda: Información Fiscal y Centros de Costo */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={3}>
            {/* Card Datos Fiscales y Contacto */}
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Información Fiscal y Contacto
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      NIT El Salvador
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {company.nit}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      NRC (Registro Contribuyente)
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {company.nrc}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      Contacto Autorizado
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {company.contactName}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      Correo Electrónico
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <IconMail size={16} color="#64748B" />
                      <Typography variant="body2">{company.email}</Typography>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      Teléfono
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <IconPhone size={16} color="#64748B" />
                      <Typography variant="body2">{company.phone}</Typography>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      WhatsApp Operativo
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <IconBrandWhatsapp size={16} color="#22C55E" />
                      <Typography variant="body2">{company.whatsapp}</Typography>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">
                      Dirección Fiscal / Operativa
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.5 }}>
                      <IconMapPin size={16} color="#64748B" style={{ marginTop: 2 }} />
                      <Typography variant="body2">{company.address}</Typography>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Módulo de Centros de Costo */}
            <CostCenterManager
              companyId={company.id}
              countryCode={companyCountry}
            />
          </Stack>
        </Grid>

        {/* Columna Derecha: Estado de Cuenta y Acciones */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3}>
            {/* Card Saldo y Balance */}
            <CompanyBalanceCard company={company} />

            {/* Acciones Rápidas */}
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
                  Operaciones Rápidas
                </Typography>
                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    fullWidth
                    component={Link}
                    href={`/Solicitudes/nueva?companyId=${company.id}`}
                  >
                    Nueva Solicitud para esta Empresa
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    component={Link}
                    href={`/Facturacion?companyId=${company.id}`}
                  >
                    Ver Facturas de la Empresa
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* Modal Editar */}
      <CompanyForm
        open={openEditModal}
        onClose={() => setOpenEditModal(false)}
        onSubmit={handleUpdate}
        initialData={company}
        countryId={companyCountry}
      />
    </PageContainer>
  );
}
