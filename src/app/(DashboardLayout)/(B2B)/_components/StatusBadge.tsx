"use client";

import React from "react";
import { Chip, ChipProps } from "@mui/material";
import {
  B2BRequestStatus,
  CompanyStatus,
  DriverDocumentStatus,
} from "@/types/b2b";

interface StatusBadgeProps {
  status:
    | B2BRequestStatus
    | CompanyStatus
    | DriverDocumentStatus
    | string;
  type?: "request" | "company" | "vehicle" | "document";
}

const companyStatusMap: Record<
  CompanyStatus,
  { label: string; color: ChipProps["color"] }
> = {
  active: { label: "Activa", color: "success" },
  suspended: { label: "Suspendida", color: "warning" },
  inactive: { label: "Inactiva", color: "error" },
};

const requestStatusMap: Record<
  string,
  { label: string; color: ChipProps["color"] }
> = {
  pending_approval: { label: "Pendiente Aprobación (S6)", color: "warning" },
  requested: { label: "Solicitada", color: "warning" },
  seeking_driver: { label: "Buscando Conductor", color: "warning" },
  confirmed: { label: "Confirmada", color: "info" },
  assigned: { label: "Conductor Asignado", color: "primary" },
  enRoute: { label: "En Camino al Origen", color: "secondary" },
  driverArrived: { label: "Conductor en Punto", color: "secondary" },
  inService: { label: "En Curso (Viajando)", color: "info" },
  arrived: { label: "Llegada a Destino", color: "info" },
  completed: { label: "Completado", color: "success" },
  invoiced: { label: "Facturado", color: "success" },
  cancelled: { label: "Cancelado", color: "error" },
  rejected: { label: "Rechazado", color: "error" },
};

const vehicleStatusMap: Record<
  string,
  { label: string; color: ChipProps["color"] }
> = {
  active: { label: "Operativo", color: "success" },
  maintenance: { label: "En Taller", color: "warning" },
  pendingDocs: { label: "Docs Pendientes", color: "warning" },
  inactive: { label: "Fuera de Servicio", color: "error" },
};

const documentStatusMap: Record<
  string,
  { label: string; color: ChipProps["color"] }
> = {
  inReview: { label: "En Revisión", color: "warning" },
  pendingReview: { label: "En Revisión", color: "warning" },
  approved: { label: "Aprobado", color: "success" },
  rejected: { label: "Rechazado", color: "error" },
  partiallyRejected: { label: "Con Observaciones", color: "error" },
  expired: { label: "Vencido", color: "error" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = "company",
}) => {
  if (type === "company" && status in companyStatusMap) {
    const config = companyStatusMap[status as CompanyStatus];
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (type === "request" && status in requestStatusMap) {
    const config = requestStatusMap[status as B2BRequestStatus];
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (type === "vehicle" && status in vehicleStatusMap) {
    const config = vehicleStatusMap[status];
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (type === "document" && status in documentStatusMap) {
    const config = documentStatusMap[status];
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  return (
    <Chip
      label={status}
      size="small"
      variant="outlined"
      sx={{ textTransform: "capitalize" }}
    />
  );
};

export default StatusBadge;
