import { useState, useEffect } from "react";
import { getDatabase, ref, get } from "firebase/database";
import { firebaseApp } from "@/utils/firebase";
import { queryScopedCollection } from "@/utils/adminCheck";

export interface DashboardStats {
  totalVentasAnual: number;
  cambioVentasAnual: number;
  gananciasMes: number;
  cambioGananciasMes: number;
  yearlyBreakupSeries: number[]; // [Driver Earnings, Lilo Commission]
  salesOverviewCategories: string[];
  salesOverviewSeries: { name: string; data: number[] }[];
  recentTransactions: { time: string; text: string; color: string }[];
  driverPerformance: { id: string; name: string; car: string; performance: string; pbg: string; budget: string }[];
  monthlyEarningsChartData: number[];
  loading: boolean;
  
  // New metrics for limited dashboards
  tasaCancelacion: number;
  tiempoEsperaPromedio: number;
  conductoresActivosCount: number;
  nuevosUsuariosCount: number;
  totalUsuariosCount: number;
  totalConductoresCount: number;
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    totalVentasAnual: 0,
    cambioVentasAnual: 0,
    gananciasMes: 0,
    cambioGananciasMes: 0,
    yearlyBreakupSeries: [0, 0],
    salesOverviewCategories: [],
    salesOverviewSeries: [],
    recentTransactions: [],
    driverPerformance: [],
    monthlyEarningsChartData: [],
    loading: true,
    
    tasaCancelacion: 0,
    tiempoEsperaPromedio: 0,
    conductoresActivosCount: 0,
    nuevosUsuariosCount: 0,
    totalUsuariosCount: 0,
    totalConductoresCount: 0,
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const rtdb = getDatabase(firebaseApp);

        // 1. Fetch country-scoped collections (CF-05)
        const [tripsDocs, usersDocs, driversDocs, activeDriversSnap] = await Promise.all([
          queryScopedCollection("historyTrips"),
          queryScopedCollection("users"),
          queryScopedCollection("drivers"),
          get(ref(rtdb, "conductores_activos")),
        ]);

        // Build dictionaries for users and drivers
        const usersMap: Record<string, any> = {};
        usersDocs.forEach((u) => {
          usersMap[u.id] = u;
        });

        const driversMap: Record<string, any> = {};
        driversDocs.forEach((d) => {
          driversMap[d.id] = d;
        });

        const getTimestamp = (t: any) => {
          const rawDate = t.createdAt || t.updatedAt || t.completedAt || t.startedAt || t.reviewTimestamp;
          if (!rawDate) return Date.now();
          if (rawDate.toDate && typeof rawDate.toDate === 'function') {
            return rawDate.toDate().getTime();
          }
          if (rawDate.seconds !== undefined) {
            return rawDate.seconds * 1000;
          }
          if (typeof rawDate === 'string') {
            return new Date(rawDate).getTime();
          }
          return Number(rawDate);
        };

        const trips: any[] = [...tripsDocs];

        // Sort trips in memory descending by date (most recent first)
        trips.sort((a, b) => getTimestamp(b) - getTimestamp(a));

        // 2. Process RTDB active drivers
        const activeDriversVal = activeDriversSnap.val();
        const conductoresActivosCount = activeDriversVal ? Object.keys(activeDriversVal).length : 0;

        // 3. Process new and total users
        const totalUsuariosCount = usersDocs.length;
        const totalConductoresCount = driversDocs.length;

        let nuevosUsuariosCount = 0;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        usersDocs.forEach((uData: any) => {
          if (uData.createdAt) {
            const createdDate = uData.createdAt.toDate ? uData.createdAt.toDate() : new Date(uData.createdAt);
            if (createdDate >= thirtyDaysAgo) {
              nuevosUsuariosCount++;
            }
          }
        });

        // 4. Process metrics from trips
        const now = new Date();
        const currentYear = now.getFullYear();
        const lastYear = currentYear - 1;
        const currentMonth = now.getMonth();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const yearOfLastMonth = currentMonth === 0 ? currentYear - 1 : currentYear;

        let salesCurrentYear = 0;
        let salesLastYear = 0;
        let earningsCurrentMonth = 0;
        let earningsLastMonth = 0;
        let totalDriverEarnings = 0;
        let totalLiloCommission = 0;

        let completedCount = 0;
        let cancelledCount = 0;
        let totalWaitTimeMs = 0;
        let countWithWaitTime = 0;

        trips.forEach((trip) => {
          const status = trip.status?.toLowerCase();
          
          if (!status || status === 'completed') {
            completedCount++;
          } else if (status === 'cancelled' || status === 'canceled') {
            cancelledCount++;
          }

          if (trip.startedAt && trip.createdAt) {
            const createdMs = trip.createdAt.seconds 
              ? trip.createdAt.seconds * 1000 
              : (trip.createdAt.toDate ? trip.createdAt.toDate().getTime() : new Date(trip.createdAt).getTime());
            const startedMs = Number(trip.startedAt);
            
            if (startedMs > createdMs) {
              const diffMs = startedMs - createdMs;
              if (diffMs > 0 && diffMs < 2 * 60 * 60 * 1000) {
                totalWaitTimeMs += diffMs;
                countWithWaitTime++;
              }
            }
          }
        });

        const totalTrips = completedCount + cancelledCount;
        const tasaCancelacion = totalTrips > 0
          ? Number(((cancelledCount / totalTrips) * 100).toFixed(1))
          : 0;

        const tiempoEsperaPromedio = countWithWaitTime > 0
          ? Number((totalWaitTimeMs / countWithWaitTime / (60 * 1000)).toFixed(1))
          : 8.5; // default fallback wait time in minutes

        // Daily aggregation for the last 8 days of activity (or last 8 trips)
        // Let's sort trips chronologically to get daily stats for the overview chart
        const chronoTrips = [...trips].reverse();
        
        // Group by date string (DD/MM)
        const dailyStats: Record<string, { sales: number; commission: number }> = {};
        chronoTrips.forEach((trip) => {
          const date = new Date(getTimestamp(trip));
          const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          
          const price = Number(trip.originalPrice || 0);
          const comm = Number(trip.commission || 0);
          
          if (!dailyStats[dateStr]) {
            dailyStats[dateStr] = { sales: 0, commission: 0 };
          }
          dailyStats[dateStr].sales += price;
          dailyStats[dateStr].commission += comm;
        });

        const last8Days = Object.keys(dailyStats).slice(-8);
        const salesOverviewCategories = last8Days;
        
        const salesData = last8Days.map(day => Math.round(dailyStats[day].sales));
        const commissionData = last8Days.map(day => Math.round(dailyStats[day].commission));

        const salesOverviewSeries = [
          {
            name: "Total Ventas ($)",
            data: salesData,
          },
          {
            name: "Comisión Lilo ($)",
            data: commissionData,
          },
        ];

        // Process overall metrics
        trips.forEach((trip) => {
          const date = new Date(getTimestamp(trip));
          const yr = date.getFullYear();
          const mo = date.getMonth();
          
          const price = Number(trip.originalPrice || 0);
          const earnings = Number(trip.driverEarnings || 0);
          const comm = Number(trip.commission || 0);

          if (yr === currentYear) {
            salesCurrentYear += price;
            totalDriverEarnings += earnings;
            totalLiloCommission += comm;
          } else if (yr === lastYear) {
            salesLastYear += price;
          }

          if (yr === currentYear && mo === currentMonth) {
            earningsCurrentMonth += comm; // Monthly earnings is Lilo's commission
          } else if (yr === yearOfLastMonth && mo === lastMonth) {
            earningsLastMonth += comm;
          }
        });

        // Cambio anual
        const cambioVentasAnual = salesLastYear > 0 
          ? Math.round(((salesCurrentYear - salesLastYear) / salesLastYear) * 100)
          : 0;

        // Cambio mensual
        const cambioGananciasMes = earningsLastMonth > 0
          ? Math.round(((earningsCurrentMonth - earningsLastMonth) / earningsLastMonth) * 100)
          : 0;

        // Recent transactions from recent trips
        const colors = ["primary", "secondary", "success", "warning", "error"];
        const recentTransactions = trips.slice(0, 6).map((trip, idx) => {
          const date = new Date(getTimestamp(trip));
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          
          const passenger = trip.passengerName || "Pasajero";
          const method = trip.paymentMethod === "card" ? "tarjeta" : "efectivo";
          
          return {
            time: timeStr,
            text: `Viaje de ${passenger} de $${Number(trip.originalPrice || 0).toFixed(2)} pagado en ${method}`,
            color: colors[idx % colors.length]
          };
        });

        // Sparkline monthly chart data (e.g. commission of last 7 trips)
        const monthlyEarningsChartData = trips.slice(0, 7).reverse().map(t => Number(t.commission || 0));

        // Driver Performance calculations
        const driverStats: Record<string, { totalEarned: number; count: number }> = {};
        trips.forEach((trip) => {
          if (trip.driverId) {
            if (!driverStats[trip.driverId]) {
              driverStats[trip.driverId] = { totalEarned: 0, count: 0 };
            }
            driverStats[trip.driverId].totalEarned += Number(trip.driverEarnings || 0);
            driverStats[trip.driverId].count += 1;
          }
        });

        const performanceList = Object.keys(driverStats).map((dId, idx) => {
          const driverUser = usersMap[dId];
          const driverProfile = driversMap[dId];
          
          const name = driverUser ? `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim() : "Conductor Desconocido";
          const car = driverProfile ? `${driverProfile.vehicleBrand || ''} ${driverProfile.vehicleModel || ''}`.trim() : "Vehículo";
          
          const totalEarned = driverStats[dId].totalEarned;
          const count = driverStats[dId].count;
          
          let performance = "Medium";
          let pbg = "secondary.main";
          if (count > 5) {
            performance = "High";
            pbg = "success.main";
          } else if (count < 2) {
            performance = "Low";
            pbg = "error.main";
          }

          return {
            id: (idx + 1).toString(),
            name,
            car: car || "N/A",
            performance,
            pbg,
            budget: totalEarned.toFixed(2),
          };
        });

        // Sort drivers by budget generated
        performanceList.sort((a, b) => Number(b.budget) - Number(a.budget));
        // Re-assign ranks
        const driverPerformance = performanceList.slice(0, 4).map((item, idx) => ({
          ...item,
          id: (idx + 1).toString()
        }));

        setStats({
          totalVentasAnual: Math.round(salesCurrentYear),
          cambioVentasAnual,
          gananciasMes: Math.round(earningsCurrentMonth),
          cambioGananciasMes,
          yearlyBreakupSeries: [
            Math.round(totalDriverEarnings),
            Math.round(totalLiloCommission)
          ],
          salesOverviewCategories,
          salesOverviewSeries,
          recentTransactions,
          driverPerformance,
          monthlyEarningsChartData,
          loading: false,
          
          tasaCancelacion,
          tiempoEsperaPromedio,
          conductoresActivosCount,
          nuevosUsuariosCount,
          totalUsuariosCount,
          totalConductoresCount,
        });

      } catch (error) {
        console.error("Error computing dashboard stats:", error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }

    fetchStats();
  }, []);

  return stats;
}
