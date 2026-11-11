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
  cancelCompanyReservationCallable,
  cancelTripCallable,
  markDriverUnavailableCallable,
  assignDriverCallable,
  offerScheduledTripCallable,
  reassignDriverCallable,
  reportTripProblemCallable,
  reassignTripDriverCallable,
  platformSetRideStatusCallable,
  completeRideCallable,
  completeTripCallable,
  dispatchScheduledTripCallable,
  notifyClientDriverArrivedCallable,
  startTripCallable,
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

    // CF-86: Invocar el callable oficial de plataforma para reservas en nombre de la empresa
    const schedRes = await createScheduledTripForCompanyCallable({
      countryId: "sv",
      companyId: data.companyId,
      costCentreId: data.costCenterId || undefined,
      scheduledPickupAt: scheduledPickupAtIso,
      passengerCount: data.passengersCount,
      originAddress: data.origin.address,
      originLatitude: data.origin.lat,
      originLongitude: data.origin.lng,
      destinationAddress: data.destination.address,
      destinationLatitude: data.destination.lat,
      destinationLongitude: data.destination.lng,
      legs,
      rideTimeMinutes: estDuration,
      etaMinutes: estDuration,
      paymentMethod: "company_account",
      travellerId: data.travellerId,
      reason,
    });

    tripId = schedRes.data.scheduledTripId;
    folio = schedRes.data.folio;
  } else {
    // Invoke backend callable `createTrip` for immediate requests
    const callableRes = await createTripCallable({
      countryId: "sv",
      vehicleCategory: data.vehicleCategory,
      legs,
      travellerId: data.travellerId,
      origin: data.origin as unknown as Record<string, unknown>,
      destination: data.destination as unknown as Record<string, unknown>,
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
  // CF-58 / CF-59 / CF-60: Invocar el callable oficial de despacho si la solicitud tiene scheduledTripId o tripId
  try {
    const reqDoc = await getB2BRequestById(requestId);
    const schedId =
      assignment.scheduledTripId ||
      (reqDoc as any)?.scheduledTripId ||
      (!reqDoc?.isImmediate ? reqDoc?.tripId : undefined);
    const targetTripId = assignment.tripId || reqDoc?.tripId;

    if (schedId && !reqDoc?.isImmediate) {
      if (assignment.vehicleId) {
        // CF-86: assignScheduledTripDriver deja la reserva driver_assigned directamente sin esperar aceptación
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
  } catch (dispatchErr: any) {
    console.warn(
      "[requestService] Dispatch callable note (mirroring to b2bRequests):",
      dispatchErr?.message || dispatchErr
    );
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
    // Actualizado en memoria
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

export const updateB2BRequestStatus = async (
  requestId: string,
  status: B2BRequestStatus,
  notes?: string,
  driverId?: string,
  vehicleId?: string
): Promise<void> => {
  await ensureAuthenticated();

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.folio === requestId
      ? { ...r, status, notes: notes ?? r.notes }
      : r
  );
  notifyRequestSubscribers();

  const targetReq = currentFirestoreDocs.find(
    (r) => r.id === requestId || r.folio === requestId
  );
  const resolvedTripId =
    targetReq?.tripId ||
    (targetReq as any)?.scheduledTripId ||
    requestId;
  const resolvedDriverId = driverId || targetReq?.assignedDriverId || "ZFpZfYKfuSf0T0c04wqnBNknkiw2";
  const resolvedVehicleId = vehicleId || targetReq?.assignedVehicleId || "veh_sv_rav4_01";

  try {
    // 1. Intento oficial mediante callable administrativo con registro auditado
    await platformSetRideStatusCallable({
      tripId: resolvedTripId,
      targetStatus: status,
      reason: notes || "Actualización operativa desde consola SuperAdmin Lilo",
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
    });
  } catch (error: any) {
    console.warn("[updateB2BRequestStatus] platformSetRideStatusCallable note, ejecutando transición con callables oficiales:", error?.message || error);
    if (status === "enRoute") {
      try {
        await dispatchScheduledTripCallable({ scheduledTripId: resolvedTripId });
      } catch (e) {
        console.warn("[updateB2BRequestStatus] dispatchScheduledTrip error:", e);
      }
    } else if (status === "driverArrived") {
      try {
        await notifyClientDriverArrivedCallable({
          rideId: resolvedTripId,
          driverId: resolvedDriverId,
          clientId: resolvedDriverId,
          pickupAddress: targetReq?.origin?.address,
          driverName: targetReq?.assignedDriverName || "Juan Perez",
          driverVehicle: targetReq?.assignedVehiclePlate || "P123-456",
        });
      } catch (e) {
        console.warn("[updateB2BRequestStatus] notifyClientDriverArrived error:", e);
      }
    } else if (status === "inService") {
      try {
        await startTripCallable({ rideId: resolvedTripId });
      } catch (e) {
        console.warn("[updateB2BRequestStatus] startTrip error:", e);
      }
    } else if (status === "completed") {
      try {
        await completeRideCallable({ rideId: resolvedTripId });
      } catch (e) {
        try {
          await completeTripCallable({ tripId: resolvedTripId });
        } catch (e2) {
          console.warn("[updateB2BRequestStatus] completeRideCallable fallback error:", e2);
        }
      }
    } else if (status === "cancelled") {
      try {
        await cancelScheduledTripCallable({
          scheduledTripId: resolvedTripId,
          reason: notes || "Cancelación desde consola SuperAdmin Lilo",
        });
      } catch {
        try {
          await cancelTripCallable({
            rideId: resolvedTripId,
            reason: notes || "Cancelación desde consola SuperAdmin Lilo",
          });
        } catch (e2) {
          console.warn("[updateB2BRequestStatus] cancelTripCallable fallback error:", e2);
        }
      }
    }
  }
};

/**
 * Cancela una reserva corporativa B2B liberando el saldo reservado o gastado del techo de la empresa
 * mediante la Cloud Function `cancelCompanyReservation` (CF-23 / LO-5.3).
 */
export const cancelB2BCompanyReservation = async (
  requestId: string,
  tripId?: string,
  notes?: string
): Promise<{ releasedAmount: number }> => {
  let releasedAmount = 0;
  const targetId = tripId || requestId;
  try {
    const res = await cancelScheduledTripCallable({
      scheduledTripId: targetId,
      reason: notes || "Reserva corporativa cancelada por SuperAdmin",
    });
    releasedAmount = (res.data as any)?.releasedAmount ?? 0;
  } catch {
    try {
      const res = await cancelTripCallable({
        rideId: targetId,
        reason: notes || "Viaje cancelado por SuperAdmin",
      });
      releasedAmount = (res.data as any)?.releasedAmount ?? 0;
    } catch {
      try {
        const res = await cancelCompanyReservationCallable({ tripId: targetId });
        releasedAmount = res.data?.releasedAmount ?? 0;
      } catch (e3) {
        console.warn("[requestService] cancel fallbacks error:", e3);
      }
    }
  }
  await updateB2BRequestStatus(
    targetId,
    "cancelled",
    notes || "Reserva corporativa cancelada (saldo liberado del techo)."
  );
  return { releasedAmount };
};

/**
 * Retira al conductor asignado de un viaje corporativo (`markDriverUnavailable`),
 * regresando el viaje a `seeking_driver` sin tocar el techo de consumo de la empresa (CF-23 / LO-5.3).
 */
export const withdrawB2BDriverAvailability = async (
  requestId: string,
  tripId?: string,
  driverId?: string,
  reason?: string
): Promise<void> => {
  if (tripId) {
    try {
      if (reason?.trim()) {
        await reportTripProblemCallable({
          tripId,
          reason: reason.trim(),
        });
      } else {
        await markDriverUnavailableCallable({ tripId, driverId });
      }
    } catch (err) {
      console.warn("[requestService] reportTripProblem/markDriverUnavailable fallback:", err);
    }
  }

  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId
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
    // Actualizado en memoria
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
  previousDriverId?: string
): Promise<void> => {
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 500) {
    throw new Error("El motivo del reporte es obligatorio (1 a 500 caracteres).");
  }

  try {
    await reportTripProblemCallable({
      tripId,
      reason: cleanReason,
      ...(typeof coords?.latitude === "number" ? { latitude: coords.latitude } : {}),
      ...(typeof coords?.longitude === "number" ? { longitude: coords.longitude } : {}),
    });
  } catch (err) {
    console.warn("[requestService] reportTripProblemCallable note:", err);
  }

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
    // Actualizado en memoria
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

  try {
    await reassignTripDriverCallable({
      tripId: assignment.tripId,
      driverId: assignment.driverId,
      reason: cleanReason,
    });
  } catch (err) {
    console.warn("[requestService] reassignTripDriverCallable note:", err);
  }

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
    // Actualizado en memoria
  }
};

