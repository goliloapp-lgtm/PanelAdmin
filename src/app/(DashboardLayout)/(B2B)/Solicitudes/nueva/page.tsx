"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Grid,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Menu,
  ListItemIcon,
  ListItemText,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Divider,
  Chip,
} from "@mui/material";
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconMapPin,
  IconCar,
  IconUsers,
  IconPackage,
  IconCalculator,
  IconCheck,
  IconBuildingSkyscraper,
  IconChevronDown,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import {
  B2BCompany,
  B2BTraveller,
  CostCenter,
  RoutePoint,
  VehicleCategory,
} from "@/types/b2b";
import {
  subscribeToB2BCompanies,
  getCostCenters,
  getCompanyTravellers,
  createB2BServiceRequest,
} from "@/services/b2b";
import {
  EL_SALVADOR_LOCATIONS,
  EL_SALVADOR_B2B_TARIFFS,
  MAX_VEHICLE_PASSENGER_CAPACITY,
  LILO_DIRECT_CONTACT,
  B2B_RESERVATION_CONFIG,
  CAPACITY_EXCEEDED_MESSAGE_ES,
  calculateMultiStopRouteDistanceKm,
  calculateB2BTariff,
  getAllowedCategoriesForPassengers,
} from "@/utils/b2bPricing";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFareQuoteCallable } from "@/utils/functions";
import GoogleAddressAutocomplete from "../../_components/GoogleAddressAutocomplete";
import GoogleRouteMap from "../../_components/GoogleRouteMap";

const NuevaSolicitudB2BPage = () => {
  const router = useRouter();
  const { isEn } = useLanguage();
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [travellers, setTravellers] = useState<B2BTraveller[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backend quote state (getFareQuote callable)
  const [backendQuote, setBackendQuote] = useState<{
    totalAmount: number;
    farePrice: number;
    appliedFareRate: number;
    chargedDistance: number;
    minimumDistance: number;
    minimumApplied: boolean;
    taxAmount?: number;
    taxRate?: number;
    currency: string;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [companyId, setCompanyId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [travellerId, setTravellerId] = useState("");
  const [requestedByName, setRequestedByName] = useState("Coordinador Logístico SV");
  const [passengerPhone, setPassengerPhone] = useState("+503 7890-1234");
  const [passengersCount, setPassengersCount] = useState<number>(2);
  const [passengerNamesInput, setPassengerNamesInput] = useState(
    "Ing. Carlos Rivas, Lic. Sofía Méndez"
  );
  const [vehicleCategory, setVehicleCategory] =
    useState<VehicleCategory>("suv");

  const [hasCargo, setHasCargo] = useState(false);
  const [cargoDescription, setCargoDescription] = useState("");

  const [roundTrip, setRoundTrip] = useState(false);
  const [minAdvanceHours, setMinAdvanceHours] = useState<number>(3);
  const [isImmediate, setIsImmediate] = useState(false); // Inmediatos inhabilitados por política comercial El Salvador
  const [scheduledDateTime, setScheduledDateTime] = useState(() => {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  // Origen, Paradas Intermedias y Destino
  const [originIndex, setOriginIndex] = useState<number>(0);
  const [originCoord, setOriginCoord] = useState<{
    lat: number;
    lng: number;
    address: string;
  }>({
    lat: EL_SALVADOR_LOCATIONS[0].lat,
    lng: EL_SALVADOR_LOCATIONS[0].lng,
    address: EL_SALVADOR_LOCATIONS[0].address,
  });

  const [destinationIndex, setDestinationIndex] = useState<number>(7);
  const [destinationCoord, setDestinationCoord] = useState<{
    lat: number;
    lng: number;
    address: string;
  }>({
    lat: EL_SALVADOR_LOCATIONS[7].lat,
    lng: EL_SALVADOR_LOCATIONS[7].lng,
    address: EL_SALVADOR_LOCATIONS[7].address,
  });

  const [stops, setStops] = useState<
    Array<{ presetIndex: number; address: string; lat: number; lng: number }>
  >([]);

  const [googleDistanceKm, setGoogleDistanceKm] = useState<number | null>(null);
  const [googleDurationMinutes, setGoogleDurationMinutes] = useState<number | null>(null);

  const [originMenuAnchor, setOriginMenuAnchor] = useState<null | HTMLElement>(null);
  const [destMenuAnchor, setDestMenuAnchor] = useState<null | HTMLElement>(null);
  const [stopMenuAnchor, setStopMenuAnchor] = useState<{ index: number; el: HTMLElement } | null>(null);

  const [manualDistanceOverrideKm, setManualDistanceOverrideKm] = useState<
    number | ""
  >("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const unsub = subscribeToB2BCompanies((list) => {
      setCompanies(list);
      if (list.length > 0 && !companyId) {
        setCompanyId(list[0].id);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!companyId) {
      setCostCenters([]);
      setTravellers([]);
      return;
    }
    getCostCenters(companyId).then((ccs) => {
      setCostCenters(ccs);
      if (ccs.length > 0) {
        setCostCenterId(ccs[0].id);
      } else {
        setCostCenterId("");
      }
    });
    getCompanyTravellers(companyId).then((travs) => {
      setTravellers(travs);
      if (travs.length > 0) {
        setTravellerId(travs[0].id);
        setPassengerPhone(travs[0].phone || "+503 7890-1122");
      } else {
        setTravellerId("");
      }
    });
  }, [companyId]);

  // Regla de Negocio: > 4 pasajeros fuerza automáticamente Microbús
  const allowedCategories = useMemo(
    () => getAllowedCategoriesForPassengers(passengersCount),
    [passengersCount]
  );

  useEffect(() => {
    if (!allowedCategories.includes(vehicleCategory)) {
      setVehicleCategory("microbus");
    }
  }, [allowedCategories, vehicleCategory]);

  // Calcular distancia automática entre Origen -> Paradas -> Destino
  const autoOneWayDistanceKm = useMemo(() => {
    if (googleDistanceKm && googleDistanceKm > 0) {
      return roundTrip ? Number((googleDistanceKm / 2).toFixed(1)) : googleDistanceKm;
    }
    const points = [
      { lat: originCoord.lat, lng: originCoord.lng },
      ...stops.map((st) => ({ lat: st.lat, lng: st.lng })),
      { lat: destinationCoord.lat, lng: destinationCoord.lng },
    ];

    return calculateMultiStopRouteDistanceKm(points);
  }, [googleDistanceKm, roundTrip, originCoord, destinationCoord, stops]);

  const effectiveOneWayKm =
    manualDistanceOverrideKm !== "" && Number(manualDistanceOverrideKm) > 0
      ? Number(manualDistanceOverrideKm)
      : autoOneWayDistanceKm;

  const tariffBreakdown = useMemo(
    () =>
      calculateB2BTariff(vehicleCategory, effectiveOneWayKm, roundTrip),
    [vehicleCategory, effectiveOneWayKm, roundTrip]
  );

  // CF-38: Fetch official backend quote whenever legs or category change
  useEffect(() => {
    if (effectiveOneWayKm <= 0) return;
    const oneWayDuration = Math.max(5, Math.round(tariffBreakdown.estimatedDurationMinutes / (roundTrip ? 2 : 1)));
    const legs = roundTrip
      ? [
          { distance: effectiveOneWayKm, durationMinutes: oneWayDuration },
          { distance: effectiveOneWayKm, durationMinutes: oneWayDuration },
        ]
      : [{ distance: effectiveOneWayKm, durationMinutes: oneWayDuration }];

    // Map vehicleCategory to backend categoryId
    const categoryMap: Record<string, string> = {
      suv: "suv",
      pickup: "pickup",
      microbus: "microbus",
    };
    const categoryId = categoryMap[vehicleCategory] ?? vehicleCategory;

    let cancelled = false;
    setQuoteLoading(true);
    getFareQuoteCallable({ legs, categoryId })
      .then((res) => {
        if (!cancelled) {
          setBackendQuote(res.data.quote as any);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[NuevaSolicitud] getFareQuote fallback:", err?.message);
          setBackendQuote(null);
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => { cancelled = true; };
  }, [effectiveOneWayKm, vehicleCategory, roundTrip, tariffBreakdown.estimatedDurationMinutes]);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const selectedCostCenter = costCenters.find((c) => c.id === costCenterId);
  const selectedTraveller = travellers.find((t) => t.id === travellerId);

  const handleAddStop = () => {
    const defaultStopIdx = 2;
    setStops((prev) => [
      ...prev,
      {
        presetIndex: defaultStopIdx,
        address: EL_SALVADOR_LOCATIONS[defaultStopIdx].address,
        lat: EL_SALVADOR_LOCATIONS[defaultStopIdx].lat,
        lng: EL_SALVADOR_LOCATIONS[defaultStopIdx].lng,
      },
    ]);
  };

  const handleRemoveStop = (idx: number) => {
    setStops((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY) {
      setError(
        isEn
          ? "For trips with more than 12 passengers, please contact us by WhatsApp or phone and we will gladly assist you immediately.\nWe are at your service."
          : "Para viajes de más de 12 pasajeros, contáctenos por WhatsApp o llamada y con gusto le ayudaremos de inmediato.\nEstamos para servirle."
      );
      return;
    }
    if (!isImmediate) {
      const scheduledMs = new Date(scheduledDateTime).getTime();
      const minRequiredMs = Date.now() + minAdvanceHours * 60 * 60 * 1000 - 60000;
      if (isNaN(scheduledMs) || scheduledMs < minRequiredMs) {
        setError(
          isEn
            ? `Scheduled reservations must be booked at least ${minAdvanceHours} hours in advance.`
            : `Las reservas de viaje programadas deben tener al menos ${minAdvanceHours} horas de anticipación.`
        );
        return;
      }
    }
    if (!selectedCompany) {
      setError("Selecciona una empresa corporativa B2B.");
      return;
    }
    if (!originCoord.address.trim() || !destinationCoord.address.trim()) {
      setError("Ingresa la dirección de origen y destino.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const originPoint: RoutePoint = {
        address: originCoord.address.trim(),
        lat: originCoord.lat,
        lng: originCoord.lng,
      };

      const destPoint: RoutePoint = {
        address: destinationCoord.address.trim(),
        lat: destinationCoord.lat,
        lng: destinationCoord.lng,
      };

      const stopPoints: RoutePoint[] = stops.map((s) => ({
        address: s.address.trim(),
        lat: s.lat,
        lng: s.lng,
      }));

      const passengerNames = passengerNamesInput
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);

      // Build explicit legs per CF-14 (minimum applied per leg on server)
      const oneWayDuration = Math.max(
        5,
        Math.round(
          roundTrip
            ? tariffBreakdown.estimatedDurationMinutes / 2
            : tariffBreakdown.estimatedDurationMinutes
        )
      );
      const legs = roundTrip
        ? [
            { distance: effectiveOneWayKm, durationMinutes: oneWayDuration },
            { distance: effectiveOneWayKm, durationMinutes: oneWayDuration },
          ]
        : [{ distance: effectiveOneWayKm, durationMinutes: oneWayDuration }];

      await createB2BServiceRequest({
        companyId: selectedCompany.id,
        companyName: selectedCompany.tradeName || selectedCompany.legalName,
        costCenterId: selectedCostCenter?.id,
        costCenterName: selectedCostCenter?.name || "General",
        requestedByUid: "superAdminSv",
        requestedByName: requestedByName.trim() || "Coordinador B2B",
        travellerId: selectedTraveller?.id || undefined,
        travellerName: selectedTraveller?.name || undefined,
        passengersCount,
        passengerNames,
        passengerPhone: passengerPhone.trim(),
        vehicleCategory,
        hasCargo,
        cargoDescription: hasCargo ? cargoDescription.trim() : undefined,
        origin: originPoint,
        stops: stopPoints,
        destination: destPoint,
        roundTrip,
        legs,
        scheduledAt: isImmediate
          ? new Date().toISOString()
          : new Date(scheduledDateTime).toISOString(),
        isImmediate,
        estimatedDistanceKm: tariffBreakdown.billableDistanceKm,
        estimatedDurationMinutes: tariffBreakdown.estimatedDurationMinutes,
        tariffApplied: {
          category: vehicleCategory,
          ratePerKm: tariffBreakdown.ratePerKm,
          minFare: tariffBreakdown.minFare,
          baseDistanceKm: tariffBreakdown.baseDistanceKm,
          calculatedAmount: tariffBreakdown.finalFare,
        },
        finalAmount: tariffBreakdown.finalFare,
        status: "requested",
        notes: notes.trim() || undefined,
      });

      router.push("/Solicitudes");
    } catch (err: any) {
      setError(err.message || "Error al crear la solicitud de traslado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Nueva Solicitud de Traslado Corporativo | Lilo B2B"
      description="Formulario de solicitud B2B con paradas intermedias, ida/vuelta, validación de pasajeros y tarifa automática El Salvador"
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              startIcon={<IconArrowLeft size={18} />}
              onClick={() => router.push("/Solicitudes")}
            >
              Volver
            </Button>
            <Box>
              <Typography variant="h4" fontWeight={700}>
                Solicitar Traslado Corporativo (H2.4)
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Cálculo automático de distancia, paradas intermedias y tarifas oficiales B2B El Salvador
              </Typography>
            </Box>
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Columna Izquierda: Formulario de Ruta, Empresa y Pasajeros */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={3}>
              {/* 1. Empresa y Centro de Costo */}
              <DashboardCard
                title="1. Empresa Corporativa, Techo de Consumo y Viajero Hospedado"
                subtitle="Imputación presupuestaria (CF-23) y asignación a viajero registrado en `travellers` (LO-4.2)"
              >
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      fullWidth
                      label="Empresa Corporativa B2B *"
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                    >
                      {companies.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.tradeName || c.legalName} ({c.nit})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      fullWidth
                      label="Techo de Consumo / Centro de Costo *"
                      value={costCenterId}
                      onChange={(e) => setCostCenterId(e.target.value)}
                    >
                      {costCenters.length === 0 ? (
                        <MenuItem value="">General Corporativo</MenuItem>
                      ) : (
                        costCenters.map((cc) => {
                          const limitText =
                            cc.budgetLimit === null || cc.budgetLimit === undefined
                              ? "SIN LÍMITE"
                              : `$${Number(cc.budgetLimit).toFixed(2)}/ciclo`;
                          return (
                            <MenuItem key={cc.id} value={cc.id}>
                              {cc.department || cc.code || "Depto"} — {cc.name} (Techo: {limitText})
                            </MenuItem>
                          );
                        })
                      )}
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      fullWidth
                      label="Viajero Hospedado (`travellers/{travellerId}`)"
                      value={travellerId}
                      onChange={(e) => {
                        const tId = e.target.value;
                        setTravellerId(tId);
                        const found = travellers.find((t) => t.id === tId);
                        if (found) {
                          if (found.phone) setPassengerPhone(found.phone);
                          setPassengerNamesInput(found.name);
                        }
                      }}
                    >
                      <MenuItem value="">-- Selección libre / Comitiva --</MenuItem>
                      {travellers.map((t) => (
                        <MenuItem key={t.id} value={t.id}>
                          {t.name} ({t.department || t.employeeCode || "Corporativo"})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Solicitado por (Coordinador / Analista B2B)"
                      value={requestedByName}
                      onChange={(e) => setRequestedByName(e.target.value)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 12 }}>
                    <TextField
                      fullWidth
                      label="Teléfono de Contacto de Pasajeros (+503)"
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </DashboardCard>

              {/* 2. Ruta: Origen, Paradas Intermedias y Destino */}
              <DashboardCard
                title="2. Ruta: Origen, Paradas Intermedias y Destino"
                subtitle="Selecciona puntos corporativos en El Salvador o personaliza la dirección exacta"
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<IconPlus size={16} />}
                    onClick={handleAddStop}
                  >
                    Agregar Parada Intermedia
                  </Button>
                }
              >
                <Stack spacing={2.5}>
                  {/* Origen con Google Places API y menú de Hubs frecuentes */}
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        Punto de Origen *
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<IconBuildingSkyscraper size={15} color="#5D87FF" />}
                        endIcon={<IconChevronDown size={14} />}
                        onClick={(e) => setOriginMenuAnchor(e.currentTarget)}
                        sx={{
                          textTransform: "none",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          py: 0.25,
                          px: 1,
                          color: "primary.main",
                          bgcolor: "#ECF2FF",
                          borderRadius: 1.5,
                          "&:hover": { bgcolor: "#DFE5EF" },
                        }}
                      >
                        Hubs frecuentes SV
                      </Button>
                      <Menu
                        anchorEl={originMenuAnchor}
                        open={Boolean(originMenuAnchor)}
                        onClose={() => setOriginMenuAnchor(null)}
                        PaperProps={{ sx: { maxHeight: 340, width: 360, borderRadius: 2 } }}
                      >
                        <MenuItem disabled sx={{ opacity: 1, fontWeight: 700, fontSize: "0.75rem", color: "text.secondary" }}>
                          PUNTOS CORPORATIVOS FRECUENTES (EL SALVADOR)
                        </MenuItem>
                        <Divider />
                        {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                          <MenuItem
                            key={i}
                            dense
                            selected={originCoord.address === loc.address}
                            onClick={() => {
                              setOriginCoord({
                                address: loc.address,
                                lat: loc.lat,
                                lng: loc.lng,
                              });
                              setOriginMenuAnchor(null);
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 26 }}>
                              <IconMapPin size={16} color="#5D87FF" />
                            </ListItemIcon>
                            <ListItemText
                              primary={loc.label}
                              secondary={loc.address}
                              primaryTypographyProps={{ fontSize: "0.8rem", fontWeight: 600 }}
                              secondaryTypographyProps={{ fontSize: "0.7rem", noWrap: true }}
                            />
                          </MenuItem>
                        ))}
                      </Menu>
                    </Stack>
                    <GoogleAddressAutocomplete
                      placeholder="Buscar dirección o punto de interés (ej. WTC, Sheraton, Hilton, Calle El Mirador...)"
                      value={originCoord.address}
                      required
                      onChange={(sel) => {
                        setOriginCoord({
                          address: sel.address,
                          lat: sel.lat,
                          lng: sel.lng,
                        });
                      }}
                    />
                  </Box>

                  {/* Paradas intermedias dinámicas */}
                  {stops.map((stop, idx) => (
                    <Card
                      key={idx}
                      variant="outlined"
                      sx={{ bgcolor: "#f8fafc", p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                        <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                          Parada Intermedia #{idx + 1}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<IconBuildingSkyscraper size={14} color="#5D87FF" />}
                            endIcon={<IconChevronDown size={14} />}
                            onClick={(e) => setStopMenuAnchor({ index: idx, el: e.currentTarget })}
                            sx={{
                              textTransform: "none",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              py: 0.25,
                              px: 1,
                              color: "primary.main",
                              bgcolor: "#ECF2FF",
                              borderRadius: 1.5,
                              "&:hover": { bgcolor: "#DFE5EF" },
                            }}
                          >
                            Hubs SV
                          </Button>
                          <Menu
                            anchorEl={stopMenuAnchor?.index === idx ? stopMenuAnchor.el : null}
                            open={stopMenuAnchor?.index === idx}
                            onClose={() => setStopMenuAnchor(null)}
                            PaperProps={{ sx: { maxHeight: 340, width: 360, borderRadius: 2 } }}
                          >
                            <MenuItem disabled sx={{ opacity: 1, fontWeight: 700, fontSize: "0.75rem", color: "text.secondary" }}>
                              SELECCIONAR PARADA CORPORATIVA
                            </MenuItem>
                            <Divider />
                            {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                              <MenuItem
                                key={i}
                                dense
                                selected={stop.address === loc.address}
                                onClick={() => {
                                  setStops((prev) =>
                                    prev.map((item, itIdx) =>
                                      itIdx === idx
                                        ? {
                                            ...item,
                                            address: loc.address,
                                            lat: loc.lat,
                                            lng: loc.lng,
                                          }
                                        : item
                                    )
                                  );
                                  setStopMenuAnchor(null);
                                }}
                              >
                                <ListItemIcon sx={{ minWidth: 26 }}>
                                  <IconMapPin size={16} color="#5D87FF" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={loc.label}
                                  secondary={loc.address}
                                  primaryTypographyProps={{ fontSize: "0.8rem", fontWeight: 600 }}
                                  secondaryTypographyProps={{ fontSize: "0.7rem", noWrap: true }}
                                />
                              </MenuItem>
                            ))}
                          </Menu>
                          <IconButton
                            color="error"
                            size="small"
                            onClick={() => handleRemoveStop(idx)}
                            title="Eliminar parada"
                          >
                            <IconTrash size={16} />
                          </IconButton>
                        </Stack>
                      </Stack>
                      <GoogleAddressAutocomplete
                        placeholder="Buscar punto intermedio en El Salvador..."
                        value={stop.address}
                        onChange={(sel) => {
                          setStops((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    address: sel.address,
                                    lat: sel.lat,
                                    lng: sel.lng,
                                  }
                                : item
                            )
                          );
                        }}
                      />
                    </Card>
                  ))}

                  {/* Destino con Google Places API y menú de Hubs frecuentes */}
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        Punto de Destino *
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<IconBuildingSkyscraper size={15} color="#5D87FF" />}
                        endIcon={<IconChevronDown size={14} />}
                        onClick={(e) => setDestMenuAnchor(e.currentTarget)}
                        sx={{
                          textTransform: "none",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          py: 0.25,
                          px: 1,
                          color: "primary.main",
                          bgcolor: "#ECF2FF",
                          borderRadius: 1.5,
                          "&:hover": { bgcolor: "#DFE5EF" },
                        }}
                      >
                        Hubs frecuentes SV
                      </Button>
                      <Menu
                        anchorEl={destMenuAnchor}
                        open={Boolean(destMenuAnchor)}
                        onClose={() => setDestMenuAnchor(null)}
                        PaperProps={{ sx: { maxHeight: 340, width: 360, borderRadius: 2 } }}
                      >
                        <MenuItem disabled sx={{ opacity: 1, fontWeight: 700, fontSize: "0.75rem", color: "text.secondary" }}>
                          PUNTOS CORPORATIVOS FRECUENTES (EL SALVADOR)
                        </MenuItem>
                        <Divider />
                        {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                          <MenuItem
                            key={i}
                            dense
                            selected={destinationCoord.address === loc.address}
                            onClick={() => {
                              setDestinationCoord({
                                address: loc.address,
                                lat: loc.lat,
                                lng: loc.lng,
                              });
                              setDestMenuAnchor(null);
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 26 }}>
                              <IconMapPin size={16} color="#5D87FF" />
                            </ListItemIcon>
                            <ListItemText
                              primary={loc.label}
                              secondary={loc.address}
                              primaryTypographyProps={{ fontSize: "0.8rem", fontWeight: 600 }}
                              secondaryTypographyProps={{ fontSize: "0.7rem", noWrap: true }}
                            />
                          </MenuItem>
                        ))}
                      </Menu>
                    </Stack>
                    <GoogleAddressAutocomplete
                      placeholder="Buscar destino en El Salvador (ej. Aeropuerto Comalapa, Zona Franca, Hotel...)"
                      value={destinationCoord.address}
                      required
                      onChange={(sel) => {
                        setDestinationCoord({
                          address: sel.address,
                          lat: sel.lat,
                          lng: sel.lng,
                        });
                      }}
                    />
                  </Box>

                  {/* Previsualización en Vivo con Google Route Map */}
                  <Box sx={{ mt: 1 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="textSecondary"
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        <IconMapPin size={15} color="#5D87FF" />
                        Ruta Vial en Tiempo Real (Google Maps Directions API)
                      </Typography>
                      {googleDistanceKm !== null && (
                        <Typography variant="caption" fontWeight={700} color="success.main">
                          Calculado por Google Maps
                        </Typography>
                      )}
                    </Stack>
                    <GoogleRouteMap
                      origin={originCoord}
                      destination={destinationCoord}
                      stops={stops}
                      roundTrip={roundTrip}
                      height={260}
                      onRouteCalculated={({ distanceKm, durationMinutes }) => {
                        setGoogleDistanceKm(distanceKm);
                        setGoogleDurationMinutes(durationMinutes);
                      }}
                    />
                  </Box>

                  <Divider />

                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={roundTrip}
                            onChange={(e) => setRoundTrip(e.target.checked)}
                            color="primary"
                          />
                        }
                        label="Viaje Ida y Vuelta (2x km)"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label="Viajes Inmediatos Inhabilitados"
                          sx={{ fontWeight: 600 }}
                        />
                        <Typography variant="caption" color="textSecondary">
                          (Hasta habilitación de flota cercana en SV)
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        fullWidth
                        size="small"
                        label="Tiempo Mínimo de Anticipación (Configurable Hito 2)"
                        value={minAdvanceHours}
                        onChange={(e) => {
                          const hrs = Number(e.target.value);
                          setMinAdvanceHours(hrs);
                          const d = new Date(Date.now() + hrs * 60 * 60 * 1000);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          setScheduledDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                        }}
                      >
                        <MenuItem value={3}>3 horas (Requisito mínimo general SV)</MenuItem>
                        <MenuItem value={6}>6 horas (Recomendado clientes corporativos)</MenuItem>
                        <MenuItem value={12}>12 horas (Planificación logística)</MenuItem>
                        <MenuItem value={24}>24 horas (Planificación interdepartamental)</MenuItem>
                      </TextField>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label="Fecha y Hora Programada *"
                        InputLabelProps={{ shrink: true }}
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                        helperText={`Requiere mínimo ${minAdvanceHours} horas de anticipación`}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </DashboardCard>

              {/* 3. Pasajeros, Categoría Vehicular y Carga */}
              <DashboardCard
                title={
                  isEn
                    ? "3. Passengers, Vehicle Category & Cargo"
                    : "3. Pasajeros, Categoría de Vehículo y Carga"
                }
                subtitle={
                  isEn
                    ? "More than 4 passengers automatically assigns Corporate Minibus (up to 12 passengers). Requests exceeding 12 passengers require contacting Lilo."
                    : "Más de 4 pasajeros asigna automáticamente Microbús Corporativo (hasta 12 pasajeros). Para más de 12 pasajeros contáctenos directamente por WhatsApp o llamada."
                }
              >
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label={
                        isEn
                          ? "Passenger Count *"
                          : "Cantidad de Pasajeros *"
                      }
                      inputProps={{ min: 1 }}
                      error={passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY}
                      value={passengersCount}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setPassengersCount(val);
                      }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      select
                      fullWidth
                      disabled={passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY}
                      label={
                        isEn
                          ? "Required Vehicle Category *"
                          : "Categoría de Vehículo Requerida *"
                      }
                      value={vehicleCategory}
                      onChange={(e) =>
                        setVehicleCategory(e.target.value as VehicleCategory)
                      }
                    >
                      <MenuItem
                        value="suv"
                        disabled={!allowedCategories.includes("suv")}
                      >
                        SUV Corporativa (Máx. 4 pasajeros) — $0.67/km · Mín. $13.56
                      </MenuItem>
                      <MenuItem
                        value="pickup"
                        disabled={!allowedCategories.includes("pickup")}
                      >
                        Pick-up Doble Cabina (Máx. 4 pasajeros) — $0.67/km · Mín. $13.56
                      </MenuItem>
                      <MenuItem value="microbus">
                        Microbús Corporativo (Máx. 12 pasajeros) — $0.90/km · Mín. $45.00
                      </MenuItem>
                    </TextField>
                  </Grid>

                  {passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY && (
                    <Grid size={{ xs: 12 }}>
                      <Alert severity="error" sx={{ py: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                          {isEn
                            ? `Capacity Exceeded (${passengersCount} passengers > max ${MAX_VEHICLE_PASSENGER_CAPACITY})`
                            : `Capacidad Máxima Excedida (${passengersCount} pasajeros > límite de ${MAX_VEHICLE_PASSENGER_CAPACITY})`}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-line", fontWeight: 600, mb: 1.5 }}>
                          {isEn
                            ? "For trips with more than 12 passengers, please contact us by WhatsApp or phone and we will gladly assist you immediately.\nWe are at your service."
                            : "Para viajes de más de 12 pasajeros, contáctenos por WhatsApp o llamada y con gusto le ayudaremos de inmediato.\nEstamos para servirle."}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                          <Button
                            variant="contained"
                            size="small"
                            color="success"
                            href={`https://wa.me/${LILO_DIRECT_CONTACT.whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                              `Hola Lilo, requiero cotizar un viaje corporativo para ${passengersCount} pasajeros en El Salvador.`
                            )}`}
                            target="_blank"
                          >
                            WhatsApp {LILO_DIRECT_CONTACT.whatsapp}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            href={`tel:${LILO_DIRECT_CONTACT.phone}`}
                          >
                            Llamar: {LILO_DIRECT_CONTACT.phone}
                          </Button>
                          <Typography variant="caption" color="text.secondary">
                            {LILO_DIRECT_CONTACT.email}
                          </Typography>
                        </Box>
                      </Alert>
                    </Grid>
                  )}

                  {passengersCount > 4 &&
                    passengersCount <= MAX_VEHICLE_PASSENGER_CAPACITY && (
                      <Grid size={{ xs: 12 }}>
                        <Alert severity="warning" sx={{ py: 0.5 }}>
                          {isEn ? (
                            <>
                              For <strong>{passengersCount} passengers</strong>{" "}
                              (more than 4), B2B policy automatically assigns{" "}
                              <strong>Corporate Minibus (up to 12 passengers)</strong>.
                            </>
                          ) : (
                            <>
                              Para <strong>{passengersCount} pasajeros</strong>{" "}
                              (más de 4), la normativa B2B El Salvador asigna automáticamente categoría{" "}
                              <strong>Microbús Corporativo (hasta 12 pasajeros)</strong>.
                            </>
                          )}
                        </Alert>
                      </Grid>
                    )}

                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Nombres de los Pasajeros (separados por coma)"
                      value={passengerNamesInput}
                      onChange={(e) => setPassengerNamesInput(e.target.value)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={hasCargo}
                          onChange={(e) => setHasCargo(e.target.checked)}
                          color="warning"
                        />
                      }
                      label="Incluye Carga / Herramientas"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 8 }}>
                    {hasCargo && (
                      <TextField
                        fullWidth
                        size="small"
                        label="Descripción de Carga / Equipaje *"
                        placeholder="Ej. 3 cajas de muestras industriales y equipo de medición"
                        value={cargoDescription}
                        onChange={(e) => setCargoDescription(e.target.value)}
                      />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Observaciones o instrucciones de acceso (Opcional)"
                      placeholder="Ej. Anunciarse en caseta de vigilancia #2 de planta industrial."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </DashboardCard>
            </Stack>
          </Grid>

          {/* Columna Derecha: Resumen Tarifario Oficial El Salvador en Vivo */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <Card
              elevation={0}
              sx={{
                border: "2px solid",
                borderColor: "primary.main",
                position: "sticky",
                top: 24,
              }}
            >
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                  <IconCalculator size={24} color="#1976d2" />
                  <Typography variant="h6" fontWeight={700}>
                    Cotización Oficial B2B (SV)
                  </Typography>
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Categoría Vehicular:
                    </Typography>
                    <Chip
                      size="small"
                      color="primary"
                      label={tariffBreakdown.rule.shortLabel}
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Modalidad de Ruta:
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {roundTrip ? "Ida y Vuelta (2x)" : "Solo Ida (1x)"}
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Paradas Intermedias:
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {stops.length} parada(s)
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Distancia Total Facturable:
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {backendQuote ? backendQuote.chargedDistance.toFixed(1) : tariffBreakdown.billableDistanceKm} km
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Duración Estimada:
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ~{tariffBreakdown.estimatedDurationMinutes} min
                    </Typography>
                  </Stack>

                  <Divider />

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Tarifa por Kilómetro:
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ${backendQuote ? backendQuote.appliedFareRate.toFixed(2) : tariffBreakdown.ratePerKm.toFixed(2)} USD / km
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">
                      Tarifa Mínima ({backendQuote?.minimumDistance ?? tariffBreakdown.baseDistanceKm} km):
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ${tariffBreakdown.minFare.toFixed(2)} USD
                    </Typography>
                  </Stack>

                  {backendQuote?.farePrice != null && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="textSecondary">
                        Subtotal Base ({backendQuote.chargedDistance.toFixed(1)} km):
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        ${backendQuote.farePrice.toFixed(2)} USD
                      </Typography>
                    </Stack>
                  )}

                  {backendQuote?.taxAmount != null && backendQuote.taxAmount > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="textSecondary">
                        IVA ({((backendQuote.taxRate ?? 0.13) * 100).toFixed(0)}%):
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        +${backendQuote.taxAmount.toFixed(2)} USD
                      </Typography>
                    </Stack>
                  )}

                  <Box
                    sx={{
                      bgcolor: backendQuote ? "#f0f7ff" : "#f5f5f5",
                      p: 2,
                      borderRadius: 2,
                      mt: 1,
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      fontWeight={700}
                    >
                      {quoteLoading
                        ? "CALCULANDO COTIZACIÓN OFICIAL..."
                        : backendQuote?.taxAmount
                        ? isEn
                          ? "TOTAL ESTIMATED SERVICE (BASE + 13% VAT)"
                          : "TOTAL ESTIMADO DEL SERVICIO (BASE + IVA 13%)"
                        : isEn
                        ? "TOTAL ESTIMATED SERVICE (BASE TARIFF)"
                        : "TOTAL ESTIMADO DEL SERVICIO"}
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={800}
                      color="primary.main"
                    >
                      ${(backendQuote ? backendQuote.totalAmount : tariffBreakdown.finalFare).toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      {backendQuote
                        ? backendQuote.minimumApplied
                          ? `Tarifa mínima aplicada ($${backendQuote.farePrice.toFixed(2)} USD cubre hasta ${backendQuote.minimumDistance ?? 20} km · Ruta: ${backendQuote.chargedDistance.toFixed(1)} km)`
                          : `Tarifa real aplicada (${backendQuote.chargedDistance.toFixed(1)} km × $${backendQuote.appliedFareRate.toFixed(2)}/km + IVA)`
                        : tariffBreakdown.breakdownSummary}
                    </Typography>
                  </Box>

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={submitting || passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY}
                    startIcon={<IconCheck size={20} />}
                    sx={{ mt: 2, py: 1.5, fontWeight: 700 }}
                  >
                    {passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY
                      ? isEn
                        ? "Capacity Exceeded — Contact Lilo"
                        : "Capacidad Excedida — Comunícate con Lilo"
                      : submitting
                      ? isEn
                        ? "Submitting Request..."
                        : "Generando Solicitud..."
                      : isEn
                      ? "Confirm & Issue B2B Request"
                      : "Confirmar y Emitir Solicitud B2B"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
};

export default NuevaSolicitudB2BPage;
