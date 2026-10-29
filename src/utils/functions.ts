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
  locale?: "en" | "es";
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
  email: string;
  displayName?: string;
  locale?: "en" | "es";
}

export interface SendWelcomeEmailResponse {
  success: boolean;
  message: string;
}

export interface RequestPasswordResetCodeParams {
  email: string;
  locale?: "en" | "es";
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

export interface RequestAccountDeletionCodeParams {
  locale?: "en" | "es";
}

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
  origin: string;
  destination: string;
  distance: number;
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

