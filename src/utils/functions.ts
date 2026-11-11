import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";

// Initialize functions instance for the us-central1 region
export const functions = getFunctions(firebaseApp, "us-central1");

// --- Interfaces for Inputs and Responses ---

export interface CleanupResponse {
  success: boolean;
  tripsCleaned: number;
  driversCleaned: number;
  message: string;
}

export interface DeactivateDriverParams {
  driverId: string;
}

export interface DeactivateDriverResponse {
  success: boolean;
  driverId: string;
  message: string;
}

export interface RequestEmailVerificationCodeParams {
  email: string;
}

export interface RequestEmailVerificationCodeResponse {
  success: boolean;
  message: string;
}

export interface VerifyEmailCodeParams {
  email: string;
  code: string;
}

export interface VerifyEmailCodeResponse {
  success: boolean;
  message: string;
}

export interface GetEmailVerificationStatusParams {
  userId: string;
}

export interface GetEmailVerificationStatusResponse {
  isVerified: boolean;
  verifiedAt?: string | null;
}

export interface SendWelcomeEmailParams {
  displayName?: string;
}

export interface SendWelcomeEmailResponse {
  success: boolean;
  message: string;
}

export interface RequestPasswordResetCodeParams {
  email: string;
}

export interface RequestPasswordResetCodeResponse {
  success: boolean;
  message: string;
}

export interface VerifyPasswordResetCodeAndUpdatePasswordParams {
  email: string;
  code: string;
  newPassword?: string;
}

export interface VerifyPasswordResetCodeAndUpdatePasswordResponse {
  success: boolean;
  message: string;
}

export interface RequestAccountDeletionCodeParams {}

export interface RequestAccountDeletionCodeResponse {
  success: boolean;
  message: string;
}

export interface ConfirmAccountDeletionParams {
  userId: string;
  code: string;
}

export interface ConfirmAccountDeletionResponse {
  success: boolean;
  message: string;
}



// --- Callable Export Definitions ---

// Cleanup Functions
export const runCleanupOnDemandCallable = httpsCallable<void, CleanupResponse>(
  functions,
  "runCleanupOnDemand"
);

export const cleanupRideRequestsOnlyCallable = httpsCallable<void, CleanupResponse>(
  functions,
  "cleanupRideRequestsOnly"
);

export const cleanupInactiveDriversOnlyCallable = httpsCallable<void, CleanupResponse>(
  functions,
  "cleanupInactiveDriversOnly"
);

export const deactivateDriverCallable = httpsCallable<DeactivateDriverParams, DeactivateDriverResponse>(
  functions,
  "deactivateDriver"
);

// Email Verification Functions
export const requestEmailVerificationCodeCallable = httpsCallable<RequestEmailVerificationCodeParams, RequestEmailVerificationCodeResponse>(
  functions,
  "requestEmailVerificationCode"
);

export const verifyEmailCodeCallable = httpsCallable<VerifyEmailCodeParams, VerifyEmailCodeResponse>(
  functions,
  "verifyEmailCode"
);

export const getEmailVerificationStatusCallable = httpsCallable<GetEmailVerificationStatusParams, GetEmailVerificationStatusResponse>(
  functions,
  "getEmailVerificationStatus"
);

// Welcome and Password/Account Flow Functions
export const sendWelcomeEmailCallable = httpsCallable<SendWelcomeEmailParams, SendWelcomeEmailResponse>(
  functions,
  "sendWelcomeEmail"
);

export const requestPasswordResetCodeCallable = httpsCallable<RequestPasswordResetCodeParams, RequestPasswordResetCodeResponse>(
  functions,
  "requestPasswordResetCode"
);

export const verifyPasswordResetCodeAndUpdatePasswordCallable = httpsCallable<VerifyPasswordResetCodeAndUpdatePasswordParams, VerifyPasswordResetCodeAndUpdatePasswordResponse>(
  functions,
  "verifyPasswordResetCodeAndUpdatePassword"
);

export const requestAccountDeletionCodeCallable = httpsCallable<RequestAccountDeletionCodeParams, RequestAccountDeletionCodeResponse>(
  functions,
  "requestAccountDeletionCode"
);

export const confirmAccountDeletionCallable = httpsCallable<ConfirmAccountDeletionParams, ConfirmAccountDeletionResponse>(
  functions,
  "confirmAccountDeletion"
);

// --- Hito 2 Trips, B2B & History Callables (CF-08, CF-13, CF-19, CF-22, CF-23) ---

// --- CF-38: getFareQuote ---
export interface GetFareQuoteLegInput {
  distance: number;
  durationMinutes: number;
}

export interface GetFareQuoteParams {
  legs: GetFareQuoteLegInput[];
  categoryId?: string;
}

export interface FareQuote {
  totalAmount: number;
  farePrice: number;
  driverEarning: number;
  platformEarning: number;
  driverShareRate: number;
  taxAmount: number;
  taxRate: number;
  discountAmount: number;
  discountRate: number;
  baseAmount: number;
  commissionAmount: number;
  commissionRate: number;
  appliedFareRate: number;
  chargedDistance: number;
  minimumDistance: number;
  minimumApplied: boolean;
  currency: string;
  distanceUnit: string;
  [key: string]: any;
}

export interface GetFareQuoteResult {
  quote: FareQuote;
  countryId: string;
  flow: "direct" | "b2b";
}

export const getFareQuoteCallable = httpsCallable<GetFareQuoteParams, GetFareQuoteResult>(
  functions,
  "getFareQuote"
);

export interface CreateTripLegInput {
  distance: number;
  durationMinutes: number;
}

export interface CreateTripParams {
  countryId?: string;
  categoryId?: string;
  vehicleCategory?: "suv" | "pickup" | "microbus" | "standard" | string;
  distance?: number;
  durationMinutes?: number;
  legs?: CreateTripLegInput[];
  travellerId?: string;
  origin?: Record<string, unknown>;
  destination?: Record<string, unknown>;
  paymentMethod?: string;
}

export interface CreateTripLegResult {
  index: number;
  distance: number;
  durationMinutes: number;
  farePrice: number;
  driverEarning: number;
  commissionAmount: number;
  minimumApplied: boolean;
}

export interface CreateTripResponse {
  tripId: string;
  fareBreakdown: {
    countryId: string;
    currency: string;
    distanceUnit: "km" | "mi";
    chargedDistance: number;
    farePrice: number;
    driverEarning: number;
    commissionRate: number;
    commissionAmount: number;
    minimumApplied: boolean;
    pricingFormulaVersion: string;
  };
  legBreakdown: CreateTripLegResult[];
}

export interface ListTripsForUserParams {
  limit?: number;
  cursor?: string;
  role?: "passenger" | "driver";
}

export interface ListTripsForUserResponse {
  trips: Array<Record<string, any>>;
  nextCursor: string | null;
}

export interface WriteTripHistoryParams {
  tripId: string;
  rideId?: string;
  driverId: string;
  passengerName: string;
  passengerPhone?: string;
  origin: string | { address: string; latitude?: number; longitude?: number };
  destination: string | { address: string; latitude?: number; longitude?: number };
  distance?: number;
  etaMinutes: number;
  startedAt: number;
  completedAt: number;
  paymentMethod?: string;
}

export interface WriteTripHistoryResponse {
  historyId: string;
  alreadyExisted: boolean;
}

export interface CancelCompanyReservationParams {
  tripId: string;
}

export interface CancelCompanyReservationResponse {
  tripId: string;
  status: "cancelled";
  releasedAmount: number;
  alreadyCancelled: boolean;
}

export interface MarkDriverUnavailableParams {
  tripId: string;
  driverId?: string;
}

export interface MarkDriverUnavailableResponse {
  tripId: string;
  status: "seeking_driver";
  previousDriverId: string | null;
  alreadySeeking: boolean;
}

export const createTripCallable = httpsCallable<CreateTripParams, CreateTripResponse>(
  functions,
  "createTrip"
);

export const listTripsForUserCallable = httpsCallable<ListTripsForUserParams, ListTripsForUserResponse>(
  functions,
  "listTripsForUser"
);

export const writeTripHistoryCallable = httpsCallable<WriteTripHistoryParams, WriteTripHistoryResponse>(
  functions,
  "writeTripHistory"
);

export const cancelCompanyReservationCallable = httpsCallable<
  CancelCompanyReservationParams,
  CancelCompanyReservationResponse
>(functions, "cancelCompanyReservation");

export const markDriverUnavailableCallable = httpsCallable<
  MarkDriverUnavailableParams,
  MarkDriverUnavailableResponse
>(functions, "markDriverUnavailable");

// --- CF-30: Fleet Summary Callable ---
export interface GetFleetSummaryParams {
  includeInactive?: boolean;
  countryId?: string;
}

export interface GetFleetSummaryResponse {
  drivers: number;
  vehicles: number;
  byCategory: Array<{ categoryId: string; count: number }>;
  unclassified: number;
  unresolved: number;
}

export const getFleetSummaryCallable = httpsCallable<
  GetFleetSummaryParams,
  GetFleetSummaryResponse
>(functions, "getFleetSummary");

// --- CF-34: Country Membership Approval Callable ---
export interface ApproveCountryMembershipParams {
  userId: string;
  code: string;
}

export interface ApproveCountryMembershipResponse {
  success: boolean;
  userId: string;
  code: string;
  status: "active";
}

export const approveCountryMembershipCallable = httpsCallable<
  ApproveCountryMembershipParams,
  ApproveCountryMembershipResponse
>(functions, "approveCountryMembership");

// --- CF-36: Review Membership Document Callable ---
export interface ReviewMembershipDocumentParams {
  userId: string;
  code: string;
  type: string;
  decision: "accepted" | "rejected";
  rejectionReason?: string;
}

export interface ReviewMembershipDocumentResponse {
  userId: string;
  code: string;
  type: string;
  status: "accepted" | "rejected";
}

export const reviewMembershipDocumentCallable = httpsCallable<
  ReviewMembershipDocumentParams,
  ReviewMembershipDocumentResponse
>(functions, "reviewMembershipDocument");

// --- CF-37: Set Driver Verification Callable ---
export interface SetDriverVerificationParams {
  driverId: string;
  verified: boolean;
  reason?: string;
}

export interface SetDriverVerificationResponse {
  driverId: string;
  verificationStatus: "verified" | "rejected";
}

export const setDriverVerificationCallable = httpsCallable<
  SetDriverVerificationParams,
  SetDriverVerificationResponse
>(functions, "setDriverVerification");

// --- CF-31: Register Vehicle Callable ---
export interface RegisterVehicleParams {
  brand: string;
  model: string;
  plate: string;
  color?: string;
}

export interface RegisterVehicleResponse {
  vehicleId: string;
  categoryId: string;
  maxPassengers?: number;
}

export const registerVehicleCallable = httpsCallable<
  RegisterVehicleParams,
  RegisterVehicleResponse
>(functions, "registerVehicle");

// --- CF-32: List Company Trips Callable ---
export interface ListCompanyTripsParams {
  status?: string;
  limit?: number;
}

export interface ListCompanyTripsResponse {
  trips: Array<{
    tripId: string;
    status: string;
    requestedAt: string;
    totalAmount: number;
    categoryId?: string;
    originAddress?: string;
    destinationAddress?: string;
    driverId?: string;
    [key: string]: any;
  }>;
}

export const listCompanyTripsCallable = httpsCallable<
  ListCompanyTripsParams,
  ListCompanyTripsResponse
>(functions, "listCompanyTrips");

// --- CF-33: Get Company Period Summary Callable ---
export interface GetCompanyPeriodSummaryParams {
  at?: string;
}

export interface GetCompanyPeriodSummaryResponse {
  period: string;
  startsOn: string;
  endsOn: string;
  tripCount: number;
  excludedCount: number;
  billableTotal: number;
  taxTotal: number;
  commissionTotal: number;
  driverEarnings: Array<{ driverId: string; amount: number; tripCount: number }>;
}

export const getCompanyPeriodSummaryCallable = httpsCallable<
  GetCompanyPeriodSummaryParams,
  GetCompanyPeriodSummaryResponse
>(functions, "getCompanyPeriodSummary");

// --- CF-40: Reference Data and Future Rates Callables ---
export interface ScheduleReferenceChangeParams {
  path: string;
  field: string;
  newValue: any;
  effectiveFrom: string;
  reason: string;
}

export interface ScheduleReferenceChangeResponse {
  changeId: string;
  state: "pending";
  path: string;
  field: string;
  effectiveFrom: string;
}

export const scheduleReferenceChangeCallable = httpsCallable<
  ScheduleReferenceChangeParams,
  ScheduleReferenceChangeResponse
>(functions, "scheduleReferenceChange");

export interface CancelReferenceChangeParams {
  changeId: string;
}

export interface CancelReferenceChangeResponse {
  changeId: string;
  state: "cancelled";
}

export const cancelReferenceChangeCallable = httpsCallable<
  CancelReferenceChangeParams,
  CancelReferenceChangeResponse
>(functions, "cancelReferenceChange");

export interface ListReferenceChangesParams {
  state?: "pending" | "applied" | "cancelled";
  path?: string;
  limit?: number;
}

export interface ListReferenceChangesResponse {
  changes: Array<{
    id: string;
    path: string;
    field: string;
    newValue: any;
    previousValue?: any;
    effectiveFrom: string;
    state: "pending" | "applied" | "cancelled";
    reason: string;
    scheduledBy: string;
    scheduledAt: string;
    appliedAt?: string;
  }>;
}

export const listReferenceChangesCallable = httpsCallable<
  ListReferenceChangesParams,
  ListReferenceChangesResponse
>(functions, "listReferenceChanges");

// --- CF-42: listPlatformTrips ---
export interface ListPlatformTripsParams {
  countryId?: string;
  companyId?: string;
  status?: string;
  limit?: number;
}

export interface ListPlatformTripsResponse {
  trips: Array<{
    tripId: string;
    countryId: string;
    companyId?: string;
    status: string;
    requestedAt: string;
    totalAmount: number;
    categoryId?: string;
    originAddress?: string;
    destinationAddress?: string;
    driverId?: string;
    [key: string]: any;
  }>;
  count?: number;
}

export const listPlatformTripsCallable = httpsCallable<
  ListPlatformTripsParams,
  ListPlatformTripsResponse
>(functions, "listPlatformTrips");

// --- CF-43: createCompany ---
export interface CreateCompanyParams {
  countryId?: string;
  name: string;
  legalName?: string;
  nit: string;
  nrc?: string;
  billingPeriod: string;
  paymentCondition?: string;
  requiresCCF?: boolean;
  minimumBookingLeadMinutes: number;
  costCentre: {
    name: string;
    budgetLimit?: number;
  };
  fareRates?: Record<string, number>;
  admin: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface CreateCompanyResponse {
  countryId: string;
  companyId: string;
  costCentreId: string;
  fareRates: number;
  adminUid: string;
}

export const createCompanyCallable = httpsCallable<
  CreateCompanyParams,
  CreateCompanyResponse
>(functions, "createCompany");

// --- CF-39: createCompanyUser ---
export interface CreateCompanyUserParams {
  email: string;
  roleId: string;
  companyId?: string;
  countryId?: string;
  operatesInCountries?: string[];
  firstName?: string;
  lastName?: string;
}

export interface CreateCompanyUserResponse {
  uid: string;
  email: string;
  roleId: string;
  roleScope: "company" | "platform";
  companyId?: string;
  countryId?: string;
}

export const createCompanyUserCallable = httpsCallable<
  CreateCompanyUserParams,
  CreateCompanyUserResponse
>(functions, "createCompanyUser");

// --- CF-44: updateCompanyUser ---
export interface UpdateCompanyUserParams {
  userId: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
  companyId?: string | null;
  operatesInCountries?: string[];
  isActive?: boolean;
}

export interface UpdateCompanyUserResponse {
  userId: string;
  updated: string[];
}

export const updateCompanyUserCallable = httpsCallable<
  UpdateCompanyUserParams,
  UpdateCompanyUserResponse
>(functions, "updateCompanyUser");

// --- CF-45: listCompanyRates ---
export interface CompanyRateRow {
  categoryId: string;
  categoryName: string;
  fareRate: number;
  source: "negotiated" | "country";
  hasNegotiatedRate: boolean;
}

export interface ListCompanyRatesResponse {
  companyId: string;
  countryId: string;
  rates: CompanyRateRow[];
  counts: {
    negotiated: number;
    inherited: number;
    missing: number;
    total: number;
  };
}

export const listCompanyRatesCallable = httpsCallable<
  { companyId?: string; countryId?: string },
  ListCompanyRatesResponse
>(functions, "listCompanyRates");

// --- CF-46: createCostCentre, updateCostCentre, listCostCentres ---
export interface CostCentreRow {
  costCentreId: string;
  name: string;
  budgetLimit?: number;
  reserved: number;
  spent: number;
  active: boolean;
  budgetWindowStartAt?: number;
}

export const createCostCentreCallable = httpsCallable<
  {
    companyId?: string;
    countryId?: string;
    name: string;
    budgetLimit?: number;
  },
  CostCentreRow
>(functions, "createCostCentre");

export const updateCostCentreCallable = httpsCallable<
  {
    companyId?: string;
    countryId?: string;
    costCentreId: string;
    name?: string;
    budgetLimit?: number | null;
    active?: boolean;
  },
  CostCentreRow
>(functions, "updateCostCentre");

export const listCostCentresCallable = httpsCallable<
  { companyId?: string; countryId?: string },
  { costCentres: CostCentreRow[]; count: number }
>(functions, "listCostCentres");

// --- CF-47: createTraveller, updateTraveller, listTravellers ---
export interface TravellerRow {
  travellerId: string;
  name: string;
  documentNumber?: string;
  phone?: string;
  email?: string;
  active: boolean;
}

export const createTravellerCallable = httpsCallable<
  {
    companyId?: string;
    countryId?: string;
    name: string;
    documentNumber?: string;
    phone?: string;
    email?: string;
  },
  { travellerId: string }
>(functions, "createTraveller");

export const updateTravellerCallable = httpsCallable<
  {
    companyId?: string;
    countryId?: string;
    travellerId: string;
    name?: string;
    documentNumber?: string;
    phone?: string;
    email?: string;
    active?: boolean;
  },
  { travellerId: string }
>(functions, "updateTraveller");

export const listTravellersCallable = httpsCallable<
  { companyId?: string; countryId?: string },
  { travellers: TravellerRow[]; count: number }
>(functions, "listTravellers");

// --- CF-48 / CF-54 / CF-86: createScheduledTrip, createScheduledTripForCompany, cancelScheduledTrip ---
export const createScheduledTripCallable = httpsCallable<
  {
    travellerId: string;
    passengerCount: number;
    scheduledPickupAt: string;
    originAddress: string;
    originLatitude: number;
    originLongitude: number;
    destinationAddress: string;
    destinationLatitude: number;
    destinationLongitude: number;
    legs: Array<{ distance: number; durationMinutes: number }>;
    rideTimeMinutes: number;
    etaMinutes: number;
    paymentMethod: string;
    countryId?: string;
    companyId?: string;
    costCentreId?: string;
    vehicleCategory?: string;
    passengerName?: string;
    passengerPhone?: string;
  },
  {
    scheduledTripId: string;
    folio: string;
    status: "available";
    countryId: string;
    companyId: string;
    travellerId: string;
    scheduledPickupAt: string;
    passengerCount: number;
    categoryId: string;
    quote: FareQuote;
    ceilingReservedAt: string;
    ceilingReservedAmount: number;
    costCentreId: string;
  }
>(functions, "createScheduledTrip");

// CF-86: Operaciones de plataforma sobre reservas B2B (SuperAdmin / Admin)
export const createScheduledTripForCompanyCallable = httpsCallable<
  {
    companyId: string;
    countryId?: string;
    travellerId: string;
    costCentreId?: string;
    passengerCount: number;
    scheduledPickupAt: string;
    originAddress?: string;
    originLatitude?: number;
    originLongitude?: number;
    destinationAddress?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    legs: Array<{ distance: number; durationMinutes: number }>;
    rideTimeMinutes?: number;
    etaMinutes?: number;
    paymentMethod?: string;
    reason: string;
  },
  {
    scheduledTripId: string;
    folio: string;
    status: "available";
    countryId: string;
    companyId: string;
    travellerId: string;
    scheduledPickupAt: string;
    passengerCount: number;
    categoryId: string;
    quote: FareQuote;
    ceilingReservedAt: string;
    ceilingReservedAmount: number;
    costCentreId: string;
  }
>(functions, "createScheduledTripForCompany");

export const assignScheduledTripDriverCallable = httpsCallable<
  {
    scheduledTripId: string;
    driverId: string;
    vehicleId: string;
    reason: string;
  },
  {
    scheduledTripId: string;
    status: "driver_assigned";
    driverId: string;
    vehicleId: string;
  }
>(functions, "assignScheduledTripDriver");

export const releaseScheduledTripByPlatformCallable = httpsCallable<
  {
    scheduledTripId: string;
    reason: string;
  },
  {
    scheduledTripId: string;
    status: "available";
  }
>(functions, "releaseScheduledTripByPlatform");

export const cancelScheduledTripCallable = httpsCallable<
  { scheduledTripId: string; reason?: string },
  {
    scheduledTripId: string;
    status: "cancelled";
    costCentreId: string;
    releasedAmount: number;
  }
>(functions, "cancelScheduledTrip");

// --- CF-49: updateOperationsConfig ---
export const updateOperationsConfigCallable = httpsCallable<
  {
    deadTimeMinutes: number;
    reminderLeadMinutes: number;
    assignmentWaitMinutes: number;
    adminPortalUrl: string;
    companyPortalUrl: string;
    reason: string;
  },
  {
    operations: {
      deadTimeMinutes: number;
      reminderLeadMinutes: number;
      assignmentWaitMinutes: number;
      adminPortalUrl: string;
      companyPortalUrl: string;
    };
    changedFields: string[];
  }
>(functions, "updateOperationsConfig");

// --- CF-57: listEligibleDrivers ---
export interface EligibleDriverView {
  driverId: string;
  name: string;
  phone?: string;
  vehicleId: string;
  plate: string;
  categoryId: string;
  brand: string;
  model: string;
  verificationStatus: string;
  online: boolean;
  active: boolean;
  activeTrip: boolean;
}

export const listEligibleDriversCallable = httpsCallable<
  {
    categoryId: string;
    countryId?: string;
    tripId?: string;
    scheduledTripId?: string;
    limit?: number;
  },
  { drivers: EligibleDriverView[]; count: number }
>(functions, "listEligibleDrivers");

// --- CF-58: assignDriver ---
export const assignDriverCallable = httpsCallable<
  { tripId: string; driverId: string; reason?: string },
  {
    tripId: string;
    driverId: string;
    status: "offered";
    assignmentSequence: number;
    notified: boolean;
    idempotent?: boolean;
  }
>(functions, "assignDriver");

// --- CF-59: offerScheduledTrip ---
export const offerScheduledTripCallable = httpsCallable<
  { scheduledTripId: string; driverId: string },
  {
    scheduledTripId: string;
    status: "offered";
    offeredDriverId: string;
    notified: boolean;
  }
>(functions, "offerScheduledTrip");

// --- CF-60: reassignDriver ---
export const reassignDriverCallable = httpsCallable<
  { tripId: string; driverId?: string; newDriverId?: string; reason?: string },
  {
    tripId: string;
    driverId: string;
    previousDriverId: string;
    status: "offered";
    assignmentSequence: number;
    notified: boolean;
  }
>(functions, "reassignDriver");

// --- CF-61: listTripEvents ---
export interface TripEventRow {
  eventId: string;
  tripId?: string;
  scheduledTripId?: string;
  countryId: string;
  companyId?: string;
  driverId?: string;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  actorType?: string;
  actorUid?: string;
  source?: string;
  reason?: string;
  at: string;
}

export const listTripEventsCallable = httpsCallable<
  {
    tripId?: string;
    countryId?: string;
    companyId?: string;
    driverId?: string;
    from?: string;
    to?: string;
    limit?: number;
  },
  { events: TripEventRow[]; count: number }
>(functions, "listTripEvents");

// --- CF-62, CF-63, CF-64: reportTripIncident, listTripIncidents, resolveTripIncident ---
export type IncidentType =
  | "accident"
  | "breakdown"
  | "route_deviation"
  | "passenger_no_show"
  | "driver_no_show"
  | "safety"
  | "payment"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export const reportTripIncidentCallable = httpsCallable<
  {
    tripId: string;
    type: IncidentType;
    severity: IncidentSeverity;
    description: string;
    occurredAt?: string;
    attachments?: string[];
    requestId?: string;
  },
  {
    incidentId: string;
    tripId: string;
    status: "open";
    type: IncidentType;
    severity: IncidentSeverity;
    idempotent?: boolean;
  }
>(functions, "reportTripIncident");

export interface TripIncidentRow {
  incidentId: string;
  tripId: string;
  countryId: string;
  companyId?: string;
  driverId?: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: "open" | "under_review" | "resolved" | "dismissed";
  description: string;
  attachments?: string[];
  occurredAt: string;
  reportedAt: string;
  tripStatusAtReport?: string;
  resolvedAt?: string;
  resolutionCode?: string;
  resolutionNote?: string;
}

export const listTripIncidentsCallable = httpsCallable<
  {
    tripId?: string;
    countryId?: string;
    companyId?: string;
    status?: "open" | "under_review" | "resolved" | "dismissed";
    type?: IncidentType;
    limit?: number;
  },
  { incidents: TripIncidentRow[]; count: number }
>(functions, "listTripIncidents");

export const resolveTripIncidentCallable = httpsCallable<
  {
    incidentId: string;
    resolutionCode:
      | "no_action"
      | "driver_warning"
      | "company_credit"
      | "trip_cancelled"
      | "trip_refunded"
      | "other";
    resolutionNote?: string;
    moneyEffect?: {
      kind: "credit" | "refund" | "none";
      amount: number;
      currencyCode: string;
    };
  },
  {
    incidentId: string;
    tripId: string;
    status: "resolved" | "dismissed";
    resolutionCode: string;
    moneyEffectApplied: boolean;
  }
>(functions, "resolveTripIncident");

// --- CF-68: cancelTrip ---
export const cancelTripCallable = httpsCallable<
  { rideId: string; reason?: string },
  {
    rideId: string;
    status: "cancelled";
    cancelledBy: string;
    actor: string;
    cancelledAt: string;
    idempotent?: boolean;
  }
>(functions, "cancelTrip");

// --- CF-67: completeRide ---
export const completeRideCallable = httpsCallable<
  { rideId: string },
  {
    rideId: string;
    status: "completed";
    driverId: string;
    completedAt: string;
    idempotent?: boolean;
  }
>(functions, "completeRide");

// --- completeTrip ---
export const completeTripCallable = httpsCallable<
  { tripId: string },
  { tripId: string; status: "completed" }
>(functions, "completeTrip");

// --- dispatchScheduledTrip ---
export const dispatchScheduledTripCallable = httpsCallable<
  { scheduledTripId: string },
  { scheduledTripId: string; status: string; tripId: string; rideRequestId: string; driverId: string }
>(functions, "dispatchScheduledTrip");

// --- notifyClientDriverArrived ---
export const notifyClientDriverArrivedCallable = httpsCallable<
  { rideId: string; driverId: string; clientId: string; pickupAddress?: string; driverName?: string; driverVehicle?: string },
  { success: boolean }
>(functions, "notifyClientDriverArrived");

// --- startTrip ---
export const startTripCallable = httpsCallable<
  { rideId: string },
  { rideId: string; status: string; startedAt: string; idempotent?: boolean }
>(functions, "startTrip");

// --- listVehicleTypes ---
export interface VehicleTypeSummary {
  id: string;
  name: string;
  definition: string;
  hasCargoBed: boolean;
  b2bSuitable: boolean;
  selectable: boolean;
  sortOrder: number;
  models: Array<{ maxPassengers?: number; [key: string]: unknown }>;
}

export const listVehicleTypesCallable = httpsCallable<
  { b2bSuitable?: boolean; minPassengers?: number },
  { types: VehicleTypeSummary[]; modelsWithoutCapacity: unknown[] }
>(functions, "listVehicleTypes");

// --- CF-74: updateCompanyCapabilities ---
export interface UpdateCompanyCapabilitiesParams {
  companyId: string;
  allowsImmediateTrips: boolean;
  allowsScheduledTrips: boolean;
  minimumBookingLeadMinutes: number;
  reason?: string;
}

export interface UpdateCompanyCapabilitiesResponse {
  companyId: string;
  capabilities: {
    allowsImmediateTrips: boolean;
    allowsScheduledTrips: boolean;
    minimumBookingLeadMinutes: number;
  };
  changedFields: string[];
}

export const updateCompanyCapabilitiesCallable = httpsCallable<
  UpdateCompanyCapabilitiesParams,
  UpdateCompanyCapabilitiesResponse
>(functions, "updateCompanyCapabilities");

// --- CF-76: listPlatformScheduledTrips ---
export interface PlatformScheduledTripRow {
  scheduledTripId: string;
  status: string;
  scheduledPickupAt: string;
  categoryId: string;
  originAddress: string;
  destinationAddress: string;
  totalAmount: number;
  currencyCode: string;
  travellerId?: string;
  acceptedVehicleId?: string;
  companyId?: string;
  lastDispatchBlock: {
    code: string;
    vehicleId: string;
    at: string;
    source: string;
  } | null;
}

export interface ListPlatformScheduledTripsParams {
  countryId?: string;
  companyId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const listPlatformScheduledTripsCallable = httpsCallable<
  ListPlatformScheduledTripsParams,
  { scheduledTrips: PlatformScheduledTripRow[]; count: number }
>(functions, "listPlatformScheduledTrips");

// --- CF-84: listCostCentreRequests y resolveCostCentreRequest ---
export interface CostCentreRequestRow {
  requestId: string;
  countryId: string;
  companyId: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  proposedName: string;
  proposedBudgetLimit?: number;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdCostCentreId: string | null;
}

export const listCostCentreRequestsCallable = httpsCallable<
  {
    countryId?: string;
    status?: "pending" | "approved" | "rejected";
    limit?: number;
  },
  { requests: CostCentreRequestRow[]; count: number }
>(functions, "listCostCentreRequests");

export const resolveCostCentreRequestCallable = httpsCallable<
  {
    requestId: string;
    companyId: string;
    countryId?: string;
    decision: "approved" | "rejected";
    rejectionReason?: string;
  },
  {
    requestId: string;
    status: "approved" | "rejected";
    createdCostCentreId: string | null;
  }
>(functions, "resolveCostCentreRequest");

// --- updateCompany (desplegado 2026-11-06) ---
export interface UpdateCompanyParams {
  companyId: string;
  countryId?: string;
  tradeName?: string;
  legalName?: string;
  nit?: string;
  nrc?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
  address?: string;
  paymentCondition?: string;
  billingPeriod?: string;
  requiresCCF?: boolean;
  status?: "active" | "suspended";
  fareRates?: Record<string, number>;
  reason?: string;
}

export interface UpdateCompanyResponse {
  companyId: string;
  changedFields: string[];
}

export const updateCompanyCallable = httpsCallable<
  UpdateCompanyParams,
  UpdateCompanyResponse
>(functions, "updateCompany");

// --- CF-87: reportTripProblem y reassignTripDriver (2026-11-08) ---
export interface ReportTripProblemParams {
  tripId: string;
  reason: string;
  latitude?: number;
  longitude?: number;
}

export interface ReportTripProblemResponse {
  tripId: string;
  previousStatus: string | null;
  status: "seeking_driver";
  previousDriverId: string | null;
  reportedBy: "driver" | "platform";
  reason: string;
  ceilingTouched: false;
  reservationUntouched: true;
}

export const reportTripProblemCallable = httpsCallable<
  ReportTripProblemParams,
  ReportTripProblemResponse
>(functions, "reportTripProblem");

export interface ReassignTripDriverParams {
  tripId: string;
  driverId: string;
  reason: string;
}

export interface ReassignTripDriverResponse {
  tripId: string;
  status: "in_progress";
  driverId: string;
  previousDriverId: string | null;
  reason: string;
  ceilingTouched: false;
  reservationUntouched: true;
  startedAtUntouched: true;
}

export const reassignTripDriverCallable = httpsCallable<
  ReassignTripDriverParams,
  ReassignTripDriverResponse
>(functions, "reassignTripDriver");

export interface PlatformSetRideStatusParams {
  tripId: string;
  targetStatus: string;
  reason: string;
  driverId?: string;
  vehicleId?: string;
}

export interface PlatformSetRideStatusResponse {
  success: boolean;
  tripId: string;
  status: string;
  updatedAt: number;
}

export const platformSetRideStatusCallable = httpsCallable<
  PlatformSetRideStatusParams,
  PlatformSetRideStatusResponse
>(functions, "platformSetRideStatus");





