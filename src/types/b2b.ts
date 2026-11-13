import { Timestamp } from "firebase/firestore";

/**
 * Condiciones de pago habilitadas para empresas B2B en El Salvador (camelCase)
 */
export type PaymentCondition =
  | "cash"
  | "transfer"
  | "card"
  | "immediate"
  | "credit15"
  | "credit30"
  | "credit_15"
  | "credit_30";

/**
 * Estado operativo de una empresa cliente B2B
 */
export type CompanyStatus = "active" | "suspended" | "inactive";

/**
 * Periodos de facturación del catálogo global (`billingCadences/{cadenceId}`) — CF-24
 */
export type BillingPeriodId =
  | "daily"
  | "weekly"
  | "semi-monthly"
  | "monthly"
  | "biweekly";

export interface BillingCadenceDocument {
  id: BillingPeriodId;
  label: string;
  description?: string;
  windowKind?: string;
  windowDays?: number | null;
  active?: boolean;
  selectable?: boolean;
  displayOrder?: number;
  status?: "active" | "retired";
  selectableForNewCompany?: boolean;
  rule?: string;
  constraint: string | null;
  updatedAt?: Timestamp | any;
}

/**
 * Entidad Empresa B2B en Firestore (`b2bCompanies/{companyId}`)
 */
export interface B2BCompany {
  id: string;
  tradeName: string;
  legalName: string;
  nit: string;
  nrc: string;
  contactName: string;
  contactPerson?: string;
  phone: string;
  contactPhone?: string;
  whatsapp: string;
  email: string;
  address: string;
  paymentCondition: PaymentCondition;
  billingPeriod?: BillingPeriodId;
  negotiatedFareRate?: number;
  allowsImmediateTrips?: boolean;
  allowsScheduledTrips?: boolean;
  minimumBookingLeadMinutes?: number;
  validFrom?: Timestamp | any;
  creditLimit?: number | null;
  requiresInvoice: boolean;
  requiresCCF: boolean;
  balance: number;
  status: CompanyStatus;
  countryId: "SV" | "sv" | string;
  authUid?: string;
  mustChangePassword?: boolean;
  passwordUpdatedAt?: Timestamp | any;
  initialPassword?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

/**
 * Techo de consumo / Centro de costo (`b2bCompanies/{companyId}/costCenters/{centerId}`) — CF-23 (P13)
 * Regla de ausencia invertida: `budgetLimit === null` o `undefined` significa SIN LÍMITE.
 * Nunca inicializar un `budgetLimit` ausente a `0` (`0` bloquea todos los viajes).
 */
export interface CostCenter {
  id: string;
  code?: string;
  name: string;
  department?: string;
  budgetLimit: number | null;
  monthlyBudget?: number | null;
  budgetPeriod?: string;
  spent: number;
  reserved?: number;
  budgetWindowStart?: number | null;
  active?: boolean;
  status?: "active" | "inactive";
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

/**
 * Solicitud histórica de cambio de límite para auditoría (`b2bCompanies/{companyId}/limitRequests/{requestId}`) — CF-23
 */
export interface LimitRequest {
  id: string;
  companyId?: string;
  costCenterId: string;
  costCenterName?: string;
  previousLimit?: number | null;
  requestedLimit?: number | null;
  requestedBudgetLimit?: number | null;
  currentBudgetLimit?: number | null;
  reason?: string;
  requestedByUid?: string;
  requestedByName?: string;
  requestedBy?: string;
  decidedBy?: string | null;
  status?: "pending" | "approved" | "applied" | "rejected";
  state?: "requested" | "approved" | "rejected";
  stateUpdatedAt?: number;
  notes?: string;
  createdAt?: Timestamp | any;
}

/**
 * Viajero corporativo hospedado (`b2bCompanies/{companyId}/travellers/{travellerId}`) — LO-4.2
 * No requiere cuenta en `users`.
 */
export interface B2BTraveller {
  id: string;
  companyId: string;
  name: string;
  fullName?: string;
  email?: string;
  phone?: string;
  documentId?: string;
  employeeCode?: string;
  department?: string;
  costCenterId?: string;
  status?: "active" | "inactive";
  active?: boolean;
  createdAt?: Timestamp | any;
}

/**
 * Estados del flujo operativo de una solicitud B2B en camelCase
 * Incluye `seeking_driver` cuando el conductor retira disponibilidad (`markDriverUnavailable`).
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

/**
 * Categorías de vehículos autorizadas para el piloto B2B El Salvador
 */
export type VehicleCategory = "suv" | "pickup" | "microbus";
export type B2BVehicleType = VehicleCategory;

/**
 * Modelo dentro de `vehicleCatalog/{brandId}/models/{modelId}` — CF-01, CF-25
 */
export interface VehicleCatalogModel {
  id: string;
  name: string;
  seats?: number | null;
  maxPassengers?: number | null;
  category?: VehicleCategory;
  active?: boolean;
}

export interface VehicleCatalogBrand {
  id: string;
  name: string;
  active?: boolean;
  models: VehicleCatalogModel[];
}

/**
 * Regla CF-25: Resolución explícita de las dos capacidades del catálogo de vehículos.
 * - `seats`: asientos totales de fábrica (conductor INCLUIDO).
 * - `maxPassengers`: capacidad comercial Lilo (conductor EXCLUIDO, `maxPassengers <= seats - 1`).
 */
export function resolveVehiclePassengerCapacity(item: {
  maxPassengers?: number | null;
  seats?: number | null;
}): {
  capacity: number;
  source: "maxPassengers" | "derivedFromSeats" | "none";
  label: string;
} {
  if (typeof item.maxPassengers === "number" && Number.isFinite(item.maxPassengers)) {
    return {
      capacity: item.maxPassengers,
      source: "maxPassengers",
      label: `${item.maxPassengers} pasajeros`,
    };
  }
  if (typeof item.seats === "number" && Number.isFinite(item.seats) && item.seats >= 1) {
    const derived = Math.max(0, item.seats - 1);
    return {
      capacity: derived,
      source: "derivedFromSeats",
      label: `${derived} pasajeros (derivado de ${item.seats} asientos de fábrica)`,
    };
  }
  return {
    capacity: 4,
    source: "none",
    label: "Sin capacidad comercial definida",
  };
}

/**
 * Vehículo registrado en la flota (`vehicles/{vehicleId}`)
 */
export interface B2BVehicle {
  id: string;
  countryId: string;
  plate: string;
  licensePlate?: string;
  brand: string;
  make?: string;
  model: string;
  year: number;
  color: string;
  category: VehicleCategory;
  categoryId?: string;
  active?: boolean;
  plateKey?: string;
  seats?: number | null;
  maxPassengers: number;
  capacitySource?: "maxPassengers" | "derivedFromSeats" | "none";
  hasCargoCapacity?: boolean;
  status: "active" | "maintenance" | "inactive" | "pendingDocs";
  isVerified?: boolean;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  companyId?: string;
  companyName?: string;
  registrationNumber?: string;
  registrationExpiresAt?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface RoutePoint {
  address: string;
  lat: number;
  lng: number;
  reference?: string;
}

export type GeoLocation = RoutePoint;

export interface StopLocation extends RoutePoint {
  order?: number;
}

export interface TripLegInput {
  index?: number;
  distance: number;
  durationMinutes: number;
}

export interface FrozenFareBreakdown {
  tripId?: string;
  countryId?: string;
  currency?: string;
  currencyCode?: string;
  currencyDecimals?: number;
  distanceUnit: "km" | "mi";
  chargedDistance: number;
  farePrice: number;
  appliedFareRate?: number;
  countryFloorRate?: number;
  commissionRate?: number;
  commissionAmount?: number;
  driverEarning?: number;
  minimumApplied?: boolean;
  pricingFormulaVersion?: string;
}


/**
 * Solicitud de traslado B2B (`b2bRequests/{requestId}` + vínculo a `trips/{tripId}`)
 */
export interface B2BServiceRequest {
  id: string;
  tripId?: string;
  folio: string;
  countryId: string;
  companyId: string;
  companyName: string;
  costCenterId?: string;
  costCenterName?: string;
  travellerId?: string;
  travellerName?: string;
  requestedByUid: string;
  requestedByName: string;
  passengersCount: number;
  passengerNames?: string[];
  passengerPhone?: string;
  vehicleCategory: VehicleCategory;
  hasCargo: boolean;
  cargoDescription?: string;
  origin: RoutePoint;
  stops?: RoutePoint[];
  destination: RoutePoint;
  legs?: TripLegInput[];
  roundTrip: boolean;
  scheduledAt: string | Timestamp | any;
  isImmediate: boolean;
  estimatedDistanceKm: number;
  estimatedDurationMinutes?: number;
  tariffApplied: {
    category: VehicleCategory;
    ratePerKm: number;
    minFare: number;
    baseDistanceKm: number;
    calculatedAmount: number;
  };
  fareBreakdown?: FrozenFareBreakdown;
  finalAmount?: number;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedVehicleId?: string;
  assignedVehiclePlate?: string;
  status: B2BRequestStatus;
  rawStatus?: string;
  notes?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  completedAt?: Timestamp | any;
}

export type B2BRequest = B2BServiceRequest;

/**
 * Códigos de motivo de rechazo documental en camelCase
 */
export type RejectionReasonCode =
  | "illegible"
  | "expired"
  | "wrongDocument"
  | "incomplete"
  | "mismatch"
  | "notIssuedHere";

/**
 * Tipos de documento del dominio en camelCase
 */
export type DriverDocumentType =
  | "driversLicense"
  | "identityDocument"
  | "vehicleRegistration"
  | "criminalRecord"
  | "insuranceCard";

export type DriverDocumentStatus =
  | "inReview"
  | "approved"
  | "rejected"
  | "expired";

/**
 * Requisito documental configurable para El Salvador (`documentRequirements/{id}`)
 */
export interface DocumentRequirement {
  id: string;
  countryId: string;
  code: DriverDocumentType;
  name: string;
  description: string;
  required: boolean;
  appliesTo: "driver" | "vehicle";
  requiresExpirationDate: boolean;
  order: number;
  active: boolean;
  updatedAt?: Timestamp | any;
}

/**
 * Registro individual dentro del expediente documental del conductor
 */
export interface DriverDocumentRecord {
  id: string;
  type: DriverDocumentType;
  name: string;
  appliesTo: "driver" | "vehicle";
  fileUrl?: string;
  documentNumber?: string;
  expirationDate?: string;
  status: DriverDocumentStatus;
  rejectionReason?: RejectionReasonCode;
  rejectionReasonLabel?: string;
  rejectionNote?: string;
  reviewedBy?: string;
  reviewedAt?: string | Timestamp | any;
  updatedAt?: Timestamp | any;
}

/**
 * Expediente consolidado del conductor para la bandeja de verificación en SuperAdmin
 */
export interface DriverVerificationDossier {
  driverId: string;
  driverName: string;
  driverEmail?: string;
  driverPhone?: string;
  dui?: string;
  countryId: string;
  companyId?: string;
  companyName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  vehicleCategory?: VehicleCategory;
  overallStatus: "inReview" | "partiallyRejected" | "approved";
  documents: DriverDocumentRecord[];
  updatedAt?: Timestamp | any;
}
