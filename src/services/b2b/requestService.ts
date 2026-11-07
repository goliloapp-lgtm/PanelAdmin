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

export let FALLBACK_SV_REQUESTS: B2BServiceRequest[] = [
  {
    id: "reqSvDemo001",
    tripId: "tripSvDemo001",
    folio: "B2B-SV-2026-4810",
    countryId: "sv",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    costCenterId: "CCSJeYZJfT3FMy2kEass",
    costCenterName: "Techo Corporativo General · Planta Apopa",
    requestedByUid: "portalElAngel",
    requestedByName: "Gerencia Operaciones El Ángel",
    travellerId: "travSv001",
    travellerName: "Ing. Carlos Rivas",
    passengersCount: 2,
    passengerNames: ["Ing. Carlos Rivas", "Lic. Sofía Méndez"],
    passengerPhone: "+503 7890-1122",
    vehicleCategory: "suv",
    hasCargo: false,
    origin: {
      address: "89 Av. Norte y Calle El Mirador, Colonia Escalón, San Salvador",
      lat: 13.7086,
      lng: -89.2408,
    },
    stops: [
      {
        address: "63 Av. Sur y Alameda Roosevelt, San Salvador",
        lat: 13.6987,
        lng: -89.2261,
      },
    ],
    destination: {
      address: "Km 14 Carretera Troncal del Norte, Apopa, San Salvador",
      lat: 13.8022,
      lng: -89.1783,
    },
    roundTrip: true,
    legs: [
      { distance: 14.7, durationMinutes: 24 },
      { distance: 14.7, durationMinutes: 24 },
    ],
    scheduledAt: new Date().toISOString(),
    isImmediate: true,
    estimatedDistanceKm: 29.4,
    estimatedDurationMinutes: 48,
    tariffApplied: {
      category: "suv",
      ratePerKm: 0.67,
      minFare: 13.56,
      baseDistanceKm: 20,
      calculatedAmount: 27.12,
    },
    fareBreakdown: {
      countryId: "sv",
      currency: "USD",
      distanceUnit: "km",
      chargedDistance: 29.4,
      farePrice: 27.12,
      driverEarning: 18.98,
      commissionRate: 0.3,
      commissionAmount: 8.14,
      minimumApplied: true,
      pricingFormulaVersion: "h1-v1",
    },
    finalAmount: 27.12,
    assignedDriverId: "drvSv001",
    assignedDriverName: "Mauricio Ernesto Portillo",
    assignedDriverPhone: "+503 7845-1920",
    assignedVehicleId: "vehSvSuv001",
    assignedVehiclePlate: "P-849201",
    status: "inService",
  },
  {
    id: "reqSvDemo002",
    tripId: "tripSvDemo002",
    folio: "B2B-SV-2026-4811",
    countryId: "sv",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    costCenterId: "xJmKzymXoW9MBxnSE4bD",
    costCenterName: "Dirección Comercial y Logística (Sin límite)",
    requestedByUid: "portalElAngel",
    requestedByName: "Dirección Comercial El Ángel",
    travellerId: "travSv002",
    travellerName: "Lic. Sofía Méndez",
    passengersCount: 8,
    passengerNames: ["Comitiva Regional (8 ejecutivos)"],
    passengerPhone: "+503 7700-3344",
    vehicleCategory: "microbus",
    hasCargo: true,
    cargoDescription: "4 maletas ejecutivas y muestras de exportación",
    origin: {
      address: "Bulevar Santa Elena, Antiguo Cuscatlán, La Libertad",
      lat: 13.6695,
      lng: -89.2549,
    },
    stops: [],
    destination: {
      address: "Aeropuerto Internacional de El Salvador (SAL - Comalapa)",
      lat: 13.4409,
      lng: -89.0557,
    },
    roundTrip: false,
    legs: [{ distance: 62.5, durationMinutes: 72 }],
    scheduledAt: new Date().toISOString(),
    isImmediate: false,
    estimatedDistanceKm: 62.5,
    estimatedDurationMinutes: 72,
    tariffApplied: {
      category: "microbus",
      ratePerKm: 0.9,
      minFare: 45,
      baseDistanceKm: 50,
      calculatedAmount: 56.25,
    },
    fareBreakdown: {
      countryId: "sv",
      currency: "USD",
      distanceUnit: "km",
      chargedDistance: 62.5,
      farePrice: 56.25,
      driverEarning: 39.38,
      commissionRate: 0.3,
      commissionAmount: 16.87,
      minimumApplied: false,
      pricingFormulaVersion: "h1-v1",
    },
    finalAmount: 56.25,
    assignedDriverId: "drvSv003",
    assignedDriverName: "Óscar René Valladares",
    assignedDriverPhone: "+503 7901-4452",
    assignedVehicleId: "vehSvMicrobus003",
    assignedVehiclePlate: "MB-10428",
    status: "completed",
  },
];

const getTimestampMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const parsed = Date.parse(String(ts));
  return Number.isNaN(parsed) ? 0 : parsed;
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

export const generateB2BFolio = (): string => {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `B2B-SV-${year}-${rand}`;
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

  const emitMerged = () => {
    const map = new Map<string, B2BServiceRequest>();
    FALLBACK_SV_REQUESTS.forEach((r) => map.set(r.id, r));
    currentFirestoreDocs.forEach((r) => map.set(r.id, r));
    const merged = Array.from(map.values());
    callback(applyFilters(merged.length > 0 ? merged : FALLBACK_SV_REQUESTS));
  };

  requestListeners.add(emitMerged);

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

        emitMerged();
      },
      () => {
        emitMerged();
      }
    );
  });

  return () => {
    cancelled = true;
    requestListeners.delete(emitMerged);
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
      return FALLBACK_SV_REQUESTS.find((r) => r.id === id) || null;
    }
    return {
      id: snap.id,
      ...snap.data(),
    } as B2BServiceRequest;
  } catch {
    return FALLBACK_SV_REQUESTS.find((r) => r.id === id) || null;
  }
};

export const createB2BServiceRequest = async (
  data: Omit<
    B2BServiceRequest,
    "id" | "folio" | "countryId" | "createdAt" | "updatedAt"
  >
): Promise<{ id: string; folio: string; tripId?: string }> => {
  const folio = generateB2BFolio();

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

  // Invoke backend callable `createTrip` first so server freezes pricing & validates company ceiling (CF-08, CF-13, CF-14, CF-23)
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
    // Re-throw if backend explicitly rejected due to ceiling exceeded (resource-exhausted)
    if (err?.code === "functions/resource-exhausted") {
      throw err;
    }
    console.warn("[requestService] createTripCallable fallback:", err?.message);
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

  const payload = {
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
  };

  try {
    const docRef = await addDoc(collection(db, REQUESTS_COLLECTION), payload);
    return { id: docRef.id, folio, tripId };
  } catch {
    const newId = `reqSv${Date.now()}`;
    FALLBACK_SV_REQUESTS = [
      {
        id: newId,
        folio,
        countryId: "sv",
        ...data,
        legs,
        tripId,
        fareBreakdown,
        finalAmount,
        status: data.status || "requested",
      },
      ...FALLBACK_SV_REQUESTS,
    ];
    notifyRequestSubscribers();
    return { id: newId, folio, tripId };
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
      await offerScheduledTripCallable({
        scheduledTripId: schedId,
        driverId: assignment.driverId,
      });
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

  FALLBACK_SV_REQUESTS = FALLBACK_SV_REQUESTS.map((r) =>
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
  FALLBACK_SV_REQUESTS = FALLBACK_SV_REQUESTS.map((r) =>
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

  FALLBACK_SV_REQUESTS = FALLBACK_SV_REQUESTS.map((r) =>
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

