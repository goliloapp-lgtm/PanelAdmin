"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Card, Typography, Stack, Chip, CircularProgress } from "@mui/material";
import { IconMapPin, IconRoute, IconClock, IconShieldCheck } from "@tabler/icons-react";
import {
  DEFAULT_SV_CENTER,
  loadGoogleMapsScript,
  RoutePointCoord,
} from "@/utils/googleMaps";

interface Props {
  origin: RoutePointCoord;
  destination: RoutePointCoord;
  stops?: RoutePointCoord[];
  roundTrip?: boolean;
  distanceKm?: number;
  durationMinutes?: number;
  onRouteCalculated?: (result: {
    distanceKm: number;
    durationMinutes: number;
    directionsResult: google.maps.DirectionsResult;
  }) => void;
  height?: string | number;
}

export default function GoogleRouteMap({
  origin,
  destination,
  stops = [],
  roundTrip = false,
  distanceKm,
  durationMinutes,
  onRouteCalculated,
  height = 320,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const onRouteCalculatedRef = useRef(onRouteCalculated);
  onRouteCalculatedRef.current = onRouteCalculated;

  const [loadingMap, setLoadingMap] = useState(true);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [liveDistanceKm, setLiveDistanceKm] = useState<number | null>(
    distanceKm ?? null
  );
  const [liveDurationMin, setLiveDurationMin] = useState<number | null>(
    durationMinutes ?? null
  );

  useEffect(() => {
    let active = true;

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !mapContainerRef.current) return;

        if (!mapRef.current) {
          const mapInstance = new g.maps.Map(mapContainerRef.current, {
            center: DEFAULT_SV_CENTER,
            zoom: 12,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
          });

          const directionsRenderer = new g.maps.DirectionsRenderer({
            map: mapInstance,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#5D87FF",
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });

          mapRef.current = mapInstance;
          directionsRendererRef.current = directionsRenderer;
        }

        setLoadingMap(false);
      })
      .catch((err) => {
        console.warn("[GoogleRouteMap] Error al inicializar mapa:", err);
        if (active) setLoadingMap(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!window.google?.maps || !directionsRendererRef.current || !mapRef.current) {
      return;
    }

    if (!origin?.lat || !destination?.lat) {
      directionsRendererRef.current?.set("directions", null);
      setLiveDistanceKm(null);
      setLiveDurationMin(null);
      onRouteCalculatedRef.current?.({
        distanceKm: 0,
        durationMinutes: 0,
        directionsResult: null as any,
      });
      return;
    }

    let active = true;
    setCalculatingRoute(true);

    const g = window.google;
    const directionsService = new g.maps.DirectionsService();

    const waypoints: google.maps.DirectionsWaypoint[] = stops
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        location: { lat: s.lat, lng: s.lng },
        stopover: true,
      }));

    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: g.maps.TravelMode.DRIVING,
        unitSystem: g.maps.UnitSystem.METRIC,
      },
      (result, status) => {
        if (!active) return;
        setCalculatingRoute(false);

        if (status === g.maps.DirectionsStatus.OK && result && result.routes[0]) {
          directionsRendererRef.current?.setDirections(result);

          let totalMeters = 0;
          let totalSecs = 0;
          for (const leg of result.routes[0].legs) {
            totalMeters += leg.distance?.value || 0;
            totalSecs += leg.duration?.value || 0;
          }

          let km = Number((totalMeters / 1000).toFixed(1));
          let min = Math.max(5, Math.round(totalSecs / 60));

          if (roundTrip) {
            km = Number((km * 2).toFixed(1));
            min = Math.round(min * 2);
          }

          setLiveDistanceKm(km);
          setLiveDurationMin(min);

          if (onRouteCalculatedRef.current) {
            onRouteCalculatedRef.current({
              distanceKm: km,
              durationMinutes: min,
              directionsResult: result,
            });
          }
        }
      }
    );

    return () => {
      active = false;
    };
  }, [
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    stops,
    roundTrip,
  ]);

  return (
    <Card
      variant="outlined"
      sx={{
        position: "relative",
        height,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "#f8fafc",
      }}
    >
      <Box ref={mapContainerRef} sx={{ width: "100%", height: "100%" }} />

      {/* Loading state indicator */}
      {(loadingMap || calculatingRoute) && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 10,
            bgcolor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            border: "1px solid #DFE5EF",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={14} />
          <Typography variant="caption" fontWeight={600} color="textSecondary">
            {loadingMap ? "Cargando Google Maps..." : "Calculando ruta vial en SV..."}
          </Typography>
        </Box>
      )}

      {/* Floating Route Info Badge */}
      {!loadingMap && liveDistanceKm !== null && liveDistanceKm > 0 && (
        <Box
          sx={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: { xs: 12, sm: "auto" },
            zIndex: 10,
            bgcolor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            px: 2,
            py: 1.25,
            borderRadius: 2,
            border: "1px solid #DFE5EF",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: "#ECF2FF",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconRoute size={16} />
            </Box>
            <Box>
              <Typography variant="caption" color="textSecondary" display="block">
                Distancia Vial SV
              </Typography>
              <Typography variant="subtitle2" fontWeight={800}>
                {liveDistanceKm} km {roundTrip && "(Ida y Vuelta)"}
              </Typography>
            </Box>
          </Stack>

          <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" } }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: "#E6FFFA",
                color: "success.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconClock size={16} />
            </Box>
            <Box>
              <Typography variant="caption" color="textSecondary" display="block">
                Tiempo Estimado
              </Typography>
              <Typography variant="subtitle2" fontWeight={800}>
                ~{liveDurationMin} min
              </Typography>
            </Box>
          </Stack>

          <Chip
            size="small"
            color="success"
            variant="outlined"
            icon={<IconShieldCheck size={14} />}
            label="Google Maps Conectado"
            sx={{ display: { xs: "none", md: "inline-flex" }, fontWeight: 600 }}
          />
        </Box>
      )}
    </Card>
  );
}

import { Divider } from "@mui/material";
