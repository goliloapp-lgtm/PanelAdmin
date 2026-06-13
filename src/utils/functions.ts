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



