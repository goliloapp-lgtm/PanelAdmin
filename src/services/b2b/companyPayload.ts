import { B2BCompany } from "@/types/b2b";

export type CreateCompanyFormInput = Omit<
  B2BCompany,
  "id" | "createdAt" | "updatedAt"
> & {
  fareRatesList?: Array<{ categoryId: string; fareRate: number | string }>;
  costCentreName?: string;
  minimumBookingLeadMinutes?: number;
};

export interface CreateCompanyCallablePayload {
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

/**
 * Normaliza `budgetLimit` según CF-23:
 * `null` o `undefined` = SIN LÍMITE (jamás coercer a 0).
 * Número >= 0 = techo efectivo en USD (`0` bloquea el despacho).
 */
export function normalizeBudgetLimitValue(
  raw: number | null | undefined
): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parsePositiveRate(raw: unknown, fallback?: number): number | undefined {
  const num = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (Number.isFinite(num) && num > 0) {
    return num;
  }
  return fallback;
}

/**
 * Convierte la tarifa negociada o `fareRatesList` en el mapa `{ [categoryId]: fareRate }`
 * que exige el backend en `createCompany` (`Record<string, number>`).
 */
export function buildCreateCompanyFareRatesMap(
  data: Pick<CreateCompanyFormInput, "fareRatesList" | "negotiatedFareRate">
): Record<string, number> {
  if (Array.isArray(data.fareRatesList) && data.fareRatesList.length > 0) {
    const map: Record<string, number> = {};
    for (const item of data.fareRatesList) {
      const categoryId =
        typeof item?.categoryId === "string" ? item.categoryId.trim() : "";
      const fareRate = parsePositiveRate(item?.fareRate);
      if (categoryId && fareRate !== undefined) {
        map[categoryId] = fareRate;
      }
    }
    return map;
  }

  const negotiatedFareRate = parsePositiveRate(data.negotiatedFareRate, 0.67) ?? 0.67;
  return { suv: negotiatedFareRate };
}

/**
 * Construye el payload exacto que espera el callable `createCompany` (CF-43).
 */
export function buildCreateCompanyPayload(
  data: CreateCompanyFormInput
): CreateCompanyCallablePayload {
  const { initialPassword: _ignoredPassword, ...companyData } = data;
  const countryCode = (companyData.countryId || "sv").toLowerCase();
  const initialBudgetLimit = normalizeBudgetLimitValue(companyData.creditLimit);
  const [firstName, ...restName] = (
    companyData.contactName || "Administrador Corporativo"
  )
    .trim()
    .split(/\s+/);
  const lastName = restName.join(" ") || "Corporativo";

  const leadMinutes = Number(data.minimumBookingLeadMinutes);
  const minimumBookingLeadMinutes =
    data.minimumBookingLeadMinutes !== undefined &&
    data.minimumBookingLeadMinutes !== null &&
    Number.isFinite(leadMinutes) &&
    leadMinutes >= 0
      ? Math.round(leadMinutes)
      : 180;

  const fareRates = buildCreateCompanyFareRatesMap(data);

  return {
    countryId: countryCode,
    name: (companyData.tradeName || companyData.legalName).trim(),
    legalName: (companyData.legalName || companyData.tradeName).trim(),
    nit: companyData.nit.trim(),
    ...(companyData.nrc?.trim() ? { nrc: companyData.nrc.trim() } : {}),
    billingPeriod: companyData.billingPeriod || "monthly",
    paymentCondition: companyData.paymentCondition || "credit30",
    requiresCCF: Boolean(companyData.requiresCCF),
    minimumBookingLeadMinutes,
    costCentre: {
      name: (data.costCentreName || "Operaciones Corporativas").trim(),
      ...(initialBudgetLimit !== null && initialBudgetLimit > 0
        ? { budgetLimit: Math.round(initialBudgetLimit) }
        : {}),
    },
    ...(Object.keys(fareRates).length > 0 ? { fareRates } : {}),
    admin: {
      email: companyData.email.trim().toLowerCase(),
      firstName: firstName || "Admin",
      lastName,
    },
  };
}
