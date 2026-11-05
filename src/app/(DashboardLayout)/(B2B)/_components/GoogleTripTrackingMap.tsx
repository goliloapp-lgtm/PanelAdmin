"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Card, Typography, Stack, Chip } from "@mui/material";
import { IconMapPin, IconCar, IconRoute } from "@tabler/icons-react";
import {
  DEFAULT_SV_CENTER,
  loadGoogleMapsScript,
  RoutePointCoord,
} from "@/utils/googleMaps";

interface Props {
  origin?: RoutePointCoord | null;
  destination?: RoutePointCoord | null;
  stops?: RoutePointCoord[];
  driverLocation?: {
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    status?: string;
  } | null;
  driverName?: string;
  vehiclePlate?: string;
  height?: string | number;
}

export default function GoogleTripTrackingMap({
  origin,
  destination,
  stops = [],
  driverLocation,
  driverName,
  vehiclePlate,
  height = 280,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !mapContainerRef.current) return;

        if (!mapRef.current) {
          const center =
            origin?.lat && origin?.lng
              ? { lat: origin.lat, lng: origin.lng }
              : DEFAULT_SV_CENTER;

          const mapInstance = new g.maps.Map(mapContainerRef.current, {
            center,
            zoom: 13,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });

          const renderer = new g.maps.DirectionsRenderer({
            map: mapInstance,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#5D87FF",
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });

          mapRef.current = mapInstance;
          directionsRendererRef.current = renderer;
          setMapLoaded(true);
        }
      })
      .catch((err) => console.warn("[GoogleTripTrackingMap] Error loading map:", err));

    return () => {
      active = false;
    };
  }, []);

  // Trazar ruta planificada
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !directionsRendererRef.current) return;
    if (!origin?.lat || !destination?.lat) return;

    const g = window.google;
    if (!g) return;

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
      (res, status) => {
        if (status === g.maps.DirectionsStatus.OK && res) {
          directionsRendererRef.current?.setDirections(res);
        }
      }
    );
  }, [mapLoaded, origin?.lat, origin?.lng, destination?.lat, destination?.lng, stops]);

  // Actualizar marcador de conductor en tiempo real (RTDB)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const g = window.google;
    if (!g) return;

    if (driverLocation?.lat && driverLocation?.lng) {
      const pos = { lat: driverLocation.lat, lng: driverLocation.lng };

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new g.maps.Marker({
          position: pos,
          map: mapRef.current,
          title: driverName ? `Conductor: ${driverName}` : "Conductor Lilo",
          icon: {
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#0D9488",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            rotation: driverLocation.heading || 0,
          },
        });
      } else {
        driverMarkerRef.current.setPosition(pos);
        if (driverLocation.heading !== undefined) {
          const icon = driverMarkerRef.current.getIcon() as google.maps.Symbol;
          if (icon && typeof icon === "object") {
            icon.rotation = driverLocation.heading;
            driverMarkerRef.current.setIcon(icon);
          }
        }
      }

      if (!origin?.lat && !destination?.lat) {
        mapRef.current.panTo(pos);
      }
    } else {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setMap(null);
        driverMarkerRef.current = null;
      }
    }
  }, [mapLoaded, driverLocation?.lat, driverLocation?.lng, driverLocation?.heading, driverName]);

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

      {/* Driver telemetry live badge */}
      {driverLocation?.lat && driverLocation?.lng && (
        <Box
          sx={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 10,
            bgcolor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            border: "1px solid #13DEB9",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "success.main",
            }}
          />
          <Typography variant="caption" fontWeight={700} color="success.dark">
            {driverName || "Conductor"} · {vehiclePlate || "En ruta"}
            {driverLocation.speed !== undefined && ` (${driverLocation.speed} km/h)`}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
