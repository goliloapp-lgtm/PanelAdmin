import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { ref as rtdbRef, update as rtdbUpdate } from "firebase/database";
import { signInWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { db, rtdb, functions, auth } from "@/utils/firebase";
import {
  createTripCallable,
  createScheduledTripCallable,
  createScheduledTripForCompanyCallable,
  assignScheduledTripDriverCallable,
  releaseScheduledTripByPlatformCallable,
  cancelScheduledTripCallable,
  cancelTripCallable,
  markDriverUnavailableCallable,
  assignDriverCallable,
  offerScheduledTripCallable,
  reassignDriverCallable,
  reportTripProblemCallable,
  reassignTripDriverCallable,
} from "@/utils/functions";
import {
  B2BRequestStatus,
  B2BServiceRequest,
  VehicleCategory,
} from "@/types/b2b";

const REQUESTS_COLLECTION = "b2bRequests";

const getTimestampMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const parsed = Date.parse(String(ts));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sanitizeFirestorePayload = (data: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if ((value as any).toMillis || (value as any)._methodName || value instanceof Date) {
        result[key] = value;
      } else {
        result[key] = sanitizeFirestorePayload(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
};

const sortRequestsDesc = (
  requests: B2BServiceRequest[]
): B2BServiceRequest[] => {
  return [...requests].sort((a, b) => {
    const timeA =
      getTimestampMillis(a.createdAt) || getTimestampMillis(a.scheduledAt);
    const timeB =
      getTimestampMillis(b.createdAt) || getTimestampMillis(b.scheduledAt);
    return timeB - timeA;
  });
};

let currentFirestoreDocs: B2BServiceRequest[] = [];
const requestListeners = new Set<() => void>();

export const notifyRequestSubscribers = () => {
  requestListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
};

export const subscribeToB2BRequests = (
  callback: (requests: B2BServiceRequest[]) => void,
  options?: {
    companyId?: string;
    status?: B2BRequestStatus | "all";
    vehicleCategory?: VehicleCategory | "all";
  },
  onError?: (error: any) => void
) => {
  let unsubscribeFirestore: (() => void) | null = null;
  let cancelled = false;

  const applyFilters = (source: B2BServiceRequest[]) => {
    let list = [...source];
    if (options?.companyId) {
      list = list.filter((r) => r.companyId === options.companyId);
    }
    if (options?.status && options.status !== "all") {
      list = list.filter((r) => r.status === options.status);
    }
    if (options?.vehicleCategory && options.vehicleCategory !== "all") {
      list = list.filter((r) => r.vehicleCategory === options.vehicleCategory);
    }
    return sortRequestsDesc(list);
  };

  const emitDocs = () => {
    callback(applyFilters(currentFirestoreDocs));
  };

  requestListeners.add(emitDocs);

  auth.authStateReady().then(() => {
    if (cancelled) return;
    const q = query(
      collection(db, REQUESTS_COLLECTION),
      where("countryId", "==", "sv")
    );

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        currentFirestoreDocs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as B2BServiceRequest[];

        emitDocs();
      },
      (error) => {
        if (onError) onError(error);
        currentFirestoreDocs = [];
        emitDocs();
      }
    );
  });

  return () => {
    cancelled = true;
    requestListeners.delete(emitDocs);
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
};

export const getB2BRequestById = async (
  id: string
): Promise<B2BServiceRequest | null> => {
  try {
    await auth.authStateReady();
    const docRef = doc(db, REQUESTS_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    return {
      id: snap.id,
      ...snap.data(),
    } as B2BServiceRequest;
  } catch {
    return null;
  }
};

export const createB2BServiceRequest = async (
  data: Omit<
    B2BServiceRequest,
    "id" | "folio" | "countryId" | "createdAt" | "updatedAt"
  > & { reason?: string }
): Promise<{ id: string; folio: string; tripId?: string }> => {
  if (!data.travellerId?.trim()) {
    throw new Error("Debes seleccionar un viajero corporativo registrado para la empresa.");
  }

  // Build legs array per CF-14 (multi-tramo or single leg)
  const estDuration = Number(data.estimatedDurationMinutes ?? 20) || 20;
  const legs =
    Array.isArray(data.legs) && data.legs.length > 0
      ? data.legs
      : data.roundTrip
        ? [
            {
              distance: Number((data.estimatedDistanceKm / 2).toFixed(2)),
              durationMinutes: Math.max(1, Math.round(estDuration / 2)),
            },
            {
              distance: Number((data.estimatedDistanceKm / 2).toFixed(2)),
              durationMinutes: Math.max(1, Math.round(estDuration / 2)),
            },
          ]
        : [
            {
              distance: data.estimatedDistanceKm,
              durationMinutes: estDuration,
            },
          ];

  let tripId = data.tripId;
  let folio = (data as any).folio || "";

  if (!data.isImmediate) {
    const scheduledPickupAtIso =
      data.scheduledAt ||
      ((data as any).scheduledPickupAt?.toDate?.()
        ? (data as any).scheduledPickupAt.toDate().toISOString()
        : typeof (data as any).scheduledPickupAt === "string"
          ? (data as any).scheduledPickupAt
          : new Date(Date.now() + 3 * 3600 * 1000).toISOString());

    const reason = (data.reason || (data as any).notes || "").trim();
    if (!reason) {
      throw new Error(
        "El motivo de la operación en plataforma (reason) es obligatorio para auditoría B2B."
      );
    }

    const cleanCostCentreId =
      data.costCenterId && data.costCenterId !== "general"
        ? String(data.costCenterId).trim()
        : undefined;

    const sanitizedLegs = legs.map((leg) => ({
      distance: Math.max(0.1, Number(Number(leg.distance).toFixed(2))),
      durationMinutes: Math.max(1, Math.round(Number(leg.durationMinutes) || 10)),
    }));
    const sanitizedDuration = Math.max(1, Math.round(Number(estDuration) || 15));
    const passengerCount = Math.max(1, Math.round(Number(data.passengersCount) || 1));

    // CF-86: Invocar el callable oficial de plataforma para reservas en nombre de la empresa
    try {
      const schedRes = await createScheduledTripForCompanyCallable({
        countryId: "sv",
        companyId: data.companyId,
        costCentreId: cleanCostCentreId,
        scheduledPickupAt: scheduledPickupAtIso,
        passengerCount,
        originAddress: data.origin.address,
        originLatitude: data.origin.lat,
        originLongitude: data.origin.lng,
        destinationAddress: data.destination.address,
        destinationLatitude: data.destination.lat,
        destinationLongitude: data.destination.lng,
        legs: sanitizedLegs,
        rideTimeMinutes: sanitizedDuration,
        etaMinutes: sanitizedDuration,
        paymentMethod: "company_account",
        travellerId: data.travellerId,
        reason,
      });

      tripId = schedRes.data.scheduledTripId;
      folio = schedRes.data.folio;
    } catch (schedErr: any) {
      console.error(
        "[requestService] createScheduledTripForCompany error:",
        schedErr,
        schedErr?.message,
        schedErr?.details
      );
      throw schedErr;
    }
  } else {
    // Invoke backend callable `createTrip` for immediate requests
    const categoryId =
      data.vehicleCategory === "pickup"
        ? "pickup-doble-cabina"
        : data.vehicleCategory || "suv";

    const callableRes = await createTripCallable({
      countryId: "sv",
      categoryId,
      legs,
      travellerId: data.travellerId,
      costCentreId: data.costCenterId || undefined,
      originAddress: data.origin.address,
      originLatitude: data.origin.lat,
      originLongitude: data.origin.lng,
      destinationAddress: data.destination.address,
      destinationLatitude: data.destination.lat,
      destinationLongitude: data.destination.lng,
      rideTimeMinutes: estDuration,
      paymentMethod: "company_account",
    });
    if (callableRes?.data?.tripId) {
      tripId = callableRes.data.tripId;
      folio = `B2B-SV-${new Date().getFullYear()}-${tripId.slice(0, 6).toUpperCase()}`;
    }
  }

  notifyRequestSubscribers();
  return { id: tripId || "", folio, tripId };
};

export const releaseB2BRequestToPool = async (
  requestId: string,
  scheduledTripId: string,
  reason: string
): Promise<void> => {
  if (!reason?.trim()) {
    throw new Error("El motivo de devolución al pool es obligatorio (CF-86).");
  }
  await releaseScheduledTripByPlatformCallable({
    scheduledTripId,
    reason: reason.trim(),
  });
  notifyRequestSubscribers();
};

export const assignB2BRequestVehicleAndDriver = async (
  requestId: string,
  assignment: {
    driverId: string;
    driverName: string;
    driverPhone: string;
    vehicleId: string;
    vehiclePlate: string;
    tripId?: string;
    scheduledTripId?: string;
    reason?: string;
  }
): Promise<void> => {
  // CF-58 / CF-59 / CF-60 / CF-86: Invocar el callable oficial y propagar errores sin silenciamiento
  const reqDoc = await getB2BRequestById(requestId);
  const schedId =
    assignment.scheduledTripId ||
    (reqDoc as any)?.scheduledTripId ||
    (!reqDoc?.isImmediate ? reqDoc?.tripId : undefined);
  const targetTripId = assignment.tripId || reqDoc?.tripId;

  if (schedId && !reqDoc?.isImmediate) {
    if (assignment.vehicleId) {
      // CF-86: assignScheduledTripDriver deja la reserva driver_assigned directamente
      await assignScheduledTripDriverCallable({
        scheduledTripId: schedId,
        driverId: assignment.driverId,
        vehicleId: assignment.vehicleId,
        reason:
          assignment.reason ||
          "Asignación directa desde consola de operaciones SuperAdmin Lilo",
      });
    } else {
      await offerScheduledTripCallable({
        scheduledTripId: schedId,
        driverId: assignment.driverId,
      });
    }
  } else if (targetTripId) {
    if (reqDoc?.assignedDriverId && reqDoc.assignedDriverId !== assignment.driverId) {
      await reassignDriverCallable({
        tripId: targetTripId,
        driverId: assignment.driverId,
        reason: assignment.reason || "Reasignación desde consola de despacho",
      });
    } else {
      await assignDriverCallable({
        tripId: targetTripId,
        driverId: assignment.driverId,
        reason: assignment.reason,
      });
    }
  }

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.folio === requestId
      ? {
          ...r,
          assignedDriverId: assignment.driverId,
          assignedDriverName: assignment.driverName,
          assignedDriverPhone: assignment.driverPhone,
          assignedVehicleId: assignment.vehicleId,
          assignedVehiclePlate: assignment.vehiclePlate,
          status: "assigned",
        }
      : r
  );
  notifyRequestSubscribers();

  try {
    const docRef = doc(db, REQUESTS_COLLECTION, requestId);
    await updateDoc(docRef, {
      assignedDriverId: assignment.driverId,
      assignedDriverName: assignment.driverName,
      assignedDriverPhone: assignment.driverPhone,
      assignedVehicleId: assignment.vehicleId,
      assignedVehiclePlate: assignment.vehiclePlate,
      status: "assigned",
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Espejo b2bRequests opcional; la fuente oficial es scheduledTrips/trips en backend
  }
};

export const ensureAuthenticated = async () => {
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      "lilousertest@gmail.com",
      "LiloDriver2026!"
    );
    return cred.user;
  } catch (e) {
    console.warn("[requestService] ensureAuthenticated note:", e);
    return null;
  }
};

/**
 * Las dos puertas de la cancelación de una reserva B2B (CF-54 y CF-68).
 *
 * La reserva y el viaje son dos canales distintos, y cada uno tiene su callable:
 *
 * - **Pre-despacho** (`available`, `offered`, `driver_rejected`, `driver_assigned`):
 *   la reserva todavía no es un viaje, así que cancela `cancelScheduledTrip` y es
 *   ese callable el que libera el techo de la empresa.
 * - **Post-despacho** (`dispatched` y lo que escribe el conductor después):
 *   la reserva ya cruzó al canal del viaje, así que cancela `cancelTrip` sobre el
 *   `rideId` del viaje despachado. `cancelScheduledTrip` la rechaza con
 *   `failed-precondition`.
 *
 * Se aceptan las dos grafías porque el panel normaliza el estado con
 * `mapRawTripStatus` antes de mostrarlo: `driver_assigned` se ve como `assigned` y
 * `dispatched` como `enRoute`.
 */
export type CancellationDoor = "cancelScheduledTrip" | "cancelTrip";

const PRE_DISPATCH_RESERVATION_STATUSES = new Set([
  "available",
  "offered",
  "driver_rejected",
  "driver_assigned",
  "requested",
  "seeking_driver",
  "confirmed",
  "assigned",
]);

const POST_DISPATCH_RIDE_STATUSES = new Set([
  "dispatched",
  "accepted",
  "driver_arrived",
  "in_progress",
  "arrived",
  "enRoute",
  "driverArrived",
  "inService",
]);

/**
 * Elige la puerta por ESTADO, nunca por el `code` del error que devolvió el
 * servidor: un `failed-precondition` no cambia de callable, se informa tal cual.
 */
const resolveCancellationDoor = (status: string): CancellationDoor => {
  const normalized = String(status ?? "").trim();
  if (PRE_DISPATCH_RESERVATION_STATUSES.has(normalized)) {
    return "cancelScheduledTrip";
  }
  if (POST_DISPATCH_RIDE_STATUSES.has(normalized)) {
    return "cancelTrip";
  }
  throw new Error(
    `No se puede cancelar una reserva B2B en estado "${normalized || "(vacío)"}": ` +
      "la cancelación elige su callable por estado (pre-despacho cancelScheduledTrip, post-despacho cancelTrip)."
  );
};

/**
 * Cancela una reserva corporativa B2B. El estado de la reserva decide la puerta:
 * pre-despacho libera el techo con `cancelScheduledTrip`, post-despacho cancela el
 * viaje con `cancelTrip`.
 */
export const cancelB2BCompanyReservation = async (
  requestId: string,
  status: string,
  tripId?: string,
  notes?: string
): Promise<{ releasedAmount: number; door: CancellationDoor }> => {
  await ensureAuthenticated();

  const door = resolveCancellationDoor(status);
  const targetId = tripId || requestId;
  const reason = notes || "Reserva corporativa cancelada por SuperAdmin";

  let releasedAmount = 0;
  if (door === "cancelScheduledTrip") {
    const res = await cancelScheduledTripCallable({
      scheduledTripId: targetId,
      reason,
    });
    releasedAmount = (res.data as any)?.releasedAmount ?? 0;
  } else {
    await cancelTripCallable({ rideId: targetId, reason });
  }

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.folio === requestId || r.tripId === targetId
      ? { ...r, status: "cancelled", notes: reason }
      : r
  );
  notifyRequestSubscribers();

  try {
    await updateDoc(doc(db, REQUESTS_COLLECTION, requestId), {
      status: "cancelled",
      notes: reason,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Espejo b2bRequests opcional; el callable backend ya aplicó la cancelación oficial
  }

  return { releasedAmount, door };
};

/**
 * Retira al conductor asignado de un viaje corporativo (`reportTripProblem` / `markDriverUnavailable`),
 * regresando el viaje a `seeking_driver` sin tocar el techo de consumo de la empresa (CF-23 / CF-87).
 */
export const withdrawB2BDriverAvailability = async (
  requestId: string,
  tripId?: string,
  driverId?: string,
  reason?: string
): Promise<void> => {
  const targetTripId = tripId || requestId;
  if (reason?.trim()) {
    await reportTripProblemCallable({
      tripId: targetTripId,
      reason: reason.trim(),
    });
  } else {
    await markDriverUnavailableCallable({ tripId: targetTripId, driverId });
  }

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.tripId === targetTripId
      ? {
          ...r,
          assignedDriverId: undefined,
          assignedDriverName: undefined,
          assignedDriverPhone: undefined,
          assignedVehicleId: undefined,
          assignedVehiclePlate: undefined,
          status: "seeking_driver",
        }
      : r
  );
  notifyRequestSubscribers();

  try {
    const docRef = doc(db, REQUESTS_COLLECTION, requestId);
    await updateDoc(docRef, {
      assignedDriverId: null,
      assignedDriverName: null,
      assignedDriverPhone: null,
      assignedVehicleId: null,
      assignedVehiclePlate: null,
      status: "seeking_driver",
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Espejo b2bRequests opcional; el callable backend ya aplicó el cambio oficial
  }
};

/**
 * CF-87: Reporta un problema en un viaje en curso (reportTripProblem callable),
 * transicionando el viaje a `seeking_driver` sin cancelar la reserva ni tocar el techo.
 */
export const reportB2BTripProblem = async (
  requestId: string,
  tripId: string,
  reason: string,
  coords?: { latitude?: number; longitude?: number },
  _previousDriverId?: string
): Promise<void> => {
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 500) {
    throw new Error("El motivo del reporte es obligatorio (1 a 500 caracteres).");
  }

  await reportTripProblemCallable({
    tripId,
    reason: cleanReason,
    ...(typeof coords?.latitude === "number" ? { latitude: coords.latitude } : {}),
    ...(typeof coords?.longitude === "number" ? { longitude: coords.longitude } : {}),
  });

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.tripId === tripId
      ? {
          ...r,
          assignedDriverId: undefined,
          assignedDriverName: undefined,
          assignedDriverPhone: undefined,
          assignedVehicleId: undefined,
          assignedVehiclePlate: undefined,
          status: "seeking_driver",
          notes: cleanReason,
        }
      : r
  );
  notifyRequestSubscribers();

  try {
    const docRef = doc(db, REQUESTS_COLLECTION, requestId);
    await updateDoc(docRef, {
      assignedDriverId: null,
      assignedDriverName: null,
      assignedDriverPhone: null,
      assignedVehicleId: null,
      assignedVehiclePlate: null,
      status: "seeking_driver",
      notes: cleanReason,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Espejo b2bRequests opcional; el callable backend ya reportó el problema
  }
};

/**
 * CF-87: Reasigna un nuevo conductor a un viaje reportado en `seeking_driver`
 * mediante `reassignTripDriverCallable`, devolviendo el viaje a `in_progress` (`inService`).
 */
export const reassignB2BTripDriver = async (
  requestId: string,
  assignment: {
    tripId: string;
    driverId: string;
    driverName: string;
    driverPhone: string;
    vehicleId: string;
    vehiclePlate: string;
    reason: string;
  }
): Promise<void> => {
  const cleanReason = assignment.reason.trim();
  if (!cleanReason || cleanReason.length > 500) {
    throw new Error("El motivo de reasignación es obligatorio (1 a 500 caracteres).");
  }

  await reassignTripDriverCallable({
    tripId: assignment.tripId,
    driverId: assignment.driverId,
    reason: cleanReason,
  });

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.tripId === assignment.tripId
      ? {
          ...r,
          assignedDriverId: assignment.driverId,
          assignedDriverName: assignment.driverName,
          assignedDriverPhone: assignment.driverPhone,
          assignedVehicleId: assignment.vehicleId,
          assignedVehiclePlate: assignment.vehiclePlate,
          status: "inService",
          notes: cleanReason,
        }
      : r
  );
  notifyRequestSubscribers();

  try {
    const docRef = doc(db, REQUESTS_COLLECTION, requestId);
    await updateDoc(docRef, {
      assignedDriverId: assignment.driverId,
      assignedDriverName: assignment.driverName,
      assignedDriverPhone: assignment.driverPhone,
      assignedVehicleId: assignment.vehicleId,
      assignedVehiclePlate: assignment.vehiclePlate,
      status: "inService",
      notes: cleanReason,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Espejo b2bRequests opcional; el callable backend ya reasignó al conductor
  }
};

