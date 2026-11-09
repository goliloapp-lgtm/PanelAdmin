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

  const targetRideId =
    assignment.tripId || assignment.scheduledTripId || requestId;
  if (typeof window !== "undefined" && targetRideId) {
    await fetch("/api/b2b/trip-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: targetRideId,
        status: "assigned",
        driverId: assignment.driverId,
        driverName: assignment.driverName,
        driverPhone: assignment.driverPhone,
        vehicleId: assignment.vehicleId,
        vehiclePlate: assignment.vehiclePlate,
      }),
    }).catch((e) => console.warn("[assignB2BRequestVehicleAndDriver] RTDB API error:", e));
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

export const updateB2BRequestStatus = async (
  requestId: string,
  status: B2BRequestStatus,
  notes?: string
): Promise<void> => {
  currentFirestoreDocs = currentFirestoreDocs.map((r) =>
    r.id === requestId || r.folio === requestId
      ? { ...r, status, notes: notes ?? r.notes }
      : r
  );
  notifyRequestSubscribers();

  try {
    const docRef = doc(db, REQUESTS_COLLECTION, requestId);
    const updates: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (notes !== undefined) {
      updates.notes = notes;
    }
    if (status === "completed") {
      updates.completedAt = serverTimestamp();
    }

    await updateDoc(docRef, updates).catch(() => {});

    // Mapear estado al ciclo de Firestore y Realtime Database para sincronización reactiva
    let scheduledStatus = "dispatched";
    let tripStatus = "accepted";
    let rtdbStatus = "accepted";
    let isDriverArrived = false;

    if (status === "driverArrived") {
      scheduledStatus = "driver_arrived";
      tripStatus = "driver_arrived";
      rtdbStatus = "driver_arrived";
      isDriverArrived = true;
    } else if (status === "inService") {
      scheduledStatus = "in_progress";
      tripStatus = "in_progress";
      rtdbStatus = "in_progress";
    } else if (status === "completed") {
      scheduledStatus = "completed";
      tripStatus = "completed";
      rtdbStatus = "completed";
    } else if (status === "cancelled") {
      scheduledStatus = "cancelled";
      tripStatus = "cancelled";
      rtdbStatus = "cancelled";
    } else if (status === "assigned") {
      scheduledStatus = "driver_assigned";
      tripStatus = "accepted";
    }

    const scheduledUpdates: Record<string, any> = {
      status: scheduledStatus,
      updatedAt: new Date().toISOString(),
    };
    const tripUpdates: Record<string, any> = {
      status: tripStatus,
      updatedAt: serverTimestamp(),
    };
    const rtdbUpdates: Record<string, any> = {
      status: rtdbStatus,
      updatedAt: Date.now(),
    };

    if (isDriverArrived) {
      scheduledUpdates.driverArrived = true;
      scheduledUpdates.driverArrivedAt = new Date().toISOString();
      tripUpdates.driverArrived = true;
      tripUpdates.driverArrivedAt = serverTimestamp();
      rtdbUpdates.driverArrived = true;
      rtdbUpdates.driverArrivedAt = Date.now();
    } else if (status === "inService") {
      scheduledUpdates.startedAt = new Date().toISOString();
      tripUpdates.startedAt = serverTimestamp();
      rtdbUpdates.startedAt = Date.now();
    } else if (status === "completed") {
      scheduledUpdates.completedAt = new Date().toISOString();
      tripUpdates.completedAt = serverTimestamp();
      rtdbUpdates.completedAt = Date.now();
    }

    const targetReq = currentFirestoreDocs.find(
      (r) => r.id === requestId || r.folio === requestId
    );
    const resolvedTripId =
      targetReq?.tripId ||
      (targetReq as any)?.scheduledTripId ||
      requestId;
    const resolvedDriverId =
      targetReq?.assignedDriverId || "ZFpZfYKfuSf0T0c04wqnBNknkiw2";
    const resolvedClientId =
      targetReq?.requestedByUid ||
      targetReq?.companyId ||
      auth.currentUser?.uid ||
      resolvedDriverId;

    // Sincronizar directamente con Realtime Database mediante el endpoint administrativo
    if (typeof window !== "undefined") {
      fetch("/api/b2b/trip-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: resolvedTripId,
          status,
          driverId: resolvedDriverId,
          clientId: resolvedClientId,
          notes,
        }),
      }).catch((e) => console.warn("[updateB2BRequestStatus] RTDB API route error:", e));
    }

    await Promise.allSettled([
      updateDoc(doc(db, "scheduledTrips", resolvedTripId), scheduledUpdates),
      updateDoc(doc(db, "trips", resolvedTripId), tripUpdates),
      rtdbUpdate(rtdbRef(rtdb, `rideRequests/${resolvedTripId}`), rtdbUpdates),
      ...(isDriverArrived
        ? [
            httpsCallable(
              functions,
              "notifyClientDriverArrived"
            )({
              rideId: resolvedTripId,
              driverId: resolvedDriverId,
              clientId: resolvedClientId,
            }),
          ]
        : []),
    ]);
  } catch {
    // Actualizado en memoria
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
  if (tripId) {
    try {
      const res = await cancelCompanyReservationCallable({ tripId });
      releasedAmount = res.data?.releasedAmount ?? 0;
    } catch (err) {
      console.warn("[requestService] cancelCompanyReservationCallable fallback:", err);
    }
  }
  await updateB2BRequestStatus(
    tripId || requestId,
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

  if (typeof window !== "undefined") {
    fetch("/api/b2b/trip-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: tripId || requestId,
        status: "seeking_driver",
        driverId,
        notes: reason || "Incidencia reportada en ruta",
      }),
    }).catch((e) => console.warn("[withdrawB2BDriverAvailability] RTDB API error:", e));
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

  if (typeof window !== "undefined") {
    await fetch("/api/b2b/trip-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        status: "seeking_driver",
        driverId: previousDriverId,
        notes: cleanReason,
      }),
    }).catch((e) => console.warn("[reportB2BTripProblem] RTDB API error:", e));
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

  if (typeof window !== "undefined") {
    await fetch("/api/b2b/trip-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: assignment.tripId,
        status: "inService",
        driverId: assignment.driverId,
        driverName: assignment.driverName,
        driverPhone: assignment.driverPhone,
        vehicleId: assignment.vehicleId,
        vehiclePlate: assignment.vehiclePlate,
        notes: cleanReason,
      }),
    }).catch((e) => console.warn("[reassignB2BTripDriver] RTDB API error:", e));
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

