import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

const RTDB_URL =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  "https://lilo-23fef-default-rtdb.firebaseio.com";

function getFirebaseToolsToken(): string {
  try {
    const configPath = path.join(
      os.homedir(),
      ".config/configstore/firebase-tools.json"
    );
    if (!fs.existsSync(configPath)) {
      throw new Error("firebase-tools.json not found");
    }
    let data = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (Date.now() >= Number(data?.tokens?.expires_at || 0) - 120000) {
      try {
        execSync("firebase projects:list >/dev/null 2>&1", { timeout: 8000 });
        data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {}
    }
    const token = data?.tokens?.access_token;
    if (!token) {
      throw new Error("access_token not found in firebase-tools.json");
    }
    return token;
  } catch (err: any) {
    console.error("[trip-status API] Error getting token:", err?.message || err);
    throw err;
  }
}

function mapRtdbToB2BStatus(rawStatus: string | null | undefined): string | null {
  if (!rawStatus) return null;
  if (rawStatus === "driver_arrived" || rawStatus === "driverArrived") return "driverArrived";
  if (rawStatus === "in_progress" || rawStatus === "inService") return "inService";
  if (
    rawStatus === "seeking_driver" ||
    rawStatus === "available" ||
    rawStatus === "pending_driver" ||
    rawStatus === "offered" ||
    rawStatus === "driver_rejected"
  ) {
    return "seeking_driver";
  }
  if (rawStatus === "completed") return "completed";
  if (rawStatus === "cancelled") return "cancelled";
  if (rawStatus === "accepted" || rawStatus === "enRoute" || rawStatus === "dispatched") return "enRoute";
  if (rawStatus === "assigned" || rawStatus === "driver_assigned") return "assigned";
  if (rawStatus === "confirmed") return "confirmed";
  if (rawStatus === "requested") return "requested";
  return rawStatus;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    const all = searchParams.get("all");

    const token = getFirebaseToolsToken();

    // Modo batch en tiempo real (`?all=1`): sincroniza todos los viajes activos en RTDB + Firestore (scheduledTrips / trips) + vehículos + conductores
    if (all === "1" || !tripId) {
      const ridesUrl = `${RTDB_URL}/rideRequests.json?access_token=${encodeURIComponent(token)}`;
      const driversUrl = `${RTDB_URL}/conductores_activos.json?access_token=${encodeURIComponent(token)}`;
      const vehsUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/vehicles?pageSize=100`;
      const fsDriversUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/drivers?pageSize=100`;
      const fsUsersUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/users?pageSize=100`;
      const fsSchedListUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/scheduledTrips?pageSize=100`;
      const fsTripsListUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/trips?pageSize=100`;
      const fsLocksListUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/driverReservationLocks?pageSize=100`;

      const [
        ridesRes,
        driversRes,
        vehsRes,
        fsDriversRes,
        fsUsersRes,
        fsSchedListRes,
        fsTripsListRes,
        fsLocksListRes,
      ] = await Promise.all([
        fetch(ridesUrl).catch(() => null),
        fetch(driversUrl).catch(() => null),
        fetch(vehsUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(fsDriversUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(fsUsersUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(fsSchedListUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(fsTripsListUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(fsLocksListUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);

      const rawRides: Record<string, any> =
        ridesRes && ridesRes.ok ? (await ridesRes.json()) || {} : {};
      const rawDrivers =
        driversRes && driversRes.ok ? (await driversRes.json()) || {} : {};
      const fsDriversMap: Record<string, { name: string; phone: string }> = {};

      if (fsUsersRes && fsUsersRes.ok) {
        const usrDocs = await fsUsersRes.json();
        for (const docItem of usrDocs.documents || []) {
          const id = docItem.name.split("/").pop();
          const f = docItem.fields || {};
          const firstName = f.firstName?.stringValue || "";
          const lastName = f.lastName?.stringValue || "";
          const fullName =
            f.displayName?.stringValue ||
            f.fullName?.stringValue ||
            f.name?.stringValue ||
            `${firstName} ${lastName}`.trim() ||
            "";
          const phone =
            f.phone?.stringValue || f.phoneNumber?.stringValue || "";
          if (id && (fullName || phone)) {
            fsDriversMap[id] = {
              name: fullName || "Conductor Asignado",
              phone,
            };
          }
        }
      }

      if (fsDriversRes && fsDriversRes.ok) {
        const drvDocs = await fsDriversRes.json();
        for (const docItem of drvDocs.documents || []) {
          const id = docItem.name.split("/").pop();
          const f = docItem.fields || {};
          const firstName = f.firstName?.stringValue || "";
          const lastName = f.lastName?.stringValue || "";
          const fullName =
            f.fullName?.stringValue ||
            f.displayName?.stringValue ||
            f.name?.stringValue ||
            `${firstName} ${lastName}`.trim() ||
            "";
          const phone =
            f.phone?.stringValue || f.phoneNumber?.stringValue || "";
          const existing = fsDriversMap[id];
          fsDriversMap[id] = {
            name:
              fullName ||
              existing?.name ||
              "Conductor Asignado",
            phone: phone || existing?.phone || "",
          };
        }
      }

      const vehiclesMap: Record<string, any> = {};

      if (vehsRes && vehsRes.ok) {
        const vehsDoc = await vehsRes.json();
        for (const docItem of vehsDoc.documents || []) {
          const id = docItem.name.split("/").pop();
          const f = docItem.fields || {};
          const drvId = f.driverId?.stringValue || "";
          const drvProfile = drvId ? fsDriversMap[drvId] : undefined;
          vehiclesMap[id] = {
            id,
            plate: f.plate?.stringValue || f.licensePlate?.stringValue || "",
            brand: f.brand?.stringValue || "",
            model: f.model?.stringValue || "",
            category: f.category?.stringValue || "suv",
            driverId: drvId,
            driverName:
              f.driverName?.stringValue || drvProfile?.name || "",
            driverPhone:
              f.driverPhone?.stringValue || drvProfile?.phone || "",
          };
        }
      }

      const rtdbPatches: Promise<any>[] = [];
      const activeReservationIds = new Set<string>();

      // Reconciliar reservas programadas (`scheduledTrips`) aceptadas, liberadas o despachadas desde `app_Driver`
      if (fsSchedListRes && fsSchedListRes.ok) {
        const schedDocs = await fsSchedListRes.json();
        for (const docItem of schedDocs.documents || []) {
          const id = docItem.name.split("/").pop();
          if (!id) continue;
          const sf = docItem.fields || {};
          const schedStatus = sf.status?.stringValue || "";
          const schedUpdateMs = docItem.updateTime
            ? Date.parse(docItem.updateTime)
            : 0;
          const schedDriverId = sf.driverId?.stringValue || "";
          const schedVehicleId =
            sf.acceptedVehicleId?.stringValue ||
            sf.vehicleId?.stringValue ||
            "";
          const veh =
            (schedVehicleId && vehiclesMap[schedVehicleId]) ||
            (schedDriverId
              ? Object.values(vehiclesMap).find(
                  (v: any) => v.driverId === schedDriverId
                )
              : undefined);
          const drvProfile = schedDriverId ? fsDriversMap[schedDriverId] : undefined;
          const resolvedDriverName =
            sf.driverName?.stringValue ||
            drvProfile?.name ||
            veh?.driverName ||
            (schedDriverId ? "Conductor Asignado" : "");
          const resolvedDriverPhone =
            sf.driverPhone?.stringValue ||
            drvProfile?.phone ||
            veh?.driverPhone ||
            "";
          const resolvedVehiclePlate =
            sf.vehiclePlate?.stringValue || veh?.plate || "";

          const rVal = rawRides[id];
          const rtdbStatus = rVal?.status || null;
          const rtdbUpdateMs = Number(rVal?.updatedAt || 0);
          const createdAtIso =
            sf.createdAt?.stringValue ||
            sf.createdAt?.timestampValue ||
            docItem.createTime ||
            "";
          const createdAtMs = createdAtIso ? Date.parse(createdAtIso) : 0;
          const qFields = sf.quote?.mapValue?.fields || {};
          const chargedDistance = Number(
            qFields.chargedDistance?.doubleValue ??
              qFields.chargedDistance?.integerValue ??
              0
          );
          const totalAmount = Number(
            qFields.totalAmount?.doubleValue ??
              qFields.totalAmount?.integerValue ??
              qFields.farePrice?.doubleValue ??
              0
          );
          const driverEarningVal = Number(
            qFields.driverEarning?.doubleValue ??
              qFields.driverEarning?.integerValue ??
              (totalAmount > 0 ? Number((totalAmount * 0.7).toFixed(2)) : 0)
          );
          const scheduledPickupAt = sf.scheduledPickupAt?.stringValue || "";
          const categoryId = sf.categoryId?.stringValue || "suv";
          const passengerCount = Number(
            sf.passengerCount?.integerValue ??
              sf.passengerCount?.doubleValue ??
              1
          );
          const originAddress = sf.originAddress?.stringValue || "";
          const destinationAddress = sf.destinationAddress?.stringValue || "";
          const rideTimeMinutes = Number(
            sf.rideTimeMinutes?.integerValue ??
              sf.rideTimeMinutes?.doubleValue ??
              30
          );
          const offeredDriverId = sf.offeredDriverId?.stringValue || undefined;
          const offeredVehicleId = sf.offeredVehicleId?.stringValue || undefined;

          if (rVal) {
            if (createdAtMs > 0) rVal.createdAt = createdAtMs;
            if (chargedDistance > 0) rVal.chargedDistance = chargedDistance;
            rVal.schedStatus = schedStatus;
            if (scheduledPickupAt) rVal.scheduledPickupAt = scheduledPickupAt;
            if (categoryId) rVal.categoryId = categoryId;
            if (passengerCount > 0) rVal.passengerCount = passengerCount;
            if (originAddress) rVal.originAddress = originAddress;
            if (destinationAddress) rVal.destinationAddress = destinationAddress;
            if (totalAmount > 0) rVal.totalAmount = totalAmount;
            if (driverEarningVal > 0) rVal.driverEarning = driverEarningVal;
            if (rideTimeMinutes > 0) rVal.rideTimeMinutes = rideTimeMinutes;
            if (offeredDriverId) rVal.offeredDriverId = offeredDriverId;
            if (offeredVehicleId) rVal.offeredVehicleId = offeredVehicleId;
          } else {
            rawRides[id] = {
              id,
              tripId: id,
              scheduledTripId: id,
              status:
                schedStatus === "available" || schedStatus === "pending_driver"
                  ? "requested"
                  : schedStatus,
              schedStatus,
              companyId: sf.companyId?.stringValue || undefined,
              createdAt: createdAtMs || undefined,
              chargedDistance: chargedDistance || undefined,
              scheduledPickupAt: scheduledPickupAt || undefined,
              categoryId,
              passengerCount,
              originAddress: originAddress || undefined,
              destinationAddress: destinationAddress || undefined,
              totalAmount: totalAmount || undefined,
              driverEarning: driverEarningVal || undefined,
              rideTimeMinutes,
              offeredDriverId,
              offeredVehicleId,
              updatedAt: schedUpdateMs || createdAtMs || undefined,
            };
          }

          if (
            (schedStatus === "driver_assigned" ||
              schedStatus === "assigned" ||
              schedStatus === "dispatched") &&
            rtdbStatus !== "completed" &&
            rtdbStatus !== "cancelled" &&
            rtdbStatus !== "seeking_driver"
          ) {
            activeReservationIds.add(id);
          }

          // Caso 1: Conductor aceptó la reserva en app_Driver (`driver_assigned` / `assigned`)
          if (schedStatus === "driver_assigned" || schedStatus === "assigned") {
            const rtdbIsPreAssigned =
              !rVal ||
              rtdbStatus === "requested" ||
              rtdbStatus === "confirmed" ||
              rtdbStatus === "seeking_driver" ||
              rtdbStatus === "available" ||
              rtdbStatus === "pending_driver" ||
              rtdbStatus === "offered";
            const rtdbIsActiveOrTerminal =
              rtdbStatus === "accepted" ||
              rtdbStatus === "enRoute" ||
              rtdbStatus === "driver_arrived" ||
              rtdbStatus === "in_progress" ||
              rtdbStatus === "completed" ||
              rtdbStatus === "cancelled";

            const needsAssignSync =
              rtdbIsPreAssigned ||
              (!rtdbIsActiveOrTerminal && schedUpdateMs > rtdbUpdateMs + 500) ||
              (rtdbStatus === "assigned" &&
                ((schedVehicleId && rVal?.vehicleId !== schedVehicleId) ||
                  (schedDriverId && rVal?.driverId !== schedDriverId) ||
                  (resolvedDriverName &&
                    resolvedDriverName !== "Conductor Asignado" &&
                    rVal?.driverName !== resolvedDriverName)));

            if (needsAssignSync) {
              const syncTime = Math.max(schedUpdateMs, Date.now());
              const patchData: Record<string, any> = {
                id,
                tripId: id,
                scheduledTripId: id,
                status: "assigned",
                driverId: schedDriverId || veh?.driverId || null,
                driverName: resolvedDriverName || null,
                driverPhone: resolvedDriverPhone || null,
                vehicleId: schedVehicleId || veh?.id || null,
                vehiclePlate: resolvedVehiclePlate || null,
                companyId:
                  sf.companyId?.stringValue || rVal?.companyId || undefined,
                updatedAt: syncTime,
              };
              rawRides[id] = {
                ...(rVal || {}),
                ...patchData,
              };
              const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
              rtdbPatches.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchData),
                }).catch(() => {})
              );
            }
          }
          // Caso 2: Conductor devolvió o rechazó la reserva (`available` / `pending_driver` / `driver_rejected`)
          else if (
            schedStatus === "available" ||
            schedStatus === "pending_driver" ||
            schedStatus === "seeking_driver" ||
            schedStatus === "driver_rejected"
          ) {
            if (
              rVal &&
              (rtdbStatus === "assigned" ||
                rtdbStatus === "driver_assigned" ||
                rtdbStatus === "offered") &&
              schedUpdateMs > rtdbUpdateMs
            ) {
              const syncTime = Math.max(schedUpdateMs, Date.now());
              const patchData = {
                status: "seeking_driver",
                driverId: null,
                driverName: null,
                driverPhone: null,
                vehicleId: null,
                vehiclePlate: null,
                updatedAt: syncTime,
              };
              rawRides[id] = {
                ...rVal,
                ...patchData,
              };
              const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
              rtdbPatches.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchData),
                }).catch(() => {})
              );
            }
          }
          // Caso 3: Reserva despachada o finalizada en scheduledTrips
          else if (schedStatus === "dispatched") {
            if (
              rVal &&
              (rtdbStatus === "requested" ||
                rtdbStatus === "confirmed" ||
                rtdbStatus === "assigned" ||
                rtdbStatus === "driver_assigned") &&
              schedUpdateMs > rtdbUpdateMs
            ) {
              const syncTime = Math.max(schedUpdateMs, Date.now());
              const patchData = {
                status: "accepted",
                driverId: schedDriverId || rVal.driverId || null,
                driverName: resolvedDriverName || rVal.driverName || null,
                driverPhone: resolvedDriverPhone || rVal.driverPhone || null,
                vehicleId: schedVehicleId || rVal.vehicleId || null,
                vehiclePlate: resolvedVehiclePlate || rVal.vehiclePlate || null,
                updatedAt: syncTime,
              };
              rawRides[id] = {
                ...rVal,
                ...patchData,
              };
              const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
              rtdbPatches.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchData),
                }).catch(() => {})
              );
            }
          } else if (
            schedStatus === "completed" ||
            schedStatus === "cancelled"
          ) {
            if (rVal && rtdbStatus !== schedStatus && schedUpdateMs > rtdbUpdateMs) {
              const syncTime = Math.max(schedUpdateMs, Date.now());
              const patchData = {
                status: schedStatus,
                updatedAt: syncTime,
              };
              rawRides[id] = {
                ...rVal,
                ...patchData,
              };
              const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
              rtdbPatches.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchData),
                }).catch(() => {})
              );
            }
          }
        }
      }

      // Reconciliar viajes activos (`trips`) en Firestore (e.g. reportTripProblem -> seeking_driver, startTrip -> in_progress, completeRide -> completed)
      if (fsTripsListRes && fsTripsListRes.ok) {
        const tripDocs = await fsTripsListRes.json();
        for (const docItem of tripDocs.documents || []) {
          const id = docItem.name.split("/").pop();
          if (!id) continue;
          const tf = docItem.fields || {};
          const fsStatus = tf.status?.stringValue || "";
          const tripUpdateMs = docItem.updateTime
            ? Date.parse(docItem.updateTime)
            : 0;
          const rVal = rawRides[id];
          if (!rVal) continue;
          const rtdbStatus = rVal.status || "";
          const rtdbUpdateMs = Number(rVal.updatedAt || 0);

          if (
            fsStatus === "seeking_driver" &&
            rtdbStatus !== "seeking_driver" &&
            tripUpdateMs > rtdbUpdateMs
          ) {
            const fsReason =
              tf.interruptionReason?.stringValue ||
              "Problema reportado en ruta";
            const fsPrevDriver =
              tf.interruption?.mapValue?.fields?.previousDriverId
                ?.stringValue ||
              rVal.driverId ||
              null;
            const syncTime = Math.max(tripUpdateMs, Date.now());
            const patchData = {
              status: "seeking_driver",
              driverId: null,
              driverName: null,
              driverPhone: null,
              vehicleId: null,
              vehiclePlate: null,
              interruptionReason: fsReason,
              previousDriverId: fsPrevDriver,
              updatedAt: syncTime,
            };
            rawRides[id] = {
              ...rVal,
              ...patchData,
            };
            const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
            rtdbPatches.push(
              fetch(patchUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchData),
              }).catch(() => {})
            );
          } else if (
            (fsStatus === "in_progress" ||
              fsStatus === "completed" ||
              fsStatus === "cancelled") &&
            rtdbStatus !== fsStatus &&
            tripUpdateMs > rtdbUpdateMs
          ) {
            const syncTime = Math.max(tripUpdateMs, Date.now());
            const patchData: Record<string, any> = {
              status: fsStatus,
              updatedAt: syncTime,
            };
            if (
              fsStatus === "in_progress" &&
              (tf.startedAt?.timestampValue || tf.startedAt?.stringValue)
            ) {
              patchData.startedAt =
                tf.startedAt?.timestampValue || tf.startedAt?.stringValue;
            }
            rawRides[id] = {
              ...rVal,
              ...patchData,
            };
            const patchUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(id)}.json?access_token=${encodeURIComponent(token)}`;
            rtdbPatches.push(
              fetch(patchUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchData),
              }).catch(() => {})
            );
          }
        }
      }

      // Limpiar bloqueos obsoletos en `driverReservationLocks` (reservas ya completadas, canceladas o devueltas al pool)
      if (fsLocksListRes && fsLocksListRes.ok) {
        const lockDocs = await fsLocksListRes.json();
        for (const docItem of lockDocs.documents || []) {
          const drvId = docItem.name.split("/").pop();
          if (!drvId) continue;
          const accFields =
            docItem.fields?.acceptedReservations?.mapValue?.fields || {};
          const keptFields: Record<string, any> = {};
          let removedAny = false;
          for (const [resId, resVal] of Object.entries(accFields)) {
            if (activeReservationIds.has(resId)) {
              keptFields[resId] = resVal;
            } else {
              removedAny = true;
            }
          }
          if (removedAny) {
            const lockPatchUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/driverReservationLocks/${encodeURIComponent(drvId)}?updateMask.fieldPaths=acceptedReservations`;
            rtdbPatches.push(
              fetch(lockPatchUrl, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  fields: {
                    acceptedReservations: {
                      mapValue: { fields: keptFields },
                    },
                  },
                }),
              }).catch(() => {})
            );
          }
        }
      }

      if (rtdbPatches.length > 0) {
        await Promise.allSettled(rtdbPatches);
      }

      const rides: Record<string, any> = {};
      for (const [rId, rVal] of Object.entries<any>(rawRides)) {
        if (!rVal || typeof rVal !== "object") continue;
        const veh =
          (rVal.vehicleId && vehiclesMap[rVal.vehicleId]) ||
          Object.values(vehiclesMap).find(
            (v: any) => v.driverId && v.driverId === rVal.driverId
          );
        const drvId = rVal.driverId || veh?.driverId || "";
        const drvProfile = drvId ? fsDriversMap[drvId] : undefined;
        const mappedB2BStatus = mapRtdbToB2BStatus(rVal.status);
        const isUnassignedState =
          rVal.status === "seeking_driver" ||
          rVal.status === "requested" ||
          rVal.status === "available" ||
          rVal.status === "pending_driver";

        rides[rId] = {
          id: rId,
          tripId: rVal.tripId || rId,
          scheduledTripId: rVal.scheduledTripId || rId,
          status: rVal.status || null,
          schedStatus: rVal.schedStatus || undefined,
          mappedB2BStatus,
          driverId: isUnassignedState ? undefined : drvId || undefined,
          driverName: isUnassignedState
            ? undefined
            : (rVal.driverName && rVal.driverName !== "Conductor Asignado"
                ? rVal.driverName
                : drvProfile?.name || veh?.driverName || rVal.driverName) ||
              undefined,
          driverPhone: isUnassignedState
            ? undefined
            : rVal.driverPhone || drvProfile?.phone || veh?.driverPhone || undefined,
          vehicleId: isUnassignedState
            ? undefined
            : rVal.vehicleId || veh?.id || undefined,
          vehiclePlate: isUnassignedState
            ? undefined
            : rVal.vehiclePlate || veh?.plate || undefined,
          interruptionReason: rVal.interruptionReason || undefined,
          startedAt: rVal.startedAt || undefined,
          createdAt: rVal.createdAt || undefined,
          chargedDistance: rVal.chargedDistance || undefined,
          scheduledPickupAt: rVal.scheduledPickupAt || undefined,
          categoryId: rVal.categoryId || undefined,
          passengerCount: rVal.passengerCount || undefined,
          passengerName:
            rVal.passengerName || rVal.customerName || undefined,
          passengerPhone:
            rVal.passengerPhone || rVal.customerPhoneNumber || undefined,
          originAddress:
            rVal.originAddress || rVal.origin?.address || undefined,
          destinationAddress:
            rVal.destinationAddress || rVal.destination?.address || undefined,
          totalAmount:
            rVal.totalAmount || rVal.farePrice || undefined,
          driverEarning: rVal.driverEarning || undefined,
          rideTimeMinutes: rVal.rideTimeMinutes || undefined,
          offeredDriverId: rVal.offeredDriverId || undefined,
          offeredVehicleId: rVal.offeredVehicleId || undefined,
          updatedAt: rVal.updatedAt || undefined,
          companyId: rVal.companyId || undefined,
        };
      }

      return NextResponse.json({
        rides,
        drivers: rawDrivers,
        vehicles: vehiclesMap,
      });
    }

    const url = `${RTDB_URL}/rideRequests/${encodeURIComponent(tripId)}.json?access_token=${encodeURIComponent(token)}`;
    const fsTripUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/trips/${encodeURIComponent(tripId)}`;
    const fsSchedUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/scheduledTrips/${encodeURIComponent(tripId)}`;

    const [res, fsTripRes, fsSchedRes] = await Promise.all([
      fetch(url),
      fetch(fsTripUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      fetch(fsSchedUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
    ]);

    if (!res.ok) {
      return NextResponse.json(
        { error: `RTDB returned ${res.status}` },
        { status: res.status }
      );
    }

    let data = await res.json();
    let status = data?.status || null;
    let interruptionReason: string | null = data?.interruptionReason || null;
    let startedAt: any = data?.startedAt || null;
    const rtdbUpdateMs = Number(data?.updatedAt || 0);

    if (fsSchedRes && fsSchedRes.ok) {
      const fsSchedDoc = await fsSchedRes.json();
      const sf = fsSchedDoc.fields || {};
      const schedStatus = sf.status?.stringValue || null;
      const schedUpdateMs = fsSchedDoc.updateTime
        ? Date.parse(fsSchedDoc.updateTime)
        : 0;
      const schedDriverId = sf.driverId?.stringValue || "";
      const schedVehicleId =
        sf.acceptedVehicleId?.stringValue || sf.vehicleId?.stringValue || "";

      if (!startedAt && sf.startedAt?.stringValue) {
        startedAt = sf.startedAt.stringValue;
      }

      // Resolver perfil real del conductor y vehículo si la reserva fue aceptada en app_Driver
      let resolvedDriverName = sf.driverName?.stringValue || data?.driverName || "";
      let resolvedDriverPhone = sf.driverPhone?.stringValue || data?.driverPhone || "";
      let resolvedVehiclePlate = sf.vehiclePlate?.stringValue || data?.vehiclePlate || "";

      if (
        (schedStatus === "driver_assigned" || schedStatus === "assigned") &&
        (status === "requested" ||
          status === "confirmed" ||
          status === "seeking_driver" ||
          status === "available" ||
          status === "pending_driver" ||
          status === "offered" ||
          !status ||
          (schedUpdateMs > rtdbUpdateMs + 500 &&
            status !== "accepted" &&
            status !== "enRoute" &&
            status !== "driver_arrived" &&
            status !== "in_progress" &&
            status !== "completed" &&
            status !== "cancelled"))
      ) {
        const targetDrvId = schedDriverId || data?.driverId || "";
        const targetVehId = schedVehicleId || data?.vehicleId || "";

        const [usrDocRes, vehDocRes] = await Promise.all([
          targetDrvId
            ? fetch(
                `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/users/${encodeURIComponent(targetDrvId)}`,
                { headers: { Authorization: `Bearer ${token}` } }
              ).catch(() => null)
            : Promise.resolve(null),
          targetVehId
            ? fetch(
                `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/vehicles/${encodeURIComponent(targetVehId)}`,
                { headers: { Authorization: `Bearer ${token}` } }
              ).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (usrDocRes && usrDocRes.ok) {
          const usrDoc = await usrDocRes.json();
          const uf = usrDoc.fields || {};
          const fn = uf.firstName?.stringValue || "";
          const ln = uf.lastName?.stringValue || "";
          resolvedDriverName =
            uf.displayName?.stringValue ||
            uf.fullName?.stringValue ||
            `${fn} ${ln}`.trim() ||
            resolvedDriverName ||
            "Conductor Asignado";
          resolvedDriverPhone =
            uf.phone?.stringValue ||
            uf.phoneNumber?.stringValue ||
            resolvedDriverPhone;
        }
        if (vehDocRes && vehDocRes.ok) {
          const vehDoc = await vehDocRes.json();
          const vf = vehDoc.fields || {};
          resolvedVehiclePlate =
            vf.plate?.stringValue ||
            vf.licensePlate?.stringValue ||
            resolvedVehiclePlate;
        }

        status = "assigned";
        const syncTime = Math.max(schedUpdateMs, Date.now());
        const patchPayload = {
          id: tripId,
          tripId,
          scheduledTripId: tripId,
          status: "assigned",
          driverId: targetDrvId || null,
          driverName: resolvedDriverName || null,
          driverPhone: resolvedDriverPhone || null,
          vehicleId: targetVehId || null,
          vehiclePlate: resolvedVehiclePlate || null,
          updatedAt: syncTime,
        };
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
        }).catch(() => {});
        data = {
          ...(data || {}),
          ...patchPayload,
        };
      } else if (
        (schedStatus === "available" ||
          schedStatus === "pending_driver" ||
          schedStatus === "seeking_driver" ||
          schedStatus === "driver_rejected") &&
        (status === "assigned" ||
          status === "driver_assigned" ||
          status === "offered") &&
        schedUpdateMs > rtdbUpdateMs
      ) {
        status = "seeking_driver";
        const syncTime = Math.max(schedUpdateMs, Date.now());
        const patchPayload = {
          status: "seeking_driver",
          driverId: null,
          driverName: null,
          driverPhone: null,
          vehicleId: null,
          vehiclePlate: null,
          updatedAt: syncTime,
        };
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
        }).catch(() => {});
        data = {
          ...(data || {}),
          ...patchPayload,
        };
      } else {
        if (!status && schedStatus) {
          status = schedStatus;
        }
        if (data && typeof data === "object") {
          if (!data.driverId && schedDriverId) data.driverId = schedDriverId;
          if (!data.driverName && resolvedDriverName) data.driverName = resolvedDriverName;
          if (!data.driverPhone && resolvedDriverPhone) data.driverPhone = resolvedDriverPhone;
          if (!data.vehiclePlate && resolvedVehiclePlate) data.vehiclePlate = resolvedVehiclePlate;
          if (!data.vehicleId && schedVehicleId) data.vehicleId = schedVehicleId;
        } else if (schedStatus) {
          data = {
            status: schedStatus,
            driverId: schedDriverId || undefined,
            driverName: resolvedDriverName || undefined,
            driverPhone: resolvedDriverPhone || undefined,
            vehicleId: schedVehicleId || undefined,
            vehiclePlate: resolvedVehiclePlate || undefined,
            startedAt: sf.startedAt?.stringValue || undefined,
          };
        }
      }
    }

    if (fsTripRes && fsTripRes.ok) {
      const fsTripDoc = await fsTripRes.json();
      const f = fsTripDoc.fields || {};
      const fsStatus = f.status?.stringValue || null;
      const fsReason = f.interruptionReason?.stringValue || null;
      const fsPrevDriver =
        f.interruption?.mapValue?.fields?.previousDriverId?.stringValue || null;
      const tripUpdateMs = fsTripDoc.updateTime
        ? Date.parse(fsTripDoc.updateTime)
        : 0;
      if (!startedAt && (f.startedAt?.timestampValue || f.startedAt?.stringValue)) {
        startedAt = f.startedAt?.timestampValue || f.startedAt?.stringValue;
      }

      // CF-87: Si el conductor reportó problema desde app_Driver (reportTripProblem),
      // Firestore trips/{tripId} pasa a seeking_driver; sincronizamos RTDB al instante.
      if (
        fsStatus === "seeking_driver" &&
        status !== "seeking_driver" &&
        tripUpdateMs > rtdbUpdateMs
      ) {
        status = "seeking_driver";
        interruptionReason = fsReason;
        const now = Math.max(tripUpdateMs, Date.now());
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "seeking_driver",
            driverId: null,
            driverName: null,
            driverPhone: null,
            vehicleId: null,
            vehiclePlate: null,
            interruptionReason: fsReason || "Problema reportado en ruta",
            previousDriverId: fsPrevDriver || data?.driverId || null,
            updatedAt: now,
          }),
        }).catch(() => {});

        const prevDriver = fsPrevDriver || data?.driverId;
        if (prevDriver) {
          const driverUrl = `${RTDB_URL}/conductores_activos/${encodeURIComponent(prevDriver)}.json?access_token=${encodeURIComponent(token)}`;
          await fetch(driverUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "disponible",
              currentRideId: null,
              lastStatusUpdate: now,
              updatedAt: now,
            }),
          }).catch(() => {});
        }
        data = {
          ...(data || {}),
          status: "seeking_driver",
          driverId: null,
          driverName: null,
          driverPhone: null,
          vehicleId: null,
          vehiclePlate: null,
          interruptionReason: fsReason,
          previousDriverId: prevDriver,
        };
      }
    }

    let driverTelemetry: any = null;
    const activeDriverId = status === "seeking_driver" ? null : data?.driverId;
    if (activeDriverId) {
      const driverUrl = `${RTDB_URL}/conductores_activos/${encodeURIComponent(activeDriverId)}.json?access_token=${encodeURIComponent(token)}`;
      const drvRes = await fetch(driverUrl).catch(() => null);
      if (drvRes && drvRes.ok) {
        const drvVal = await drvRes.json();
        if (drvVal && typeof drvVal === "object") {
          driverTelemetry = {
            lat: typeof drvVal.lat === "number" ? drvVal.lat : drvVal.latitude,
            lng: typeof drvVal.lng === "number" ? drvVal.lng : drvVal.longitude,
            speed: drvVal.speed,
            heading: drvVal.bearing ?? drvVal.heading,
            status: drvVal.status,
            updatedAt: drvVal.updatedAt || drvVal.timestamp,
          };
        }
      }
    }

    return NextResponse.json({
      exists: Boolean(data || status),
      status,
      mappedB2BStatus: mapRtdbToB2BStatus(status),
      interruptionReason,
      startedAt,
      data,
      driverTelemetry,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tripId,
      status,
      driverId,
      driverName,
      driverPhone,
      vehicleId,
      vehiclePlate,
      notes,
    } = body;

    if (!tripId || !status) {
      return NextResponse.json(
        { error: "tripId and status are required" },
        { status: 400 }
      );
    }

    const token = getFirebaseToolsToken();
    const now = Date.now();

    let rtdbStatus = status;
    const updates: Record<string, any> = {
      updatedAt: now,
    };

    if (notes) {
      updates.operatorNotes = notes;
    }

    let finalDriverId = driverId;
    let finalDriverName = driverName;
    let finalDriverPhone = driverPhone;
    let finalVehiclePlate = vehiclePlate;
    let companyId = body.companyId || "comp_industrias_el_angel";
    let targetVehicleId = vehicleId || "";
    let passengerName = body.passengerName || "Pasajero Corporativo";
    let passengerPhone = body.passengerPhone || "+503 7000-0000";
    let originObj = body.origin || {
      address: "89 Av. Norte y Calle El Mirador, Colonia Escalón, San Salvador",
      latitude: 13.7086,
      longitude: -89.2408,
    };
    let destinationObj = body.destination || {
      address: "Calle Antigua a Huizucar, San Salvador",
      latitude: 13.6810957,
      longitude: -89.222374,
    };
    let farePrice = typeof body.farePrice === "number" ? body.farePrice : 13.4;
    let driverEarning = Number((farePrice * 0.7).toFixed(2));

    // Obtener datos maestros del viaje desde Firestore (scheduledTrips) mediante REST API
    try {
      const fsUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/scheduledTrips/${encodeURIComponent(tripId)}`;
      const fsRes = await fetch(fsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (fsRes.ok) {
        const fsDoc = await fsRes.json();
        const f = fsDoc.fields || {};
        if (!finalDriverId && f.driverId?.stringValue) finalDriverId = f.driverId.stringValue;
        if (!finalDriverName && f.driverName?.stringValue) finalDriverName = f.driverName.stringValue;
        if (!finalDriverPhone && f.driverPhone?.stringValue) finalDriverPhone = f.driverPhone.stringValue;
        if (!finalVehiclePlate && f.vehiclePlate?.stringValue) finalVehiclePlate = f.vehiclePlate.stringValue;
        if (f.companyId?.stringValue) companyId = f.companyId.stringValue;
        if (!targetVehicleId && f.acceptedVehicleId?.stringValue) targetVehicleId = f.acceptedVehicleId.stringValue;
        else if (!targetVehicleId && f.vehicleId?.stringValue) targetVehicleId = f.vehicleId.stringValue;
        if (f.passengerName?.stringValue) passengerName = f.passengerName.stringValue;
        if (f.passengerPhone?.stringValue) passengerPhone = f.passengerPhone.stringValue;

        if (f.originAddress?.stringValue) {
          originObj = {
            address: f.originAddress.stringValue,
            latitude: Number(f.originLatitude?.doubleValue ?? f.originLatitude?.integerValue ?? 13.7086),
            longitude: Number(f.originLongitude?.doubleValue ?? f.originLongitude?.integerValue ?? -89.2408),
          };
        }
        if (f.destinationAddress?.stringValue) {
          destinationObj = {
            address: f.destinationAddress.stringValue,
            latitude: Number(f.destinationLatitude?.doubleValue ?? f.destinationLatitude?.integerValue ?? 13.681),
            longitude: Number(f.destinationLongitude?.doubleValue ?? f.destinationLongitude?.integerValue ?? -89.222),
          };
        }

        const q = f.quote?.mapValue?.fields || {};
        const parsedFare = Number(q.farePrice?.doubleValue ?? q.farePrice?.integerValue ?? 0);
        if (parsedFare > 0) farePrice = parsedFare;
        const parsedEarn = Number(q.driverEarning?.doubleValue ?? q.driverEarning?.integerValue ?? 0);
        if (parsedEarn > 0) driverEarning = parsedEarn;
        else driverEarning = Number((farePrice * 0.7).toFixed(2));

        // Actualizar el estado de Firestore en scheduledTrips mediante REST PATCH
        const fsFields: Record<string, any> = {};
        const updateMaskPaths: string[] = [];

        if (status === "assigned") {
          fsFields.status = { stringValue: "driver_assigned" };
          updateMaskPaths.push("status");
          if (finalDriverId) {
            fsFields.driverId = { stringValue: finalDriverId };
            updateMaskPaths.push("driverId");
          }
          if (finalDriverName) {
            fsFields.driverName = { stringValue: finalDriverName };
            updateMaskPaths.push("driverName");
          }
          if (finalDriverPhone) {
            fsFields.driverPhone = { stringValue: finalDriverPhone };
            updateMaskPaths.push("driverPhone");
          }
          if (targetVehicleId) {
            fsFields.acceptedVehicleId = { stringValue: targetVehicleId };
            updateMaskPaths.push("acceptedVehicleId");
          }
          if (finalVehiclePlate) {
            fsFields.vehiclePlate = { stringValue: finalVehiclePlate };
            updateMaskPaths.push("vehiclePlate");
          }
        } else if (status === "inService") {
          fsFields.status = { stringValue: "dispatched" };
          fsFields.dispatchedTripId = { stringValue: tripId };
          if (finalDriverId) {
            fsFields.driverId = { stringValue: finalDriverId };
            updateMaskPaths.push("driverId");
          }
          if (finalDriverName) {
            fsFields.driverName = { stringValue: finalDriverName };
            updateMaskPaths.push("driverName");
          }
          if (finalDriverPhone) {
            fsFields.driverPhone = { stringValue: finalDriverPhone };
            updateMaskPaths.push("driverPhone");
          }
          if (finalVehiclePlate) {
            fsFields.vehiclePlate = { stringValue: finalVehiclePlate };
            updateMaskPaths.push("vehiclePlate");
          }
          if (!f.startedAt?.stringValue) {
            fsFields.startedAt = { stringValue: new Date(now).toISOString() };
            updateMaskPaths.push("startedAt");
          }
          fsFields.driverArrived = { booleanValue: true };
          fsFields.driverArrivedAt = { stringValue: new Date(now).toISOString() };
          updateMaskPaths.push("status", "dispatchedTripId", "driverArrived", "driverArrivedAt");
        } else if (status === "seeking_driver") {
          fsFields.status = { stringValue: "available" };
          fsFields.driverId = { nullValue: null };
          fsFields.driverName = { nullValue: null };
          fsFields.driverPhone = { nullValue: null };
          fsFields.acceptedVehicleId = { nullValue: null };
          fsFields.vehiclePlate = { nullValue: null };
          updateMaskPaths.push(
            "status",
            "driverId",
            "driverName",
            "driverPhone",
            "acceptedVehicleId",
            "vehiclePlate"
          );
        } else if (status === "driverArrived") {
          fsFields.driverArrived = { booleanValue: true };
          fsFields.driverArrivedAt = { stringValue: new Date(now).toISOString() };
          updateMaskPaths.push("driverArrived", "driverArrivedAt");
        } else if (status === "completed") {
          fsFields.status = { stringValue: "completed" };
          fsFields.completedAt = { stringValue: new Date(now).toISOString() };
          updateMaskPaths.push("status", "completedAt");
        } else if (status === "cancelled") {
          fsFields.status = { stringValue: "cancelled" };
          fsFields.cancelledAt = { stringValue: new Date(now).toISOString() };
          updateMaskPaths.push("status", "cancelledAt");
        }

        if (updateMaskPaths.length > 0) {
          const patchUrl = `${fsUrl}?${updateMaskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&")}`;
          await fetch(patchUrl, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields: fsFields }),
          }).catch((err) => console.warn("[trip-status API] Firestore patch error:", err));
        }
      }
    } catch (fsErr) {
      console.warn("[trip-status API] Error querying Firestore scheduledTrips:", fsErr);
    }

    if (!finalDriverId && status !== "seeking_driver" && status !== "requested") {
      finalDriverId = "ZFpZfYKfuSf0T0c04wqnBNknkiw2";
    }

    // Resolver nombre, teléfono y placa reales si faltan y hay conductor o vehículo asignado
    if (
      status !== "seeking_driver" &&
      status !== "requested" &&
      (finalDriverId || targetVehicleId) &&
      (!finalDriverName ||
        finalDriverName === "Conductor Asignado" ||
        !finalVehiclePlate)
    ) {
      const [usrDocRes, vehDocRes] = await Promise.all([
        finalDriverId
          ? fetch(
              `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/users/${encodeURIComponent(finalDriverId)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            ).catch(() => null)
          : Promise.resolve(null),
        targetVehicleId
          ? fetch(
              `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/vehicles/${encodeURIComponent(targetVehicleId)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (usrDocRes && usrDocRes.ok) {
        const usrDoc = await usrDocRes.json();
        const uf = usrDoc.fields || {};
        const fn = uf.firstName?.stringValue || "";
        const ln = uf.lastName?.stringValue || "";
        const resolvedName =
          uf.displayName?.stringValue ||
          uf.fullName?.stringValue ||
          `${fn} ${ln}`.trim();
        if (resolvedName) finalDriverName = resolvedName;
        if (!finalDriverPhone) {
          finalDriverPhone =
            uf.phone?.stringValue || uf.phoneNumber?.stringValue || "";
        }
      }
      if (vehDocRes && vehDocRes.ok) {
        const vehDoc = await vehDocRes.json();
        const vf = vehDoc.fields || {};
        if (!finalVehiclePlate) {
          finalVehiclePlate =
            vf.plate?.stringValue || vf.licensePlate?.stringValue || "";
        }
      }
    }

    let driverStatusUpdate: Record<string, any> | null = null;

    switch (status) {
      case "assigned":
        rtdbStatus = "assigned";
        updates.status = "assigned";
        break;

      case "enRoute":
        rtdbStatus = "accepted";
        updates.status = "accepted";
        driverStatusUpdate = {
          status: "ocupado",
          currentRideId: tripId,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      case "driverArrived":
        rtdbStatus = "driver_arrived";
        updates.status = "driver_arrived";
        updates.driverArrived = true;
        updates.driverArrivedAt = now;
        driverStatusUpdate = {
          status: "ocupado",
          currentRideId: tripId,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      case "inService":
        rtdbStatus = "in_progress";
        updates.status = "in_progress";
        updates.startedAt = now;
        updates.driverArrived = true;
        driverStatusUpdate = {
          status: "on_trip",
          currentRideId: tripId,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      case "completed":
        rtdbStatus = "completed";
        updates.status = "completed";
        updates.completedAt = now;
        driverStatusUpdate = {
          status: "disponible",
          currentRideId: null,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      case "cancelled":
        rtdbStatus = "cancelled";
        updates.status = "cancelled";
        updates.cancelledAt = now;
        driverStatusUpdate = {
          status: "disponible",
          currentRideId: null,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      case "seeking_driver":
        rtdbStatus = "seeking_driver";
        updates.status = "seeking_driver";
        updates.interruptionReason = notes || body.reason || "Incidencia reportada en ruta";
        updates.previousDriverId = finalDriverId || null;
        driverStatusUpdate = {
          status: "disponible",
          currentRideId: null,
          lastStatusUpdate: now,
          updatedAt: now,
        };
        break;

      default:
        updates.status = status;
        break;
    }

    // Sincronizar documento espejo en Firestore `trips/{tripId}` (CF-87) solo cuando el traslado está despachado/en curso o cerrado
    if (status !== "requested" && status !== "assigned") {
      try {
        const fsTripUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/trips/${encodeURIComponent(tripId)}`;
      const tripFsStatus =
        status === "inService"
          ? "in_progress"
          : status === "driverArrived"
          ? "arrived"
          : status === "enRoute"
          ? "accepted"
          : status === "assigned"
          ? "driver_assigned"
          : status === "seeking_driver"
          ? "seeking_driver"
          : status === "completed"
          ? "completed"
          : status === "cancelled"
          ? "cancelled"
          : status;

      const tripFields: Record<string, any> = {
        countryId: { stringValue: "sv" },
        companyId: { stringValue: companyId },
        status: { stringValue: tripFsStatus },
        farePrice: { doubleValue: farePrice },
        driverEarning: { doubleValue: driverEarning },
        commissionAmount: { doubleValue: Number((farePrice * 0.3).toFixed(2)) },
      };
      const maskPaths = [
        "countryId",
        "companyId",
        "status",
        "farePrice",
        "driverEarning",
        "commissionAmount",
      ];

      if (status === "seeking_driver") {
        tripFields.interruptionReason = {
          stringValue: notes || body.reason || "Incidencia reportada en ruta",
        };
        tripFields.interruption = {
          mapValue: {
            fields: {
              reportedBy: { stringValue: "platform" },
              previousDriverId: { stringValue: finalDriverId || "" },
              previousStatus: { stringValue: "in_progress" },
              at: { timestampValue: new Date(now).toISOString() },
            },
          },
        };
        maskPaths.push("interruptionReason", "interruption");
      } else if (finalDriverId && status !== "requested") {
        tripFields.driverId = { stringValue: finalDriverId };
        maskPaths.push("driverId");
        if (status === "inService") {
          tripFields.startedAt = { timestampValue: new Date(now).toISOString() };
          maskPaths.push("startedAt");
        }
      }

      const tripPatchUrl = `${fsTripUrl}?${maskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&")}`;
        await fetch(tripPatchUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields: tripFields }),
        }).catch((e) => console.warn("[trip-status API] trips patch error:", e));
      } catch (tripSyncErr) {
        console.warn("[trip-status API] Error syncing trips doc:", tripSyncErr);
      }
    }

    if (status === "requested") {
      updates.createdAt = now;
    }

    // Campos completos requeridos por Realtime Database para la app de conductor y portales web
    updates.id = tripId;
    updates.tripId = tripId;
    updates.scheduledTripId = tripId;
    updates.companyId = companyId;
    const isUnassigned = status === "seeking_driver" || status === "requested";
    updates.driverId = isUnassigned ? null : finalDriverId || null;
    if (isUnassigned) {
      updates.driverName = null;
      updates.driverPhone = null;
      updates.vehiclePlate = null;
      updates.vehicleId = null;
    } else {
      if (finalDriverName) updates.driverName = finalDriverName;
      if (finalDriverPhone) updates.driverPhone = finalDriverPhone;
      if (finalVehiclePlate) updates.vehiclePlate = finalVehiclePlate;
      if (targetVehicleId) updates.vehicleId = targetVehicleId;
    }
    updates.customerName = passengerName;
    updates.customerPhoneNumber = passengerPhone;
    updates.passengerName = passengerName;
    updates.passengerPhone = passengerPhone;
    updates.origin = originObj;
    updates.destination = destinationObj;
    updates.farePrice = farePrice;
    updates.driverEarning = driverEarning;
    updates.commissionAmount = Number((farePrice * 0.3).toFixed(2));
    updates.paymentMethod = "corporate_credit";
    updates.serviceType = "corporate";
    // Asegurar que updatedAt sea posterior al updateTime de los PATCH de Firestore anteriores
    updates.updatedAt = Date.now() + 1500;

    // 1. PATCH rideRequests/{tripId} in Realtime Database
    const rideUrl = `${RTDB_URL}/rideRequests/${encodeURIComponent(tripId)}.json?access_token=${encodeURIComponent(token)}`;
    const rideRes = await fetch(rideUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!rideRes.ok) {
      const errText = await rideRes.text();
      return NextResponse.json(
        { error: `RTDB write failed (${rideRes.status}): ${errText}` },
        { status: rideRes.status }
      );
    }

    // 2. If driver telemetry state update is required, PATCH conductores_activos/{finalDriverId}
    if (finalDriverId && driverStatusUpdate) {
      const driverUrl = `${RTDB_URL}/conductores_activos/${encodeURIComponent(finalDriverId)}.json?access_token=${encodeURIComponent(token)}`;
      await fetch(driverUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverStatusUpdate),
      }).catch((e) => {
        console.warn("[trip-status API] Driver status update error:", e);
      });

      if (
        status === "completed" ||
        status === "cancelled" ||
        status === "seeking_driver"
      ) {
        const fsDrvUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/drivers/${encodeURIComponent(finalDriverId)}?updateMask.fieldPaths=activeTripId`;
        const fsLockUrl = `https://firestore.googleapis.com/v1/projects/lilo-23fef/databases/(default)/documents/driverReservationLocks/${encodeURIComponent(finalDriverId)}`;
        await Promise.allSettled([
          fetch(fsDrvUrl, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fields: { activeTripId: { nullValue: null } },
            }),
          }).catch(() => {}),
          (async () => {
            try {
              const lockRes = await fetch(fsLockUrl, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!lockRes.ok) return;
              const lockDoc = await lockRes.json();
              const accFields =
                lockDoc.fields?.acceptedReservations?.mapValue?.fields || {};
              if (accFields[tripId]) {
                const nextFields = { ...accFields };
                delete nextFields[tripId];
                await fetch(
                  `${fsLockUrl}?updateMask.fieldPaths=acceptedReservations`,
                  {
                    method: "PATCH",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      fields: {
                        acceptedReservations: {
                          mapValue: { fields: nextFields },
                        },
                      },
                    }),
                  }
                );
              }
            } catch {}
          })(),
        ]);
      }
    }

    return NextResponse.json({
      success: true,
      tripId,
      rtdbStatus,
      updates,
    });
  } catch (err: any) {
    console.error("[trip-status API] Error in POST:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
