import { VehicleCategory } from "@/types/b2b";

/** Tarifas de referencia para traslados corporativos B2B */
export const DRIVER_SHARE_RATE = 0.70;
export const LILO_COMMISSION_RATE = 0.30;
export const MAX_VEHICLE_PASSENGER_CAPACITY = 12;
export const LILO_DIRECT_CONTACT = {
  phone: "+503 2200-5456",
  whatsapp: "+503 7000-5456",
  email: "corporativo@lilo.app",
};

/**
 * Configuración oficial de restricciones de reservas corporativas B2B (Acuerdos comerciales El Salvador 2026)
 */
export const B2B_RESERVATION_CONFIG = {
  allowImmediate: false, // Inmediatos inhabilitados hasta contar con flota cercana en zona
  minAdvanceHours: 3,    // Anticipación mínima general obligatoria (3 horas)
  corporateRecommendedHours: 6, // Anticipación recomendada para clientes corporativos (6 horas)
};

export const CAPACITY_EXCEEDED_MESSAGE_ES =
  "Para viajes de más de 12 pasajeros, contáctenos por WhatsApp o llamada y con gusto le ayudaremos de inmediato.\nEstamos para servirle.";

export interface B2BTariffRule {
  category: VehicleCategory;
  label: string;
  shortLabel: string;
  ratePerKm: number;
  minFare: number;
  baseDistanceKm: number;
  maxPassengers: number;
  description: string;
}

export const EL_SALVADOR_B2B_TARIFFS: Record<VehicleCategory, B2BTariffRule> = {
  suv: {
    category: "suv",
    label: "SUV Corporativa (máx. 4 pasajeros)",
    shortLabel: "SUV",
    ratePerKm: 0.67,
    minFare: 13.56,
    baseDistanceKm: 20,
    maxPassengers: 4,
    description: "$0.67 / km · Tarifa mínima $13.56 USD (cubre hasta 20 km)",
  },
  pickup: {
    category: "pickup",
    label: "Pick-up Doble Cabina (máx. 4 pasajeros)",
    shortLabel: "Pick-up",
    ratePerKm: 0.67,
    minFare: 13.56,
    baseDistanceKm: 20,
    maxPassengers: 4,
    description: "$0.67 / km · Tarifa mínima $13.56 USD (cubre hasta 20 km)",
  },
  microbus: {
    category: "microbus",
    label: "Microbús Corporativo (máx. 12 pasajeros)",
    shortLabel: "Microbús",
    ratePerKm: 0.9,
    minFare: 45.0,
    baseDistanceKm: 50,
    maxPassengers: 12,
    description: "$0.90 / km · Tarifa mínima $45.00 USD (cubre hasta 50 km)",
  },
};

export interface SVLocationPreset {
  label: string;
  address: string;
  lat: number;
  lng: number;
  zone: string;
}

export const EL_SALVADOR_LOCATIONS: SVLocationPreset[] = [
  {
    label: "World Trade Center San Salvador (Col. Escalón)",
    address: "89 Av. Norte y Calle El Mirador, Colonia Escalón, San Salvador",
    lat: 13.7086,
    lng: -89.2408,
    zone: "San Salvador",
  },
  {
    label: "Zona Rosa / Blvd. del Hipódromo (San Benito)",
    address: "Bulevar del Hipódromo, Colonia San Benito, San Salvador",
    lat: 13.6914,
    lng: -89.2392,
    zone: "San Salvador",
  },
  {
    label: "Centro Financiero Gigante (Alameda Roosevelt)",
    address: "63 Av. Sur y Alameda Roosevelt, San Salvador",
    lat: 13.6987,
    lng: -89.2261,
    zone: "San Salvador",
  },
  {
    label: "Santa Elena / Embajada Americana (Antiguo Cuscatlán)",
    address: "Bulevar Santa Elena, Antiguo Cuscatlán, La Libertad",
    lat: 13.6695,
    lng: -89.2549,
    zone: "La Libertad",
  },
  {
    label: "Zona Franca Santa Tecla / Ciudad Merliot",
    address: "Carretera al Puerto de La Libertad Km 12, Santa Tecla",
    lat: 13.6731,
    lng: -89.2798,
    zone: "La Libertad",
  },
  {
    label: "Parque Industrial Plan de La Laguna (Antiguo Cuscatlán)",
    address: "Zona Industrial Plan de La Laguna, Antiguo Cuscatlán",
    lat: 13.6698,
    lng: -89.2425,
    zone: "La Libertad",
  },
  {
    label: "Planta Soyapango / Blvd. del Ejército",
    address: "Bulevar del Ejército Nacional Km 5.5, Soyapango, San Salvador",
    lat: 13.7012,
    lng: -89.1523,
    zone: "Soyapango",
  },
  {
    label: "Planta Industrial Apopa (Ingenio El Ángel)",
    address: "Km 14 Carretera Troncal del Norte, Apopa, San Salvador",
    lat: 13.8022,
    lng: -89.1783,
    zone: "Apopa",
  },
  {
    label: "Zona Franca American Park (Ciudad Arce)",
    address: "Km 36 Carretera a Santa Ana, Ciudad Arce, La Libertad",
    lat: 13.8251,
    lng: -89.4316,
    zone: "La Libertad",
  },
  {
    label: "Zona Franca Miramar (Olocuilta)",
    address: "Km 30.5 Autopista a Comalapa, Olocuilta, La Paz",
    lat: 13.5418,
    lng: -89.1172,
    zone: "La Paz",
  },
  {
    label: "Aeropuerto Internacional de El Salvador (SAL - Comalapa)",
    address: "San Luis Talpa, Departamento de La Paz, El Salvador",
    lat: 13.4409,
    lng: -89.0557,
    zone: "Comalapa",
  },
  {
    label: "Puerto de Acajutla (Sonsonate)",
    address: "Recinto Portuario CEPA, Acajutla, Sonsonate",
    lat: 13.5928,
    lng: -89.8336,
    zone: "Sonsonate",
  },
  {
    label: "Santa Ana Centro Corporativo",
    address: "Av. Independencia Sur, Santa Ana, El Salvador",
    lat: 13.9942,
    lng: -89.5597,
    zone: "Santa Ana",
  },
  {
    label: "San Miguel Centro Industrial",
    address: "Carretera Panamericana Km 136, San Miguel, El Salvador",
    lat: 13.4833,
    lng: -88.1833,
    zone: "San Miguel",
  },
];

/**
 * Calcula distancia Haversine en línea recta multiplicada por factor vial (1.28x en El Salvador)
 */
export function calculateRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Radio de la tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;
  const roadDistance = straightDistance * 1.28;
  return Math.max(1.5, Number(roadDistance.toFixed(1)));
}

/**
 * Calcula la distancia total de una ruta con origen, paradas intermedias y destino
 */
export function calculateMultiStopRouteDistanceKm(
  points: Array<{ lat: number; lng: number }>
): number {
  if (!points || points.length < 2) return 0;
  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalKm += calculateRoadDistanceKm(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
  }
  return Number(totalKm.toFixed(1));
}

export interface B2BTariffBreakdown {
  category: VehicleCategory;
  rule: B2BTariffRule;
  oneWayDistanceKm: number;
  billableDistanceKm: number;
  roundTrip: boolean;
  ratePerKm: number;
  minFare: number;
  baseDistanceKm: number;
  extraDistanceKm: number;
  rawDistanceFare: number;
  finalFare: number;
  driverEarning: number;
  liloCommission: number;
  driverShareRate: number;
  liloCommissionRate: number;
  appliedMinimum: boolean;
  estimatedDurationMinutes: number;
  breakdownSummary: string;
}

/**
 * Calcula la tarifa oficial B2B El Salvador según categoría vehicular, distancia total e ida/vuelta
 */
export function calculateB2BTariff(
  category: VehicleCategory,
  oneWayDistanceKm: number,
  roundTrip: boolean = false
): B2BTariffBreakdown {
  const rule = EL_SALVADOR_B2B_TARIFFS[category] || EL_SALVADOR_B2B_TARIFFS.suv;
  const cleanOneWay = Math.max(0, Number(oneWayDistanceKm) || 0);
  const billableDistanceKm = Number(
    (roundTrip ? cleanOneWay * 2 : cleanOneWay).toFixed(1)
  );

  const rawDistanceFare = Number(
    (billableDistanceKm * rule.ratePerKm).toFixed(2)
  );
  const appliedMinimum = billableDistanceKm <= rule.baseDistanceKm || rawDistanceFare <= rule.minFare;
  const finalFare = Number(Math.max(rule.minFare, rawDistanceFare).toFixed(2));
  const driverEarning = Number((finalFare * DRIVER_SHARE_RATE).toFixed(2));
  const liloCommission = Number((finalFare - driverEarning).toFixed(2));
  const extraDistanceKm = Math.max(
    0,
    Number((billableDistanceKm - rule.baseDistanceKm).toFixed(1))
  );

  // Velocidad promedio corporativa en SV ~35 km/h + 5 min margen
  const estimatedDurationMinutes = Math.max(
    10,
    Math.round((billableDistanceKm / 35) * 60 + 5)
  );

  const breakdownSummary = appliedMinimum
    ? `Tarifa mínima aplicada ($${rule.minFare.toFixed(2)} USD cubre hasta ${rule.baseDistanceKm} km · Ruta: ${billableDistanceKm} km)`
    : `${billableDistanceKm} km × $${rule.ratePerKm.toFixed(2)}/km = $${finalFare.toFixed(2)} USD`;

  return {
    category,
    rule,
    oneWayDistanceKm: cleanOneWay,
    billableDistanceKm,
    roundTrip,
    ratePerKm: rule.ratePerKm,
    minFare: rule.minFare,
    baseDistanceKm: rule.baseDistanceKm,
    extraDistanceKm,
    rawDistanceFare,
    finalFare,
    driverEarning,
    liloCommission,
    driverShareRate: DRIVER_SHARE_RATE,
    liloCommissionRate: LILO_COMMISSION_RATE,
    appliedMinimum,
    estimatedDurationMinutes,
    breakdownSummary,
  };
}

/**
 * Filtra las categorías permitidas según la cantidad de pasajeros
 * > 4 pasajeros obliga a usar Microbús
 */
export function getAllowedCategoriesForPassengers(
  passengersCount: number
): VehicleCategory[] {
  if (passengersCount > 4) {
    return ["microbus"];
  }
  return ["suv", "pickup", "microbus"];
}
