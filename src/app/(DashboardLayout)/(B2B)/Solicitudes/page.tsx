"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Drawer,
  Stepper,
  Step,
  StepLabel,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
} from "@mui/material";
import {
  IconPlus,
  IconSearch,
  IconMapPin,
  IconCar,
  IconUser,
  IconPackage,
  IconCheck,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import { ref, onValue } from "firebase/database";
import { doc, getDoc } from "firebase/firestore";
import { rtdb, db } from "@/utils/firebase";
import {
  listEligibleDriversCallable,
  EligibleDriverView,
  listTripEventsCallable,
  TripEventRow,
  listTripIncidentsCallable,
  TripIncidentRow,
  resolveTripIncidentCallable,
  updateOperationsConfigCallable,
  listPlatformScheduledTripsCallable,
  PlatformScheduledTripRow,
  listPlatformTripsCallable,
  writeTripHistoryCallable,
} from "@/utils/functions";
import GoogleTripTrackingMap from "../_components/GoogleTripTrackingMap";
import StatusBadge from "../_components/StatusBadge";
import toast from "react-hot-toast";
import { formatFriendlyError } from "@/utils/friendlyError";
import {
  B2BCompany,
  B2BRequestStatus,
  B2BServiceRequest,
  B2BVehicle,
} from "@/types/b2b";
import {
  subscribeToB2BCompanies,
  subscribeToB2BRequests,
  subscribeToB2BVehicles,
  assignB2BRequestVehicleAndDriver,
  updateB2BRequestStatus,
  cancelB2BCompanyReservation,
  withdrawB2BDriverAvailability,
  releaseB2BRequestToPool,
  reportB2BTripProblem,
  reassignB2BTripDriver,
} from "@/services/b2b";

const LIFECYCLE_STEPS: Array<{ status: B2BRequestStatus; label: string }> = [
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

const B2BSolicitudesPage = () => {
  const router = useRouter();
  const [rawRequests, setRawRequests] = useState<B2BServiceRequest[]>([]);
  const [platformScheduledTrips, setPlatformScheduledTrips] = useState<
    PlatformScheduledTripRow[]
  >([]);
  const [platformTrips, setPlatformTrips] = useState<any[]>([]);
  const [companies, setCompanies] = useState<B2BCompany[]>([]);
  const [vehicles, setVehicles] = useState<B2BVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedbackState] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const setFeedback = (
    next: { type: "success" | "error"; message: string } | null
  ) => {
    if (!next) {
      setFeedbackState(null);
      return;
    }
    const cleanMsg =
      next.type === "error"
        ? formatFriendlyError(next.message)
        : next.message.replace(/\((?:CF|LO|D)-\d+(?:\.\d+)?\)/gi, "").trim();
    setFeedbackState({ type: next.type, message: cleanMsg });
    if (next.type === "error") {
      toast.error(cleanMsg);
    } else {
      toast.success(cleanMsg);
    }
  };

  // Overrides de estado operativo manual para asegurar reactividad inmediata
  const [rtdbRidesMap, setRtdbRidesMap] = useState<Record<string, any>>({});
  const [operationalStatusMap, setOperationalStatusMap] = useState<
    Record<string, B2BRequestStatus>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lilo_b2b_operational_status_map");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const setOperationalStatus = (id: string, status: B2BRequestStatus) => {
    setOperationalStatusMap((prev) => {
      const updated = {
        ...prev,
        [id]: status,
      };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            "lilo_b2b_operational_status_map",
            JSON.stringify(updated)
          );
        } catch {}
      }
      return updated;
    });
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Drawer de Monitoreo en Tiempo Real (H2.5-FE + H3 Despacho/Incidencias)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  // CF-57, CF-61, CF-63, CF-64, CF-49
  const [eligibleDrivers, setEligibleDrivers] = useState<EligibleDriverView[]>(
    []
  );
  const [tripEvents, setTripEvents] = useState<TripEventRow[]>([]);
  const [tripIncidents, setTripIncidents] = useState<TripIncidentRow[]>([]);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(
    null
  );
  const [resolutionCode, setResolutionCode] = useState<
    | "no_action"
    | "driver_warning"
    | "company_credit"
    | "trip_cancelled"
    | "trip_refunded"
    | "other"
  >("no_action");
  const [resolutionNote, setResolutionNote] = useState("");

  const [showOpsConfig, setShowOpsConfig] = useState(false);
  const [deadTimeMinutes, setDeadTimeMinutes] = useState(60);
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(360);
  const [assignmentWaitMinutes, setAssignmentWaitMinutes] = useState(15);
  const [adminPortalUrl, setAdminPortalUrl] = useState(
    "https://admin.liloapp.com/"
  );
  const [companyPortalUrl, setCompanyPortalUrl] = useState(
    "https://b2b.liloapp.com/"
  );
  const [opsReason, setOpsReason] = useState("Ajuste operativo de plataforma");
  const [savingOps, setSavingOps] = useState(false);

  const isFetchingTripsRef = React.useRef(false);

  const fetchScheduledTrips = async () => {
    if (isFetchingTripsRef.current) return;
    try {
      isFetchingTripsRef.current = true;
      const [resSched, resTrips] = await Promise.allSettled([
        listPlatformScheduledTripsCallable({ countryId: "sv" }),
        listPlatformTripsCallable({ countryId: "sv", limit: 50 }),
      ]);
      if (
        resSched.status === "fulfilled" &&
        resSched.value.data?.scheduledTrips
      ) {
        setPlatformScheduledTrips(resSched.value.data.scheduledTrips);
      }
      if (
        resTrips.status === "fulfilled" &&
        (resTrips.value.data as any)?.trips
      ) {
        setPlatformTrips((resTrips.value.data as any).trips);
      }
    } catch (err: any) {
      console.warn("[Solicitudes] fetch trips error:", err?.message || err);
    } finally {
      isFetchingTripsRef.current = false;
    }
  };

  useEffect(() => {
    const unsubReqs = subscribeToB2BRequests(
      (data) => {
        setRawRequests(data);
        setLoading(false);
      },
      undefined,
      () => setLoading(false)
    );
    const unsubComps = subscribeToB2BCompanies((data) => setCompanies(data));
    const unsubVehs = subscribeToB2BVehicles((data) => setVehicles(data));

    fetchScheduledTrips();
    // Polling controlado a 30 segundos (las acciones del operador refrescan inmediatamente bajo demanda)
    const interval = setInterval(fetchScheduledTrips, 30000);
    const onFocus = () => fetchScheduledTrips();
    window.addEventListener("focus", onFocus);

    getDoc(doc(db, "platformConfig", "operations"))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (typeof d.deadTimeMinutes === "number")
            setDeadTimeMinutes(d.deadTimeMinutes);
          if (typeof d.reminderLeadMinutes === "number")
            setReminderLeadMinutes(d.reminderLeadMinutes);
          if (typeof d.assignmentWaitMinutes === "number")
            setAssignmentWaitMinutes(d.assignmentWaitMinutes);
          if (typeof d.adminPortalUrl === "string")
            setAdminPortalUrl(d.adminPortalUrl);
          if (typeof d.companyPortalUrl === "string")
            setCompanyPortalUrl(d.companyPortalUrl);
        }
      })
      .catch(() => {});

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      unsubReqs();
      unsubComps();
      unsubVehs();
    };
  }, []);

  const normalizeStatus = (status: string): B2BRequestStatus => {
    if (status === "driver_assigned" || status === "assigned") return "assigned";
    if (status === "available" || status === "offered" || status === "seeking_driver") return "seeking_driver";
    if (status === "dispatched" || status === "enRoute") return "enRoute";
    if (status === "in_progress" || status === "inService") return "inService";
    if (status === "driverArrived" || status === "driver_arrived") return "driverArrived";
    if (status === "arrived") return "arrived";
    if (status === "completed") return "completed";
    if (status === "cancelled") return "cancelled";
    if (status === "rejected") return "rejected";
    return (status as B2BRequestStatus) || "requested";
  };

  const mappedScheduledRequests = useMemo<B2BServiceRequest[]>(() => {
    return platformScheduledTrips.map((st) => {
      const liveTrip = platformTrips.find(
        (t) => t.tripId === st.scheduledTripId
      );
      const rtdbRide = rtdbRidesMap[st.scheduledTripId];
      const effectiveRawStatus =
        rtdbRide?.mappedB2BStatus || liveTrip?.status || st.status;
      const mappedStatus = normalizeStatus(effectiveRawStatus);
      const effectiveVehId = rtdbRide?.vehicleId || st.acceptedVehicleId;
      const veh = vehicles.find((v) => v.id === effectiveVehId);
      const comp = companies.find((c) => c.id === st.companyId);

      const isSeeking =
        mappedStatus === "seeking_driver" || mappedStatus === "requested";
      const driverName = isSeeking
        ? undefined
        : rtdbRide?.driverName ||
          veh?.driverName ||
          (st as any).driverName ||
          undefined;
      const driverPhone = isSeeking
        ? undefined
        : rtdbRide?.driverPhone ||
          veh?.driverPhone ||
          (st as any).driverPhone ||
          undefined;
      const driverId = isSeeking
        ? undefined
        : rtdbRide?.driverId ||
          (st as any).driverId ||
          veh?.driverId ||
          undefined;
      const vehiclePlate = isSeeking
        ? undefined
        : rtdbRide?.vehiclePlate ||
          veh?.plate ||
          (st as any).vehiclePlate ||
          undefined;

      return {
        id: st.scheduledTripId,
        tripId: st.scheduledTripId,
        scheduledTripId: st.scheduledTripId,
        folio: (st as any).folio || `B2B-SV-${st.scheduledTripId.slice(0, 6).toUpperCase()}`,
        countryId: "sv",
        companyId: st.companyId || comp?.id || "",
        companyName: comp?.tradeName || comp?.legalName || (st.companyId ? "Empresa B2B" : "Sin Empresa Asignada"),
        costCenterId: (st as any).costCentreId || (st as any).costCenterId || "",
        costCenterName: (st as any).costCentreName || (st as any).costCenterName || "General",
        requestedByUid: (st as any).requestedByUid || "",
        requestedByName: (st as any).requestedByName || "Coordinador Corporativo",
        travellerId: st.travellerId || "",
        travellerName: (st as any).travellerName || (st.travellerId ? "Viajero Corporativo" : ""),
        passengersCount: (st as any).passengerCount || (st.categoryId === "microbus" ? 8 : 1),
        passengerNames: (st as any).passengerName ? [(st as any).passengerName] : [],
        passengerPhone: (st as any).passengerPhone || "",
        vehicleCategory: (st.categoryId === "pickup" ? "pickup" : st.categoryId === "microbus" ? "microbus" : "suv") as any,
        hasCargo: Boolean((st as any).hasCargo),
        origin: {
          address: st.originAddress,
          lat: 13.7086,
          lng: -89.2408,
        },
        stops: [],
        destination: {
          address: st.destinationAddress,
          lat: 13.7000,
          lng: -89.2300,
        },
        roundTrip: false,
        legs: [
          {
            distance: Number(rtdbRide?.chargedDistance || (st as any).chargedDistance || 15),
            durationMinutes: 25,
          },
        ],
        scheduledAt: st.scheduledPickupAt,
        createdAt: rtdbRide?.createdAt || (st as any).createdAt || undefined,
        isImmediate: false,
        estimatedDistanceKm: Number(
          rtdbRide?.chargedDistance || (st as any).chargedDistance || 15
        ),
        estimatedDurationMinutes: 25,
        tariffApplied: {
          category: (st.categoryId as any) || "suv",
          ratePerKm: 0.67,
          minFare: 13.56,
          baseDistanceKm: 20,
          calculatedAmount: st.totalAmount,
        },
        fareBreakdown: {
          countryId: "sv",
          currency: "USD",
          distanceUnit: "km",
          chargedDistance: 15,
          farePrice: st.totalAmount,
          driverEarning: Number((st.totalAmount * 0.7).toFixed(2)),
          commissionRate: 0.3,
          commissionAmount: Number((st.totalAmount * 0.3).toFixed(2)),
          minimumApplied: false,
          pricingFormulaVersion: "h1-v1",
        },
        finalAmount: st.totalAmount,
        assignedDriverId: driverId,
        assignedDriverName: driverName,
        assignedDriverPhone: driverPhone,
        assignedVehicleId: isSeeking ? undefined : effectiveVehId,
        assignedVehiclePlate: vehiclePlate,
        status: mappedStatus,
      };
    });
  }, [platformScheduledTrips, platformTrips, rtdbRidesMap, vehicles, companies]);

  const getLifecycleStepIndex = (status: string): number => {
    const norm = normalizeStatus(status);
    const idx = LIFECYCLE_STEPS.findIndex((s) => s.status === norm);
    if (norm === "invoiced") return LIFECYCLE_STEPS.length;
    return idx >= 0 ? idx : 0;
  };

  const requests = useMemo<B2BServiceRequest[]>(() => {
    const list: B2BServiceRequest[] = rawRequests.map((r) => {
      const targetId = r.tripId || (r as any).scheduledTripId || r.id;
      const rtdbRide = rtdbRidesMap[targetId] || rtdbRidesMap[r.id];
      const overrideStatus =
        operationalStatusMap[targetId] ||
        operationalStatusMap[r.id] ||
        (rtdbRide?.mappedB2BStatus as B2BRequestStatus | undefined);
      const resolvedStatus = overrideStatus || r.status;
      const isSeeking =
        resolvedStatus === "seeking_driver" || resolvedStatus === "requested";
      const effVehId = rtdbRide?.vehicleId || r.assignedVehicleId;
      const veh = vehicles.find((v) => v.id === effVehId);
      return {
        ...r,
        status: resolvedStatus,
        assignedDriverId: isSeeking
          ? undefined
          : rtdbRide?.driverId || r.assignedDriverId || veh?.driverId,
        assignedDriverName: isSeeking
          ? undefined
          : rtdbRide?.driverName || r.assignedDriverName || veh?.driverName,
        assignedDriverPhone: isSeeking
          ? undefined
          : rtdbRide?.driverPhone || r.assignedDriverPhone || veh?.driverPhone,
        assignedVehicleId: isSeeking ? undefined : effVehId,
        assignedVehiclePlate: isSeeking
          ? undefined
          : rtdbRide?.vehiclePlate || r.assignedVehiclePlate || veh?.plate,
        notes: rtdbRide?.interruptionReason || r.notes,
      };
    });

    for (const sReq of mappedScheduledRequests) {
      const existingIdx = list.findIndex(
        (r) =>
          r.id === sReq.id ||
          (r as any).scheduledTripId === sReq.id ||
          r.tripId === sReq.id
      );

      const overrideStatus =
        operationalStatusMap[sReq.id] ||
        (sReq.tripId ? operationalStatusMap[sReq.tripId] : undefined) ||
        operationalStatusMap[(sReq as any).scheduledTripId || ""];

      if (existingIdx >= 0) {
        const currentStatus =
          overrideStatus || list[existingIdx].status;
        const currentStep = getLifecycleStepIndex(currentStatus);
        const scheduledStep = getLifecycleStepIndex(sReq.status);
        const resolvedStatus =
          overrideStatus ||
          (currentStep > scheduledStep ? currentStatus : sReq.status);
        const isSeeking =
          resolvedStatus === "seeking_driver" || resolvedStatus === "requested";

        list[existingIdx] = {
          ...list[existingIdx],
          ...sReq,
          status: resolvedStatus,
          assignedDriverId: isSeeking
            ? undefined
            : sReq.assignedDriverId || list[existingIdx].assignedDriverId,
          assignedDriverName: isSeeking
            ? undefined
            : sReq.assignedDriverName || list[existingIdx].assignedDriverName,
          assignedDriverPhone: isSeeking
            ? undefined
            : sReq.assignedDriverPhone || list[existingIdx].assignedDriverPhone,
          assignedVehicleId: isSeeking
            ? undefined
            : sReq.assignedVehicleId || list[existingIdx].assignedVehicleId,
          assignedVehiclePlate: isSeeking
            ? undefined
            : sReq.assignedVehiclePlate || list[existingIdx].assignedVehiclePlate,
        };
      } else {
        list.push({
          ...sReq,
          status: overrideStatus || sReq.status,
        });
      }
    }

    const getCreatedTimestamp = (req: B2BServiceRequest): number => {
      const rtdbC = rtdbRidesMap[req.id]?.createdAt;
      if (typeof rtdbC === "number" && rtdbC > 0) return rtdbC;
      if (typeof rtdbC === "string") {
        const parsed = Date.parse(rtdbC);
        if (!isNaN(parsed)) return parsed;
      }
      const c = req.createdAt as any;
      if (typeof c === "number" && c > 0) return c;
      if (typeof c?.toMillis === "function") return c.toMillis();
      if (typeof c?.seconds === "number") return c.seconds * 1000;
      if (typeof c === "string") {
        const parsed = Date.parse(c);
        if (!isNaN(parsed)) return parsed;
      }
      const rtdbUpd = rtdbRidesMap[req.id]?.updatedAt;
      if (typeof rtdbUpd === "number" && rtdbUpd > 0) return rtdbUpd;
      return Date.parse(String(req.scheduledAt || "")) || 0;
    };

    list.sort((a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a));

    return list;
  }, [rawRequests, mappedScheduledRequests, platformTrips, rtdbRidesMap, vehicles, operationalStatusMap]);

  const activeRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

  const activeVehicleId = activeRequest?.assignedVehicleId || "";
  const activeCategoryId = activeRequest?.vehicleCategory || "";
  const activeSchedId = (activeRequest as any)?.scheduledTripId || "";
  const activeTripId = activeRequest?.tripId || "";
  const activeStatus = activeRequest?.status || "";
  const activeIsImmediate = Boolean(activeRequest?.isImmediate);

  const lastFetchedKeyRef = React.useRef<string>("");

  useEffect(() => {
    setSelectedVehicleId(activeVehicleId);

    if (!selectedRequestId) {
      setEligibleDrivers([]);
      setTripEvents([]);
      setTripIncidents([]);
      lastFetchedKeyRef.current = "";
      return;
    }

    const fetchKey = `${selectedRequestId}:${activeStatus}:${activeCategoryId}`;
    if (lastFetchedKeyRef.current === fetchKey) {
      return;
    }
    lastFetchedKeyRef.current = fetchKey;

    const catId =
      activeCategoryId === "pickup"
        ? "pickup"
        : activeCategoryId === "microbus"
          ? "microbus"
          : "suv";

    listEligibleDriversCallable({
      categoryId: catId,
      countryId: "sv",
      ...(activeSchedId && !activeIsImmediate
        ? { scheduledTripId: activeSchedId }
        : activeTripId
          ? { tripId: activeTripId }
          : {}),
    })
      .then((res) => setEligibleDrivers(res.data?.drivers || []))
      .catch(() => setEligibleDrivers([]));

    let liveTimer: any = null;
    const subjectId = activeTripId || activeSchedId || selectedRequestId;
    if (subjectId) {
      const pollEventsAndTrips = () => {
        listTripEventsCallable({ tripId: subjectId, limit: 25 })
          .then((res) => setTripEvents(res.data?.events || []))
          .catch(() => {});
        listPlatformTripsCallable({ countryId: "sv", limit: 30 })
          .then((res) => {
            if ((res.data as any)?.trips) {
              setPlatformTrips((res.data as any).trips);
            }
          })
          .catch(() => {});
      };
      pollEventsAndTrips();
      liveTimer = setInterval(pollEventsAndTrips, 4000);

      listTripIncidentsCallable({ tripId: subjectId, limit: 20 })
        .then((res) => setTripIncidents(res.data?.incidents || []))
        .catch(() => setTripIncidents([]));
    }

    return () => {
      if (liveTimer) clearInterval(liveTimer);
    };
  }, [
    selectedRequestId,
    activeVehicleId,
    activeCategoryId,
    activeSchedId,
    activeTripId,
    activeStatus,
    activeIsImmediate,
  ]);

  const [driverTelemetry, setDriverTelemetry] = useState<{
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    status?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeRequest?.assignedDriverId) {
      setDriverTelemetry(null);
      return;
    }
    // CF-55: telemetría activa en RTDB `conductores_activos/{driverId}`
    const activeDriverRef = ref(
      rtdb,
      `conductores_activos/${activeRequest.assignedDriverId}`
    );
    const unsub = onValue(activeDriverRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setDriverTelemetry({
          lat: typeof val.lat === "number" ? val.lat : val.latitude,
          lng: typeof val.lng === "number" ? val.lng : val.longitude,
          speed: val.speed,
          heading: val.bearing ?? val.heading,
          status: val.status,
        });

        if (val.status === "on_trip" && activeRequest) {
          setOperationalStatus(activeRequest.id, "inService");
          if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "inService");
        } else if (val.status === "disponible" && !val.currentRideId && activeRequest) {
          const targetId = activeRequest.tripId || (activeRequest as any).scheduledTripId || activeRequest.id;
          fetch(`/api/b2b/trip-status?tripId=${encodeURIComponent(targetId)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.status === "completed") {
                setOperationalStatus(activeRequest.id, "completed");
                if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "completed");
                if ((activeRequest as any).scheduledTripId) {
                  setOperationalStatus((activeRequest as any).scheduledTripId, "completed");
                }
              }
            })
            .catch(() => {});
        }
      } else {
        setDriverTelemetry(null);
      }
    });
    return () => unsub();
  }, [activeRequest?.assignedDriverId]);

  // Sincronización global en tiempo real de todas las filas de la tabla desde RTDB (`?all=1`)
  useEffect(() => {
    let isMounted = true;
    const syncAllRidesFromRtdb = async () => {
      try {
        const res = await fetch("/api/b2b/trip-status?all=1");
        if (!res.ok || !isMounted) return;
        const payload = await res.json();
        const rides = payload?.rides || {};
        setRtdbRidesMap(rides);
        setOperationalStatusMap((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [rId, rInfo] of Object.entries<any>(rides)) {
            const b2bSt = rInfo?.mappedB2BStatus as B2BRequestStatus | undefined;
            if (b2bSt && next[rId] !== b2bSt) {
              next[rId] = b2bSt;
              changed = true;
            }
          }
          if (changed && typeof window !== "undefined") {
            try {
              localStorage.setItem(
                "lilo_b2b_operational_status_map",
                JSON.stringify(next)
              );
            } catch {}
          }
          return changed ? next : prev;
        });
      } catch {}
    };

    void syncAllRidesFromRtdb();
    const timer = setInterval(syncAllRidesFromRtdb, 3000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // CF-65: Sincronización continua de estado en tiempo real con Realtime Database (RTDB)
  useEffect(() => {
    const targetRideId =
      activeRequest?.tripId ||
      (activeRequest as any)?.scheduledTripId ||
      activeRequest?.id;

    if (!targetRideId || !activeRequest) return;

    let isMounted = true;
    const syncRtdbStatus = async () => {
      try {
        const res = await fetch(
          `/api/b2b/trip-status?tripId=${encodeURIComponent(targetRideId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.exists && isMounted) {
          if (data.driverTelemetry?.lat && data.driverTelemetry?.lng) {
            setDriverTelemetry((prev) => prev || data.driverTelemetry);
          }
          const rtdbStatus = data.status;
          let mappedB2BStatus: B2BRequestStatus | null = data.mappedB2BStatus || null;
          if (rtdbStatus === "driver_arrived") mappedB2BStatus = "driverArrived";
          else if (rtdbStatus === "in_progress") mappedB2BStatus = "inService";
          else if (rtdbStatus === "seeking_driver") mappedB2BStatus = "seeking_driver";
          else if (rtdbStatus === "completed") mappedB2BStatus = "completed";
          else if (rtdbStatus === "cancelled") mappedB2BStatus = "cancelled";
          else if (rtdbStatus === "accepted") mappedB2BStatus = "enRoute";
          else if (rtdbStatus === "assigned" || rtdbStatus === "driver_assigned") mappedB2BStatus = "assigned";

          if (mappedB2BStatus) {
            setOperationalStatus(targetRideId, mappedB2BStatus);
            setOperationalStatus(activeRequest.id, mappedB2BStatus);
            if (activeRequest.tripId) {
              setOperationalStatus(activeRequest.tripId, mappedB2BStatus);
            }
            if (mappedB2BStatus === "seeking_driver") {
              setRawRequests((prev) =>
                prev.map((r) =>
                  r.id === activeRequest.id || r.id === targetRideId
                    ? {
                        ...r,
                        status: "seeking_driver",
                        assignedDriverId: undefined,
                        assignedDriverName: undefined,
                        assignedDriverPhone: undefined,
                        assignedVehicleId: undefined,
                        assignedVehiclePlate: undefined,
                        notes: data.interruptionReason || r.notes,
                      }
                    : r
                )
              );
            }
          }
        }
      } catch {
        // Silencio en polling de red
      }
    };

    void syncRtdbStatus();
    const timer = setInterval(syncRtdbStatus, 2500);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [
    activeRequest?.id,
    activeRequest?.tripId,
    (activeRequest as any)?.scheduledTripId,
  ]);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (req.folio || "").toLowerCase().includes(q) ||
        (req.companyName || "").toLowerCase().includes(q) ||
        (req.origin?.address || "").toLowerCase().includes(q) ||
        (req.destination?.address || "").toLowerCase().includes(q) ||
        (req.assignedDriverName || "").toLowerCase().includes(q);

      const matchesCompany =
        companyFilter === "all" || req.companyId === companyFilter;
      const matchesStatus =
        statusFilter === "all" || req.status === statusFilter;

      return matchesSearch && matchesCompany && matchesStatus;
    });
  }, [requests, searchTerm, companyFilter, statusFilter]);

  const compatibleVehicles = useMemo(() => {
    if (!activeRequest) return [];
    return vehicles.filter(
      (v) =>
        v.status === "active" &&
        (v.category === activeRequest.vehicleCategory ||
          v.maxPassengers >= activeRequest.passengersCount)
    );
  }, [vehicles, activeRequest]);

  const handleAssignVehicle = async () => {
    if (!activeRequest || !selectedVehicleId) return;
    const veh = vehicles.find((v) => v.id === selectedVehicleId);
    if (!veh) return;

    // Resolver conductor elegible (CF-57) si el vehículo no tiene driverName persistido
    const eligible = eligibleDrivers.find(
      (e) => e.vehicleId === veh.id || e.plate === veh.plate
    );
    const resolvedDriverId = eligible?.driverId || veh.driverId;
    if (!resolvedDriverId) {
      setFeedback({
        type: "error",
        message: "La unidad seleccionada no cuenta con un conductor elegible asociado.",
      });
      return;
    }
    const resolvedDriverName =
      eligible?.name ||
      veh.driverName ||
      "Conductor Asignado";
    const resolvedDriverPhone =
      eligible?.phone || veh.driverPhone || "";

    setUpdating(true);
    try {
      const schedId = (activeRequest as any)?.scheduledTripId || activeRequest.tripId;
      const targetTripId = activeRequest.tripId || schedId || activeRequest.id;

      // CF-87 Corrección 13: Si el traslado está en `seeking_driver` tras un reporte de problema en ruta,
      // reasignamos vía `reassignTripDriver` (con motivo obligatorio <= 500 caracteres) y vuelve a `in_progress`.
      if (activeRequest.status === "seeking_driver") {
        const reasonPrompt = window.prompt(
          "Ingresa el motivo de reasignación del conductor (obligatorio CF-87, máx. 500 caracteres):",
          activeRequest.notes
            ? `Reemplazo de unidad por: ${activeRequest.notes}`
            : "Reasignación operativa por incidencia reportada en ruta"
        );
        if (!reasonPrompt || !reasonPrompt.trim()) {
          setFeedback({
            type: "error",
            message: "El motivo de reasignación es obligatorio (CF-87).",
          });
          setUpdating(false);
          return;
        }

        await reassignB2BTripDriver(activeRequest.id, {
          tripId: targetTripId,
          driverId: resolvedDriverId,
          driverName: resolvedDriverName,
          driverPhone: resolvedDriverPhone,
          vehicleId: veh.id,
          vehiclePlate: veh.plate,
          reason: reasonPrompt.trim().slice(0, 500),
        });

        setOperationalStatus(activeRequest.id, "inService");
        setOperationalStatus(targetTripId, "inService");
        if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "inService");
        if ((activeRequest as any).scheduledTripId) {
          setOperationalStatus((activeRequest as any).scheduledTripId, "inService");
        }

        setRawRequests((prev) =>
          prev.map((r) =>
            r.id === activeRequest.id || r.id === targetTripId
              ? {
                  ...r,
                  assignedDriverId: resolvedDriverId,
                  assignedDriverName: resolvedDriverName,
                  assignedDriverPhone: resolvedDriverPhone,
                  assignedVehicleId: veh.id,
                  assignedVehiclePlate: veh.plate,
                  status: "inService",
                  notes: reasonPrompt.trim().slice(0, 500),
                }
              : r
          )
        );

        listTripEventsCallable({ tripId: targetTripId, limit: 30 })
          .then((res) => setTripEvents(res.data?.events || []))
          .catch(() => {});

        await fetchScheduledTrips();
        setFeedback({
          type: "success",
          message: `Conductor reasignado (${resolvedDriverName} · ${veh.plate}) vía reassignTripDriver (CF-87). El viaje continúa en curso (in_progress) con su startedAt y techo intactos.`,
        });
        return;
      }

      await assignB2BRequestVehicleAndDriver(activeRequest.id, {
        driverId: resolvedDriverId,
        driverName: resolvedDriverName,
        driverPhone: resolvedDriverPhone,
        vehicleId: veh.id,
        vehiclePlate: veh.plate,
        scheduledTripId: schedId,
        tripId: activeRequest.tripId,
      });
      setOperationalStatus(activeRequest.id, "assigned");
      if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "assigned");
      if ((activeRequest as any).scheduledTripId) setOperationalStatus((activeRequest as any).scheduledTripId, "assigned");

      // Actualizar inmediatamente en estado local para reactividad instantanea
      setRawRequests((prev) =>
        prev.map((r) =>
          r.id === activeRequest.id
            ? {
                ...r,
                assignedDriverId: resolvedDriverId,
                assignedDriverName: resolvedDriverName,
                assignedDriverPhone: resolvedDriverPhone,
                assignedVehicleId: veh.id,
                assignedVehiclePlate: veh.plate,
                status: "assigned",
              }
            : r
        )
      );
      await fetchScheduledTrips();
      setFeedback({
        type: "success",
        message: `Unidad ${veh.plate} (${resolvedDriverName}) asignada al traslado ${activeRequest.folio}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al asignar unidad.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleTransitionStatus = async (nextStatus: B2BRequestStatus) => {
    if (!activeRequest) return;
    setUpdating(true);
    try {
      const targetRideId =
        activeRequest.tripId ||
        (activeRequest as any)?.scheduledTripId ||
        activeRequest.id;

      if (nextStatus === "cancelled") {
        const res = await cancelB2BCompanyReservation(
          activeRequest.id,
          targetRideId
        );
        if (typeof window !== "undefined") {
          await fetch("/api/b2b/trip-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tripId: targetRideId,
              status: "cancelled",
              driverId: activeRequest.assignedDriverId || "ZFpZfYKfuSf0T0c04wqnBNknkiw2",
            }),
          }).catch((e) => console.warn("[Solicitudes] Error cancelando en API RTDB:", e));
        }
        setOperationalStatus(targetRideId, "cancelled");
        setOperationalStatus(activeRequest.id, "cancelled");
        if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "cancelled");
        if ((activeRequest as any).scheduledTripId) setOperationalStatus((activeRequest as any).scheduledTripId, "cancelled");

        setRawRequests((prev) =>
          prev.map((r) =>
            r.id === activeRequest.id || r.id === targetRideId ? { ...r, status: "cancelled" } : r
          )
        );
        await fetchScheduledTrips();
        setFeedback({
          type: "success",
          message: `Reserva corporativa ${activeRequest.folio} cancelada. Saldo liberado del techo: $${Number(
            res.releasedAmount || activeRequest.finalAmount || 0
          ).toFixed(2)} USD.`,
        });
      } else {
        setOperationalStatus(targetRideId, nextStatus);
        setOperationalStatus(activeRequest.id, nextStatus);
        if (activeRequest.tripId) {
          setOperationalStatus(activeRequest.tripId, nextStatus);
        }
        if ((activeRequest as any).scheduledTripId) {
          setOperationalStatus((activeRequest as any).scheduledTripId, nextStatus);
        }

        await updateB2BRequestStatus(activeRequest.id, nextStatus);

        if (nextStatus === "completed" && activeRequest.assignedDriverId) {
          writeTripHistoryCallable({
            tripId: activeRequest.tripId || activeRequest.id,
            rideId: activeRequest.id,
            driverId: activeRequest.assignedDriverId,
            passengerName:
              activeRequest.passengerNames?.[0] ||
              activeRequest.travellerName ||
              "Pasajero Corporativo",
            passengerPhone: activeRequest.passengerPhone || "+503 7000-0000",
            origin: {
              address: activeRequest.origin?.address || "San Salvador",
              latitude: activeRequest.origin?.lat,
              longitude: activeRequest.origin?.lng,
            },
            destination: {
              address: activeRequest.destination?.address || "San Salvador",
              latitude: activeRequest.destination?.lat,
              longitude: activeRequest.destination?.lng,
            },
            distance: activeRequest.estimatedDistanceKm || 15,
            etaMinutes: activeRequest.estimatedDurationMinutes || 25,
            startedAt: Date.now() - 30 * 60 * 1000,
            completedAt: Date.now(),
            paymentMethod: "corporate_credit",
          }).catch((e) =>
            console.warn("[Solicitudes] writeTripHistory error:", e)
          );
        }

        setRawRequests((prev) =>
          prev.map((r) =>
            r.id === activeRequest.id ? { ...r, status: nextStatus } : r
          )
        );
        await fetchScheduledTrips();

        const statusLabel =
          nextStatus === "completed"
            ? "Completado"
            : nextStatus === "driverArrived"
            ? "Conductor en Punto"
            : nextStatus === "inService"
            ? "En Curso (Viajando)"
            : nextStatus === "enRoute"
            ? "En Camino al Origen"
            : nextStatus;

        setFeedback({
          type: "success",
          message: `Estado del servicio ${activeRequest.folio} actualizado a "${statusLabel}".`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al actualizar estado.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDriverUnavailable = async () => {
    if (!activeRequest) return;
    const isStartedOrEnRoute =
      activeRequest.status === "inService" ||
      activeRequest.status === "driverArrived" ||
      activeRequest.status === "arrived" ||
      activeRequest.status === "enRoute";

    const reasonPrompt = window.prompt(
      isStartedOrEnRoute
        ? "Reportar problema en viaje en curso (CF-87 · reportTripProblem). Ingresa el motivo obligatorio (1-500 caracteres):"
        : "Ingresa el motivo de devolución de la reserva al pool (requerido para auditoría CF-86):",
      isStartedOrEnRoute
        ? "Avería mecánica reportada por el conductor; se solicita reasignación de unidad"
        : "Conductor reporta incidente antes de salir; se devuelve al pool"
    );
    if (!reasonPrompt || !reasonPrompt.trim()) {
      setFeedback({
        type: "error",
        message: "El motivo es obligatorio para reportar el problema o devolver al pool (CF-86 / CF-87).",
      });
      return;
    }

    setUpdating(true);
    try {
      const schedId =
        (activeRequest as any)?.scheduledTripId ||
        (!activeRequest.isImmediate ? activeRequest.tripId : undefined);
      const targetTripId =
        activeRequest.tripId || schedId || activeRequest.id;

      if (isStartedOrEnRoute) {
        // CF-87: Viaje en curso se reporta vía reportTripProblem y pasa a seeking_driver sin cancelar ni tocar techo
        await reportB2BTripProblem(
          activeRequest.id,
          targetTripId,
          reasonPrompt.trim().slice(0, 500),
          {
            latitude: driverTelemetry?.lat,
            longitude: driverTelemetry?.lng,
          },
          activeRequest.assignedDriverId
        );
      } else if (schedId) {
        await releaseB2BRequestToPool(activeRequest.id, schedId, reasonPrompt.trim());
      } else {
        await withdrawB2BDriverAvailability(
          activeRequest.id,
          targetTripId,
          activeRequest.assignedDriverId,
          reasonPrompt.trim()
        );
      }

      setOperationalStatus(activeRequest.id, "seeking_driver");
      setOperationalStatus(targetTripId, "seeking_driver");
      if (activeRequest.tripId) setOperationalStatus(activeRequest.tripId, "seeking_driver");
      if ((activeRequest as any).scheduledTripId) {
        setOperationalStatus((activeRequest as any).scheduledTripId, "seeking_driver");
      }

      setRawRequests((prev) =>
        prev.map((r) =>
          r.id === activeRequest.id || r.id === targetTripId
            ? {
                ...r,
                status: "seeking_driver",
                assignedDriverId: undefined,
                assignedDriverName: undefined,
                assignedDriverPhone: undefined,
                assignedVehicleId: undefined,
                assignedVehiclePlate: undefined,
                notes: reasonPrompt.trim().slice(0, 500),
              }
            : r
        )
      );

      listTripEventsCallable({ tripId: targetTripId, limit: 30 })
        .then((res) => setTripEvents(res.data?.events || []))
        .catch(() => {});

      setFeedback({
        type: "success",
        message: isStartedOrEnRoute
          ? `Problema reportado vía reportTripProblem (${activeRequest.folio} → seeking_driver). Selecciona un nuevo conductor arriba para reasignar el viaje en curso sin tocar el techo (CF-87).`
          : `Reserva devuelta al pool de despacho exitosamente (${activeRequest.folio} → seeking_driver). El techo de la empresa permanece intacto.`,
      });
      await fetchScheduledTrips();
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Error al reportar problema del conductor.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveIncident = async (incId: string) => {
    setResolvingIncidentId(incId);
    try {
      await resolveTripIncidentCallable({
        incidentId: incId,
        resolutionCode,
        ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      });
      setFeedback({
        type: "success",
        message: "Incidencia resuelta en el servidor.",
      });
      setResolutionNote("");
      const subjectId =
        activeRequest?.tripId || (activeRequest as any)?.scheduledTripId;
      if (subjectId) {
        const incRes = await listTripIncidentsCallable({
          tripId: subjectId,
          limit: 20,
        });
        setTripIncidents(incRes.data?.incidents || []);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.message || "No se pudo resolver la incidencia.",
      });
    } finally {
      setResolvingIncidentId(null);
    }
  };

  const handleSaveOperationsConfig = async () => {
    setSavingOps(true);
    try {
      await updateOperationsConfigCallable({
        deadTimeMinutes: Number(deadTimeMinutes),
        reminderLeadMinutes: Number(reminderLeadMinutes),
        assignmentWaitMinutes: Number(assignmentWaitMinutes),
        adminPortalUrl: adminPortalUrl.trim(),
        companyPortalUrl: companyPortalUrl.trim(),
        reason: opsReason.trim() || "Actualización operativa de plataforma",
      });
      setFeedback({
        type: "success",
        message:
          "Política operativa global (platformConfig/operations) actualizada correctamente (CF-49).",
      });
      setShowOpsConfig(false);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message:
          err?.message || "No se pudo actualizar platformConfig/operations.",
      });
    } finally {
      setSavingOps(false);
    }
  };

  const getActiveStepIndex = (status: string): number => {
    return getLifecycleStepIndex(status);
  };

  return (
    <PageContainer
      title="Solicitudes y Monitoreo B2B | Lilo El Salvador"
      description="Gestión y seguimiento en tiempo real de solicitudes de traslado corporativo"
    >
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          mb={3}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              Solicitudes y Monitoreo en Tiempo Real (H2.4 / H2.5)
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Seguimiento en vivo de estados (Solicitada → Asignada → En Camino → En Punto → En Curso → Completado)
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => setShowOpsConfig((v) => !v)}
            >
              {showOpsConfig ? "Ocultar Política Operativa" : "Política Operativa (CF-49)"}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<IconPlus size={18} />}
              onClick={() => router.push("/Solicitudes/nueva")}
            >
              Nueva Solicitud de Traslado
            </Button>
          </Stack>
        </Stack>

        {showOpsConfig && (
          <Card variant="outlined" sx={{ mb: 3, p: 2.5, bgcolor: "#f8fafc" }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Configuración Operativa de Plataforma (`platformConfig/operations` · CF-49)
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Tiempo Muerto (deadTimeMinutes)"
                  value={deadTimeMinutes}
                  onChange={(e) => setDeadTimeMinutes(Number(e.target.value))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Anticipación Recordatorio (reminderLeadMinutes)"
                  value={reminderLeadMinutes}
                  onChange={(e) =>
                    setReminderLeadMinutes(Number(e.target.value))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Espera Asignación (assignmentWaitMinutes)"
                  value={assignmentWaitMinutes}
                  onChange={(e) =>
                    setAssignmentWaitMinutes(Number(e.target.value))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL Portal Admin (https)"
                  value={adminPortalUrl}
                  onChange={(e) => setAdminPortalUrl(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL Portal Empresas (https)"
                  value={companyPortalUrl}
                  onChange={(e) => setCompanyPortalUrl(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Motivo del cambio *"
                    value={opsReason}
                    onChange={(e) => setOpsReason(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={savingOps}
                    onClick={handleSaveOperationsConfig}
                  >
                    Guardar
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Card>
        )}

        {feedback && (
          <Alert
            severity={feedback.type}
            sx={{ mb: 3 }}
            onClose={() => setFeedback(null)}
          >
            {feedback.message}
          </Alert>
        )}

        <DashboardCard>
          <Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              mb={3}
              justifyContent="space-between"
            >
              <TextField
                placeholder="Buscar por folio, empresa, origen, destino o conductor..."
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ minWidth: { xs: "100%", md: 360 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <IconSearch size={18} />
                    </InputAdornment>
                  ),
                }}
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  select
                  label="Empresa"
                  size="small"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="all">Todas las Empresas</MenuItem>
                  {companies.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.tradeName || c.legalName}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Estado"
                  size="small"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="all">Todos los estados</MenuItem>
                  <MenuItem value="requested">Solicitada</MenuItem>
                  <MenuItem value="seeking_driver">Buscando Conductor</MenuItem>
                  <MenuItem value="assigned">Conductor Asignado</MenuItem>
                  <MenuItem value="enRoute">En Camino al Origen</MenuItem>
                  <MenuItem value="driverArrived">Conductor en Punto</MenuItem>
                  <MenuItem value="inService">En Curso</MenuItem>
                  <MenuItem value="completed">Completado</MenuItem>
                  <MenuItem value="cancelled">Cancelado</MenuItem>
                </TextField>
              </Stack>
            </Stack>

            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress />
              </Box>
            ) : filteredRequests.length === 0 ? (
              <Box textAlign="center" py={6}>
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No hay solicitudes de traslado registradas
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<IconPlus size={18} />}
                  onClick={() => router.push("/Solicitudes/nueva")}
                  sx={{ mt: 1 }}
                >
                  Crear Primera Solicitud B2B
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0}>
                <Table sx={{ minWidth: 920 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Folio / Modalidad</TableCell>
                      <TableCell>Empresa / Centro de Costo</TableCell>
                      <TableCell>Ruta & Paradas</TableCell>
                      <TableCell>Vehículo & Pasajeros</TableCell>
                      <TableCell>Conductor Asignado</TableCell>
                      <TableCell align="right">Tarifa USD</TableCell>
                      <TableCell align="center">Estado en Vivo</TableCell>
                      <TableCell align="right">Monitoreo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRequests.map((req) => (
                      <TableRow key={req.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {req.folio}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {req.isImmediate ? "Inmediato" : "Programado"} ·{" "}
                            {req.roundTrip ? "Ida y Vuelta" : "Solo Ida"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {req.companyName}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {req.costCenterName || "General"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ maxWidth: 240 }}
                          >
                            <strong>Origen:</strong> {req.origin?.address}
                          </Typography>
                          {req.stops && req.stops.length > 0 && (
                            <Typography
                              variant="caption"
                              color="primary.main"
                              display="block"
                            >
                              + {req.stops.length} parada(s) intermedia(s)
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            color="textSecondary"
                            noWrap
                            sx={{ maxWidth: 240, display: "block" }}
                          >
                            <strong>Destino:</strong> {req.destination?.address}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              req.vehicleCategory === "microbus"
                                ? "warning"
                                : req.vehicleCategory === "pickup"
                                ? "secondary"
                                : "primary"
                            }
                            label={`${(
                              req.vehicleCategory || "suv"
                            ).toUpperCase()} · ${req.passengersCount} pax`}
                            sx={{ fontWeight: 600 }}
                          />
                          {req.hasCargo && (
                            <Typography
                              variant="caption"
                              color="warning.main"
                              display="block"
                              fontWeight={600}
                            >
                              Con Carga / Equipaje
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          {req.assignedDriverName ? (
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {req.assignedDriverName}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {req.assignedVehiclePlate} ·{" "}
                                {req.assignedDriverPhone}
                              </Typography>
                            </Box>
                          ) : (
                            <Chip
                              size="small"
                              label="Sin asignar"
                              color="warning"
                              variant="outlined"
                            />
                          )}
                        </TableCell>

                        <TableCell align="right">
                          <Typography variant="subtitle2" fontWeight={700}>
                            $
                            {Number(
                              req.finalAmount ??
                                req.tariffApplied?.calculatedAmount ??
                                0
                            ).toFixed(2)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {req.estimatedDistanceKm} km
                          </Typography>
                        </TableCell>

                        <TableCell align="center">
                          <StatusBadge status={req.status} type="request" />
                        </TableCell>

                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setSelectedRequestId(req.id)}
                          >
                            Monitorear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DashboardCard>
      </Box>

      {/* Drawer de Monitoreo en Tiempo Real y Despacho (H2.5-FE) */}
      <Drawer
        anchor="right"
        open={Boolean(activeRequest)}
        onClose={() => setSelectedRequestId(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, p: 3 } }}
      >
        {activeRequest && (
          <Box>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  {activeRequest.folio}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {activeRequest.companyName} · CC:{" "}
                  {activeRequest.costCenterName || "General"}
                </Typography>
              </Box>
              <StatusBadge status={activeRequest.status} type="request" />
            </Stack>

            <Divider sx={{ mb: 2.5 }} />

            {/* Mapa de Monitoreo en Vivo (Google Maps API + RTDB) */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              Monitoreo en Vivo de Ruta y Unidad (Google Maps API)
            </Typography>
            <Box mb={2.5}>
              <GoogleTripTrackingMap
                origin={activeRequest.origin}
                destination={activeRequest.destination}
                stops={activeRequest.stops}
                driverLocation={driverTelemetry}
                driverName={activeRequest.assignedDriverName}
                vehiclePlate={activeRequest.assignedVehiclePlate}
                height={220}
              />
            </Box>

            {/* Stepper de Estado en Tiempo Real */}
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Línea de Tiempo en Vivo (Sincronizada con Realtime Database)
            </Typography>
            <Card variant="outlined" sx={{ mb: 3, bgcolor: "#f8fafc" }}>
              <CardContent>
                <Stepper
                  activeStep={getActiveStepIndex(activeRequest.status)}
                  orientation="vertical"
                >
                  {LIFECYCLE_STEPS.map((step) => (
                    <Step key={step.status}>
                      <StepLabel>{step.label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>

            {/* Asignación / Reasignación de Conductor + Unidad */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              {activeRequest.status === "seeking_driver"
                ? `Reasignar Conductor a Viaje Reportado (CF-87 · ${activeRequest.vehicleCategory.toUpperCase()})`
                : `Despacho: Asignar Unidad y Conductor (${activeRequest.vehicleCategory.toUpperCase()})`}
            </Typography>
            {activeRequest.status === "seeking_driver" && activeRequest.notes && (
              <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>
                  Motivo del reporte: {activeRequest.notes}
                </Typography>
              </Alert>
            )}
            <Stack direction="row" spacing={1.5} mb={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Unidad Compatible Disponible"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <MenuItem value="">-- Seleccionar unidad --</MenuItem>
                {compatibleVehicles.map((v) => {
                  const eligible = eligibleDrivers.find(
                    (e) => e.vehicleId === v.id || e.plate === v.plate
                  );
                  const driverLabel = eligible?.name
                    ? `${eligible.name} (${eligible.online ? "En línea" : "Desconectado"})`
                    : v.driverName
                      ? `${v.driverName}`
                      : eligible?.online
                        ? "En línea"
                        : "Sin conductor";
                  return (
                    <MenuItem key={v.id} value={v.id}>
                      {v.plate} · {v.brand} {v.model} ({v.category.toUpperCase()}) —{" "}
                      {driverLabel}
                    </MenuItem>
                  );
                })}
              </TextField>
              <Button
                variant="contained"
                color={activeRequest.status === "seeking_driver" ? "warning" : "primary"}
                disabled={!selectedVehicleId || updating}
                onClick={handleAssignVehicle}
              >
                {activeRequest.status === "seeking_driver" ? "Reasignar" : "Asignar"}
              </Button>
            </Stack>

            {/* Controles de transición de estado en tiempo real */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              Actualizar Estado Operativo en Tiempo Real
            </Typography>
            <Grid container spacing={1} mb={3}>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<IconPlayerPlay size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("enRoute")}
                >
                  En Camino al Origen
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<IconMapPin size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("driverArrived")}
                >
                  Conductor en Punto
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<IconCar size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("inService")}
                >
                  Iniciar Viaje (En Curso)
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<IconCheck size={15} />}
                  disabled={updating}
                  onClick={() => handleTransitionStatus("completed")}
                >
                  Marcar Completado
                </Button>
              </Grid>
              <Grid
                size={{
                  xs:
                    activeRequest.status === "inService" ||
                    activeRequest.status === "arrived" ||
                    activeRequest.status === "driverArrived" ||
                    activeRequest.status === "completed" ||
                    activeRequest.status === "cancelled"
                      ? 12
                      : 6,
                }}
              >
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={
                    updating ||
                    activeRequest.status === "completed" ||
                    activeRequest.status === "cancelled" ||
                    activeRequest.status === "seeking_driver"
                  }
                  onClick={handleDriverUnavailable}
                >
                  {activeRequest.status === "inService" ||
                  activeRequest.status === "driverArrived" ||
                  activeRequest.status === "arrived"
                    ? "Reportar Problema en Ruta (reportTripProblem)"
                    : "Baja Conductor (`seeking_driver`)"}
                </Button>
              </Grid>
              {/* CF-87 Corrección 13: Quitar cualquier botón que cancele un viaje in_progress o arrived */}
              {activeRequest.status !== "inService" &&
                activeRequest.status !== "arrived" &&
                activeRequest.status !== "driverArrived" &&
                activeRequest.status !== "completed" &&
                activeRequest.status !== "cancelled" && (
                  <Grid size={{ xs: 6 }}>
                    <Button
                      fullWidth
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<IconX size={15} />}
                      disabled={updating}
                      onClick={() => handleTransitionStatus("cancelled")}
                    >
                      Cancelar Reserva (Liberar Techo)
                    </Button>
                  </Grid>
                )}
            </Grid>

            <Divider sx={{ mb: 2 }} />

            {/* Detalles de Ruta, Paradas, Pasajeros y Tarifa */}
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  ORIGEN
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {activeRequest.origin?.address}
                </Typography>
              </Box>

              {activeRequest.stops && activeRequest.stops.length > 0 && (
                <Box>
                  <Typography variant="caption" color="primary.main" fontWeight={700}>
                    PARADAS INTERMEDIAS ({activeRequest.stops.length})
                  </Typography>
                  {activeRequest.stops.map((st, idx) => (
                    <Typography key={idx} variant="body2">
                      {idx + 1}. {st.address}
                    </Typography>
                  ))}
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="textSecondary">
                  DESTINO ({activeRequest.roundTrip ? "IDA Y VUELTA" : "SOLO IDA"})
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {activeRequest.destination?.address}
                </Typography>
              </Box>

              <Stack direction="row" spacing={2}>
                <Box flex={1}>
                  <Typography variant="caption" color="textSecondary">
                    PASAJEROS ({activeRequest.passengersCount})
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {(activeRequest.passengerNames || []).join(", ") ||
                      activeRequest.requestedByName}
                  </Typography>
                </Box>
                <Box flex={1}>
                  <Typography variant="caption" color="textSecondary">
                    CARGA / EQUIPAJE
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {activeRequest.hasCargo
                      ? activeRequest.cargoDescription || "Sí incluye carga"
                      : "Sin carga especial"}
                  </Typography>
                </Box>
              </Stack>

              <Alert severity="success" sx={{ mt: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Tarifa Oficial Aplicada: $
                  {Number(
                    activeRequest.finalAmount ??
                      activeRequest.tariffApplied?.calculatedAmount ??
                      0
                  ).toFixed(2)}{" "}
                  USD
                </Typography>
                <Typography variant="caption">
                  Distancia facturable: {activeRequest.estimatedDistanceKm} km ·
                  Tarifa/km: $
                  {Number(activeRequest.tariffApplied?.ratePerKm || 0.67).toFixed(
                    2
                  )}{" "}
                  · Mínimo: $
                  {Number(activeRequest.tariffApplied?.minFare || 13.56).toFixed(
                    2
                  )}
                </Typography>
              </Alert>

              {eligibleDrivers.length > 0 && (
                <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#f8fafc" }}>
                  <Typography variant="caption" fontWeight={700} color="primary">
                    CANDIDATOS ELEGIBLES VALIDADOS POR BACKEND (CF-57 · {eligibleDrivers.length})
                  </Typography>
                  <Stack spacing={0.5} mt={0.5}>
                    {eligibleDrivers.map((ed) => (
                      <Typography key={ed.vehicleId} variant="caption">
                        • <strong>{ed.name}</strong> ({ed.plate} · {ed.brand}{" "}
                        {ed.model}) — {ed.online ? "En línea" : "Desconectado"}
                      </Typography>
                    ))}
                  </Stack>
                </Card>
              )}

              {/* Incidencias (CF-63 / CF-64) y Bitácora de Eventos (CF-61) */}
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={700}>
                Incidencias del Traslado ({tripIncidents.length}) y Bitácora (CF-61 / CF-64)
              </Typography>

              {tripIncidents.length > 0 && (
                <Stack spacing={1}>
                  {tripIncidents.map((inc) => (
                    <Card
                      key={inc.incidentId}
                      variant="outlined"
                      sx={{ p: 1.5, bgcolor: "#fff8f6" }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography variant="caption" fontWeight={700}>
                          {inc.type.toUpperCase()} · Severidad: {inc.severity}
                        </Typography>
                        <Chip size="small" label={inc.status} color="warning" />
                      </Stack>
                      <Typography variant="body2" sx={{ my: 0.5 }}>
                        {inc.description}
                      </Typography>
                      {inc.status === "open" || inc.status === "under_review" ? (
                        <Stack spacing={1} mt={1}>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              select
                              size="small"
                              label="Resolución (CF-64)"
                              value={resolutionCode}
                              onChange={(e) =>
                                setResolutionCode(e.target.value as any)
                              }
                              sx={{ minWidth: 160 }}
                            >
                              <MenuItem value="no_action">Sin acción (Descartar)</MenuItem>
                              <MenuItem value="driver_warning">Advertencia conductor</MenuItem>
                              <MenuItem value="company_credit">Crédito empresa</MenuItem>
                              <MenuItem value="trip_cancelled">Viaje cancelado</MenuItem>
                              <MenuItem value="trip_refunded">Viaje reembolsado</MenuItem>
                              <MenuItem value="other">Otro</MenuItem>
                            </TextField>
                            <TextField
                              size="small"
                              fullWidth
                              label="Nota de resolución"
                              value={resolutionNote}
                              onChange={(e) => setResolutionNote(e.target.value)}
                            />
                            <Button
                              size="small"
                              variant="contained"
                              disabled={resolvingIncidentId === inc.incidentId}
                              onClick={() =>
                                handleResolveIncident(inc.incidentId)
                              }
                            >
                              Resolver
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="success.main">
                          Resuelta ({inc.resolutionCode}): {inc.resolutionNote}
                        </Typography>
                      )}
                    </Card>
                  ))}
                </Stack>
              )}

              {tripEvents.length > 0 && (
                <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#f8fafc" }}>
                  <Typography variant="caption" fontWeight={700} color="textSecondary">
                    BITÁCORA DE AUDITORÍA DEL SERVIDOR (CF-61 · {tripEvents.length})
                  </Typography>
                  <Stack spacing={0.5} mt={0.5}>
                    {tripEvents.map((ev) => (
                      <Typography key={ev.eventId} variant="caption">
                        • <strong>{ev.eventType}</strong>:{" "}
                        {ev.fromStatus ? `${ev.fromStatus} → ` : ""}
                        {ev.toStatus || ""} ({ev.actorType || "system"})
                      </Typography>
                    ))}
                  </Stack>
                </Card>
              )}
            </Stack>
          </Box>
        )}
      </Drawer>
    </PageContainer>
  );
};

export default B2BSolicitudesPage;
