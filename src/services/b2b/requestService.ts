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
  >
): Promise<{ id: string; folio: string; tripId?: string }> => {
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
  let fareBreakdown = data.fareBreakdown;
  let finalAmount = data.finalAmount;

  if (!data.isImmediate) {
    try {
      const scheduledPickupAtIso =
        data.scheduledAt ||
        ((data as any).scheduledPickupAt?.toDate?.()
          ? (data as any).scheduledPickupAt.toDate().toISOString()
          : typeof (data as any).scheduledPickupAt === "string"
            ? (data as any).scheduledPickupAt
            : new Date(Date.now() + 3 * 3600 * 1000).toISOString());

      let schedRes: any = null;
      try {
        // CF-86: Preferir createScheduledTripForCompanyCallable para SuperAdmin / Operador de plataforma
        schedRes = await createScheduledTripForCompanyCallable({
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
          paymentMethod: "corporate",
          travellerId: data.travellerId || data.companyId,
          reason:
            data.notes?.trim() ||
            "Solicitud de traslado corporativo creada desde consola de operaciones SuperAdmin Lilo",
        });
      } catch (companyCallErr: any) {
        console.warn(
          "[requestService] createScheduledTripForCompany note (falling back to standard):",
          companyCallErr?.message
        );
        schedRes = await createScheduledTripCallable({
          countryId: "sv",
          companyId: data.companyId,
          costCenterId: data.costCenterId || undefined,
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
          passengerName: data.passengerNames?.[0] || data.travellerName || "Pasajero Corporativo",
          passengerPhone: data.passengerPhone,
          paymentMethod: "corporate",
          travellerId: data.travellerId || data.companyId,
        });
      }

      if (schedRes?.data?.scheduledTripId) {
        tripId = schedRes.data.scheduledTripId;
        if (schedRes.data.quote) {
          finalAmount = schedRes.data.quote.totalAmount;
        }
      }
    } catch (schedErr: any) {
      if (
        schedErr?.code === "functions/resource-exhausted" ||
        schedErr?.code === "functions/failed-precondition"
      ) {
        throw schedErr;
      }
      console.warn("[requestService] createScheduledTripCallable note:", schedErr?.message);
    }
  } else {
    // Invoke backend callable `createTrip` so server freezes pricing & validates ceiling (CF-08, CF-13, CF-14, CF-23)
    try {
      const callableRes = await createTripCallable({
        countryId: "sv",
        vehicleCategory: data.vehicleCategory,
        legs,
        travellerId: data.travellerId,
        origin: data.origin as unknown as Record<string, unknown>,
        destination: data.destination as unknown as Record<string, unknown>,
        paymentMethod: "corporate",
      });
      if (callableRes?.data?.tripId) {
        tripId = callableRes.data.tripId;
        fareBreakdown = callableRes.data.fareBreakdown;
        finalAmount = callableRes.data.fareBreakdown.farePrice;
      }
    } catch (err: any) {
      if (err?.code === "functions/resource-exhausted") {
        throw err;
      }
      console.warn("[requestService] createTripCallable fallback:", err?.message);
    }
  }

  if (!fareBreakdown) {
    const cleanFinal = Number(finalAmount || 0);
    const driverEarning = Number((cleanFinal * 0.7).toFixed(2));
    const commissionAmount = Number((cleanFinal - driverEarning).toFixed(2));
    fareBreakdown = {
      countryId: "sv",
      currency: "USD",
      distanceUnit: "km",
      chargedDistance: data.estimatedDistanceKm,
      farePrice: cleanFinal,
      driverEarning,
      commissionRate: 0.3,
      commissionAmount,
      minimumApplied: Boolean(
        data.tariffApplied &&
          data.estimatedDistanceKm <= data.tariffApplied.baseDistanceKm
      ),
      pricingFormulaVersion: "h1-v1",
    };
  }

  const folio =
    (data as any).folio ||
    (tripId
      ? `B2B-SV-${new Date().getFullYear()}-${tripId.slice(0, 6).toUpperCase()}`
      : `B2B-SV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);

  const payload = sanitizeFirestorePayload({
    ...data,
    legs,
    ...(tripId ? { tripId } : {}),
    ...(fareBreakdown ? { fareBreakdown } : {}),
    finalAmount,
    folio,
    countryId: "sv",
    status: data.status || "requested",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    const docRef = await addDoc(collection(db, REQUESTS_COLLECTION), payload);
    return { id: docRef.id, folio, tripId };
  } catch (addErr: any) {
    if (
      addErr?.code === "permission-denied" ||
      addErr?.message?.includes("insufficient permissions")
    ) {
      console.warn(
        "[requestService] b2bRequests direct write rejected by security rules:",
        addErr
      );
      if (tripId) {
        // Scheduled trip was successfully booked in backend callable
        return { id: tripId, folio, tripId };
      }
      throw new Error(
        "Permiso denegado por reglas de Firestore. El backend requiere crear reservas mediante 'createScheduledTrip', pero la función rechazó al SuperAdmin (falta soporte de companyId en payload para operadores de plataforma)."
      );
    }
    throw addErr;
  }
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

    await Promise.allSettled([
      updateDoc(doc(db, "scheduledTrips", requestId), scheduledUpdates),
      updateDoc(doc(db, "trips", requestId), tripUpdates),
      rtdbUpdate(rtdbRef(rtdb, `rideRequests/${requestId}`), rtdbUpdates),
      ...(isDriverArrived
        ? [
            httpsCallable(
              functions,
              "notifyClientDriverArrived"
            )({
              rideId: requestId,
              driverId: "ZFpZfYKfuSf0T0c04wqnBNknkiw2",
              clientId: "j1OC36FPz8UvspiaSWWpRAO2Uuu1",
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
    requestId,
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
  driverId?: string
): Promise<void> => {
  if (tripId) {
    try {
      await markDriverUnavailableCallable({ tripId, driverId });
    } catch (err) {
      console.warn("[requestService] markDriverUnavailableCallable fallback:", err);
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

