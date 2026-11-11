import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

import { formatFriendlyError } from "@/utils/friendlyError";
import { buildCreateCompanyPayload } from "@/services/b2b/companyPayload";

const require = createRequire(import.meta.url);
const backendCreateCompany = require(
  path.resolve(__dirname, "../../backend/functions/lib/b2b/createCompany.js")
);

const {
  readMinimumBookingLeadMinutes,
  readPaymentCondition,
  readRequiresCCF,
  validateBillingPeriod,
  validateCompanyAdmin,
  validateCompanyBasics,
  validateCostCentre,
  validateFareRates,
} = backendCreateCompany as {
  readMinimumBookingLeadMinutes: (raw: unknown) => number;
  readPaymentCondition: (raw: unknown) => string;
  readRequiresCCF: (raw: unknown) => boolean;
  validateBillingPeriod: (raw: unknown, active: readonly string[]) => string;
  validateCompanyAdmin: (raw: unknown) => Record<string, unknown>;
  validateCompanyBasics: (raw: unknown) => Record<string, unknown>;
  validateCostCentre: (raw: unknown) => Record<string, unknown>;
  validateFareRates: (
    raw: unknown,
    knownCategoryIds: readonly string[]
  ) => Record<string, number>;
};

const KNOWN_B2B_CATEGORIES = ["suv", "pickup-doble-cabina", "microbus"];
const ACTIVE_CADENCES = ["daily", "weekly", "semi-monthly", "monthly"];

function buildBaseFormData(overrides: Record<string, unknown> = {}) {
  return {
    tradeName: "Distribuidora Central",
    legalName: "Distribuidora Central S.A. de C.V.",
    nit: "0614-010190-101-1",
    nrc: "123456-7",
    contactName: "Juan Pérez",
    phone: "+503 2222-0000",
    whatsapp: "+503 7777-0000",
    email: "Admin@Empresa.com",
    address: "Colonia Escalón, San Salvador",
    paymentCondition: "credit_30" as const,
    billingPeriod: "monthly" as const,
    negotiatedFareRate: 0.67,
    minimumBookingLeadMinutes: 180,
    creditLimit: 5000,
    requiresInvoice: true,
    requiresCCF: false,
    balance: 0,
    status: "active" as const,
    countryId: "sv" as const,
    ...overrides,
  };
}

test("buildCreateCompanyPayload emite fareRates como objeto mapa compatible con createCompany del backend", () => {
  const payload = buildCreateCompanyPayload(buildBaseFormData() as any);

  assert.equal(Array.isArray(payload.fareRates), false);
  assert.deepEqual(payload.fareRates, { suv: 0.67 });

  assert.doesNotThrow(() => validateCompanyBasics(payload));
  assert.equal(validateBillingPeriod(payload.billingPeriod, ACTIVE_CADENCES), "monthly");
  assert.equal(readPaymentCondition(payload.paymentCondition), "credit_30");
  assert.equal(readRequiresCCF(payload.requiresCCF), false);
  assert.equal(readMinimumBookingLeadMinutes(payload.minimumBookingLeadMinutes), 180);
  assert.doesNotThrow(() => validateCostCentre(payload.costCentre));
  assert.doesNotThrow(() => validateCompanyAdmin(payload.admin));

  const validatedRates = validateFareRates(payload.fareRates, KNOWN_B2B_CATEGORIES);
  assert.deepEqual(validatedRates, { suv: 0.67 });
});

test("buildCreateCompanyPayload mapea fareRatesList a Record<categoryId, fareRate> y convierte strings numéricos", () => {
  const payload = buildCreateCompanyPayload(
    buildBaseFormData({
      negotiatedFareRate: "0.85",
      fareRatesList: [
        { categoryId: " suv ", fareRate: "0.75" },
        { categoryId: "microbus", fareRate: 1.2 },
      ],
    }) as any
  );

  assert.equal(Array.isArray(payload.fareRates), false);
  assert.deepEqual(payload.fareRates, { suv: 0.75, microbus: 1.2 });

  const validatedRates = validateFareRates(payload.fareRates, KNOWN_B2B_CATEGORIES);
  assert.deepEqual(validatedRates, { suv: 0.75, microbus: 1.2 });
});

test("buildCreateCompanyPayload respeta negotiatedFareRate como string numérico cuando no se pasa fareRatesList", () => {
  const payload = buildCreateCompanyPayload(
    buildBaseFormData({ negotiatedFareRate: "0.92" }) as any
  );

  assert.deepEqual(payload.fareRates, { suv: 0.92 });
  assert.deepEqual(validateFareRates(payload.fareRates, KNOWN_B2B_CATEGORIES), { suv: 0.92 });
});

test("formatFriendlyError no colapsa errores distintos de fareRates del alta B2B", () => {
  const genericRateMsg =
    "No se pudo calcular la tarifa para la categoría de vehículo seleccionada.";

  const msgCaseA = formatFriendlyError(
    new Error('createCompany requires "fareRates" to be an object keyed by categoryId.')
  );
  assert.notEqual(msgCaseA, genericRateMsg);
  assert.match(msgCaseA, /formato|mapa|fareRates/i);

  const msgCaseB1 = formatFriendlyError(
    new Error(
      "fareRates.sedan is not a B2B-enabled category in vehicleCategories. The known categories are: suv, microbus."
    )
  );
  assert.notEqual(msgCaseB1, genericRateMsg);
  assert.match(msgCaseB1, /sedan/i);
  assert.match(msgCaseB1, /B2B|habilitada/i);

  const msgCaseB2 = formatFriendlyError(
    new Error(
      "fareRates.suv is 0, which is not a rate greater than zero. A zero would be read as a price and would quote for free."
    )
  );
  assert.notEqual(msgCaseB2, genericRateMsg);
  assert.match(msgCaseB2, /suv/i);
  assert.match(msgCaseB2, /mayor a \$?0/i);

  const msgQuote = formatFriendlyError(
    new Error("vehicle category fareRate missing for this trip")
  );
  assert.equal(msgQuote, genericRateMsg);
});
