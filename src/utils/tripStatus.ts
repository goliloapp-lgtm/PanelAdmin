/**
 * Shared Trip Status Contract - Frontend Dashboard
 * Identical replicate of backend canonical trip status contract.
 */

export type B2BRequestStatus =
  | "requested"
  | "seeking_driver"
  | "confirmed"
  | "assigned"
  | "enRoute"
  | "driverArrived"
  | "inService"
  | "arrived"
  | "completed"
  | "invoiced"
  | "cancelled"
  | "rejected";

export const TERMINAL_STATUSES: readonly B2BRequestStatus[] = [
  "completed",
  "invoiced",
  "cancelled",
  "rejected",
];

export interface LifecycleStep {
  status: B2BRequestStatus;
  label: string;
}

export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  { status: "requested", label: "Solicitada" },
  { status: "seeking_driver", label: "Buscando Conductor" },
  { status: "confirmed", label: "Confirmada" },
  { status: "assigned", label: "Conductor Asignado" },
  { status: "enRoute", label: "En Camino al Origen" },
  { status: "driverArrived", label: "Conductor en Punto" },
  { status: "inService", label: "En Curso (Viajando)" },
  { status: "arrived", label: "Llegada a Destino" },
  { status: "completed", label: "Completado" },
];

export function mapRawTripStatus(rawStatus: string | null | undefined): B2BRequestStatus {
  if (!rawStatus) return "requested";

  const s = rawStatus.trim();
  switch (s) {
    case "requested":
      return "requested";

    case "available":
    case "offered":
    case "seeking_driver":
    case "driver_rejected":
    case "pending_driver":
      return "seeking_driver";

    case "confirmed":
      return "confirmed";

    case "assigned":
    case "driver_assigned":
      return "assigned";

    case "accepted":
    case "dispatched":
    case "enRoute":
      return "enRoute";

    case "driver_arrived":
    case "driverArrived":
      return "driverArrived";

    case "in_progress":
    case "inService":
      return "inService";

    case "arrived":
      return "arrived";

    case "completed":
      return "completed";

    case "invoiced":
      return "invoiced";

    case "cancelled":
    case "cancelled_by_company":
    case "expired":
      return "cancelled";

    case "rejected":
      return "rejected";

    default:
      return "requested";
  }
}

export function getLifecycleStepIndex(status: string): number {
  const norm = mapRawTripStatus(status);
  if (norm === "invoiced") return LIFECYCLE_STEPS.length;
  const idx = LIFECYCLE_STEPS.findIndex((step) => step.status === norm);
  return idx >= 0 ? idx : 0;
}

export function isTerminalStatus(status: string): boolean {
  const norm = mapRawTripStatus(status);
  return TERMINAL_STATUSES.includes(norm);
}

export interface TripStatusFeedEntry {
  tripId: string;
  status: B2BRequestStatus;
  rawStatus: string;
  source: "rideRequests" | "trips" | "scheduledTrips";
  companyId: string;
  driverId: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleId: string | null;
  vehiclePlate?: string | null;
  passengerName?: string | null;
  passengerPhone?: string | null;
  countryId: string;
  isTerminal: boolean;
  updatedAt: number;
}
