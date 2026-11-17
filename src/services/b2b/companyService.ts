import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "@/utils/firebase";
import {
  createCompanyCallable,
  updateCompanyCallable,
  createCompanyUserCallable,
  updateCompanyUserCallable,
  listCompanyRatesCallable,
  createCostCentreCallable,
  updateCostCentreCallable,
  listCostCentresCallable,
  createTravellerCallable,
  updateTravellerCallable,
  listTravellersCallable,
} from "@/utils/functions";
import {
  B2BCompany,
  B2BTraveller,
  BillingCadenceDocument,
  CostCenter,
  LimitRequest,
} from "@/types/b2b";
import {
  buildCreateCompanyFareRatesMap,
  buildCreateCompanyPayload,
  normalizeBudgetLimitValue,
  type CreateCompanyFormInput,
} from "./companyPayload";

export { buildCreateCompanyFareRatesMap, buildCreateCompanyPayload };

const getCompanyCol = (countryCode: string) =>
  collection(db, "countries", countryCode.toLowerCase(), "b2bCompanies");

// Sin default: el país del path es una decisión del llamador. Completar "sv"
// acá era la puerta por la que una empresa de otro país se leía y se escribía
// en El Salvador.
const getCompanyDoc = (companyId: string, countryCode: string) =>
  doc(db, "countries", countryCode.toLowerCase(), "b2bCompanies", companyId);

const BILLING_CADENCES_COLLECTION = "billingCadences";

export const getBillingCadences = async (): Promise<BillingCadenceDocument[]> => {
  try {
    await auth.authStateReady();
    const snapshot = await getDocs(collection(db, BILLING_CADENCES_COLLECTION));
    if (snapshot.empty) {
      return [];
    }
    const list = snapshot.docs.map((docSnap) => ({
      id: docSnap.id as BillingCadenceDocument["id"],
      ...(docSnap.data() as Omit<BillingCadenceDocument, "id">),
    }));
    return list.sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
  } catch (error) {
    console.warn("[companyService] Error fetching billing cadences:", error);
    return [];
  }
};

const sortCompaniesDesc = (companies: B2BCompany[]): B2BCompany[] => {
  return companies.sort((a, b) => {
    const timeA =
      (a.createdAt as any)?.toMillis?.() ||
      ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
    const timeB =
      (b.createdAt as any)?.toMillis?.() ||
      ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
    return timeB - timeA;
  });
};

/**
 * `countryCode` es el país del PATH del que se leyó el documento y manda sobre
 * `raw.countryId`: es el path que la regla evaluó, y una fila que pierde su país
 * no se puede editar después (`getCompanyDoc`/`updateB2BCompany` caen a `"sv"`).
 */
const mapCompanySnap = (
  id: string,
  raw: Record<string, any>,
  countryCode?: string
): B2BCompany =>
  ({
    id,
    ...raw,
    tradeName: raw.tradeName || raw.name || raw.legalName || "Empresa B2B",
    legalName: raw.legalName || raw.name || raw.tradeName || "Empresa B2B",
    contactName: raw.contactName || raw.contactPerson || "Contacto Corporativo",
    // EL CONTRATO PRIMERO. El documento convivía con campos legacy (`phone`,
    // `whatsapp`, `address`) que el panel ya no escribe: leerlos primero mostraba el
    // valor VIEJO aunque el nuevo estuviera guardado en `contactPhone`,
    // `contactWhatsapp` y `contactAddress`. Y `email` no miraba `contactEmail`, así
    // que el correo recién guardado se veía vacío. Los legacy quedan de respaldo y
    // no se inventa ningún teléfono: un contacto inventado es peor que uno vacío.
    phone: raw.contactPhone || raw.phone || "",
    whatsapp: raw.contactWhatsapp || raw.whatsapp || raw.phone || "",
    email: raw.contactEmail || raw.email || "",
    // El documento guarda `contactAddress`. Leer `raw.address` devolvia siempre el
    // default, asi que el formulario mostraba una direccion que nadie escribio.
    address: raw.contactAddress || raw.address || "",
    // La condición de pago NO se inventa. El mapeo ponía `credit30` cuando el
    // documento no la tenía, y la consola pintaba «Crédito 30» para una empresa sin
    // condición: alguien podía facturar a crédito por un valor que nadie eligió. Vacío
    // obliga a elegirla en el formulario, que la exige.
    paymentCondition: (raw.paymentCondition ||
      "") as B2BCompany["paymentCondition"],
    billingPeriod: raw.billingPeriod || "monthly",
    // Ausente es `false`: el documento no pidió comprobante.
    requiresInvoice: raw.requiresInvoice === true,
    requiresCCF: Boolean(raw.requiresCCF),
    balance: typeof raw.balance === "number" ? raw.balance : 0,
    status: raw.status || "active",
    countryId: (countryCode || raw.countryId || "sv").toLowerCase(),
  }) as B2BCompany;

/**
 * Países donde opera la cuenta, leídos del claim `countryIds` del ID token.
 *
 * Son exactamente los que evalúa `isInCountry(countryId)` en firestore.rules,
 * así que no se derivan de otro campo ni se completan con `"sv"`: un operador
 * con `countryIds: ["ve"]` no tiene permiso en `countries/sv` y esa lectura se
 * denegaría. Una lista ausente o vacía significa "la cuenta no declara países
 * donde operar", no "opera en El Salvador".
 *
 * La única excepción es la cuenta `superAdmin`: la regla de
 * `countries/{cc}/b2bCompanies` la admite por `isSuperAdmin()` sin mirar
 * `countryIds`, y `countryIds` puede quedar vacío de verdad (`createPlatformUser`
 * lo acuña como `[]`). Para esa identidad la lista sale del catálogo `countries`,
 * así ve el directorio completo en vez de quedarse sin una sola consulta.
 */
export const getOperatingCountriesFromClaims = async (): Promise<string[]> => {
  await auth.authStateReady();
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const tokenResult = await currentUser.getIdTokenResult();
  // El claim que evalúa `isSuperAdmin()` en las reglas; el mismo nombre que lee
  // `adminCheck` en el resto de la consola.
  const superAdmin = tokenResult.claims.superAdmin === true;
  const claimedCountries = tokenResult.claims.countryIds;
  const countries = Array.isArray(claimedCountries)
    ? Array.from(
        new Set(
          claimedCountries
            .filter((code): code is string => typeof code === "string")
            .map((code) => code.trim().toLowerCase())
            .filter((code) => code.length > 0)
        )
      )
    : [];

  if (countries.length > 0) return countries;

  // Sin `countryIds` una cuenta común no tiene cartera que leer y la pantalla lo
  // explica. El superAdmin sí: `isSuperAdmin()` es el término de la regla de
  // `b2bCompanies` que no mira países, y el catálogo `countries` es legible por
  // cualquier autenticado. Se suscribe a todos sus países.
  if (!superAdmin) return [];

  return await getAllCountryCodes();
};

/**
 * Códigos de país del catálogo `countries`. El ID del documento ES el código ISO
 * en minúsculas (`seedCountries.ts`), así que no se lee ningún campo ni hace
 * falta un `where`: el bloque `match /countries/{countryId}` permite `read` a
 * cualquier autenticado.
 *
 * Sin filtro de campo a propósito: `isOperable` distingue si el país cotiza —
 * `ve` es `false` y aun así guarda la cartera real de pruebas, filtrarla
 * escondería empresas — y `isActive` no separa carteras.
 */
const getAllCountryCodes = async (): Promise<string[]> => {
  const snapshot = await getDocs(collection(db, "countries"));
  return snapshot.docs
    .map((docSnap) => docSnap.id.trim().toLowerCase())
    .filter((code) => code.length > 0);
};

/** Fallo de lectura de UN país dentro de una suscripción multi-país. */
export interface B2BCompaniesCountryFailure {
  countryCode: string;
  failedCountries: string[];
}

/**
 * Suscribe a `countries/<país>/b2bCompanies` para cada país donde la cuenta
 * puede operar y entrega UNA sola lista fusionada.
 *
 * - Se abre un `onSnapshot` por país (`N` países ⇒ `N` snapshots).
 * - Las filas se de-duplican por `countryId + id` y se ordenan con el mismo
 *   criterio global (`sortCompaniesDesc`), no por concatenación de países.
 * - Si un país falla y otro responde, se entregan las filas leídas y el fallo
 *   parcial sale por `onPartialError` (aviso no destructivo). `onError` se llama
 *   sólo cuando fallaron TODOS los países: ahí no queda ninguna fila creíble.
 */
export const subscribeToB2BCompaniesByCountries = (
  countries: string[],
  callback: (companies: B2BCompany[]) => void,
  onError?: (error: any) => void,
  onPartialError?: (failure: B2BCompaniesCountryFailure) => void
) => {
  const normalizedCountries = Array.from(
    new Set(
      countries
        .map((code) => (typeof code === "string" ? code.trim().toLowerCase() : ""))
        .filter((code) => code.length > 0)
    )
  );

  if (normalizedCountries.length === 0) {
    // Sin países declarados no hay colección que leer: consultar sólo produciría
    // un permiso denegado. La pantalla explica el caso con su propio mensaje.
    return () => {};
  }

  const rowsByCountry = new Map<string, B2BCompany[]>();
  const failedCountries = new Set<string>();
  const unsubscribers: Array<() => void> = [];
  let cancelled = false;

  const emitMerged = () => {
    // El país forma parte de la identidad de la fila: dos países pueden tener el
    // mismo id de documento y uno no puede tapar al otro.
    const byCountryAndId = new Map<string, B2BCompany>();
    rowsByCountry.forEach((rows) => {
      rows.forEach((company) => {
        byCountryAndId.set(`${company.countryId}:${company.id}`, company);
      });
    });

    // El orden es global (alta descendente) sobre la lista fusionada.
    callback(sortCompaniesDesc(Array.from(byCountryAndId.values())));
  };

  auth.authStateReady().then(() => {
    if (cancelled) return;

    normalizedCountries.forEach((countryCode) => {
      unsubscribers.push(
        onSnapshot(
          getCompanyCol(countryCode),
          (snapshot) => {
            rowsByCountry.set(
              countryCode,
              snapshot.docs.map((docSnap) =>
                mapCompanySnap(docSnap.id, docSnap.data(), countryCode)
              )
            );
            failedCountries.delete(countryCode);
            emitMerged();
          },
          (error) => {
            console.warn(
              "[companyService] Firestore read error on companies:",
              countryCode,
              error?.code || error?.message
            );
            failedCountries.add(countryCode);

            if (failedCountries.size === normalizedCountries.length) {
              // Fallo TOTAL: ningún país respondió y la pantalla vacía la lista
              // porque no hay fila creíble que mostrar.
              if (onError) onError(error);
              return;
            }

            // Fallo PARCIAL: las filas ya entregadas por otros países se
            // conservan; la pantalla advierte la cobertura incompleta.
            if (onPartialError) {
              onPartialError({
                countryCode,
                failedCountries: Array.from(failedCountries),
              });
            }
          }
        )
      );
    });
  });

  return () => {
    cancelled = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

/**
 * Lectura de UN país: la firma que siguen usando las pantallas SV-only
 * (DashboardB2B, DocumentosSV y Solicitudes). El directorio de Empresas ya no la
 * usa — lee los países del token con `subscribeToB2BCompaniesByCountries`.
 */
export const subscribeToB2BCompanies = (
  callback: (companies: B2BCompany[]) => void,
  onError?: (error: any) => void,
  countryCode = "sv"
) => subscribeToB2BCompaniesByCountries([countryCode], callback, onError);

export const getB2BCompanyById = async (
  id: string,
  countryCode: string
): Promise<B2BCompany | null> => {
  try {
    await auth.authStateReady();
    const docRef = getCompanyDoc(id, countryCode);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return mapCompanySnap(snapshot.id, snapshot.data(), countryCode);
  } catch (error) {
    console.warn("[companyService] Error fetching company by id:", error);
    return null;
  }
};

export const generateTemporaryPassword = (): string => {
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `LiloSV-${randomDigits}!`;
};

/**
 * El alta de un usuario de empresa la ejecuta `createCompanyUser`; el documento
 * `users/{uid}` también. Por eso `password`, `phone` y `tradeName` siguen en el
 * contrato —no se le rompe la firma a quien llama— pero ya no se aplican acá: la
 * credencial y el perfil los escribe el servidor (CF-101 / S7).
 */
export interface ProvisionB2BAuthParams {
  email: string;
  password: string;
  contactName: string;
  phone: string;
  companyId: string;
  tradeName?: string;
}

export const provisionB2BCompanyAuthUser = async ({
  email,
  contactName,
  companyId,
}: ProvisionB2BAuthParams): Promise<{
  uid?: string;
  email: string;
  temporaryPassword: string;
}> => {
  const normalizedEmail = email.trim().toLowerCase();
  const [firstName, ...rest] = contactName.trim().split(" ");
  const lastName = rest.join(" ") || "";

  try {
    // 1. Resolver el ID del documento en roles cuyo name sea "company_admin"
    let roleId = "company_admin";
    try {
      const rolesSnap = await getDocs(collection(db, "roles"));
      const foundDoc = rolesSnap.docs.find(
        (d) => d.data()?.name === "company_admin" || d.id === "company_admin"
      );
      if (foundDoc) {
        roleId = foundDoc.id;
      }
    } catch (err) {
      console.warn("[companyService] Error fetching roles collection:", err);
    }

    // CF-39 / CF-101: Invocación de createCompanyUserCallable oficial (sin contraseña provisional en respuesta)
    const res = await createCompanyUserCallable({
      email: normalizedEmail,
      roleId,
      companyId,
      countryId: "sv",
      firstName: firstName || "Admin",
      lastName,
    });

    return {
      uid: res.data.uid,
      email: normalizedEmail,
      temporaryPassword: "",
    };
  } catch (callableErr: any) {
    // CF-101 S7: un rechazo del callable se muestra, no se rodea. Acá vivía un
    // fallback que creaba la cuenta con una app secundaria de Auth y escribía
    // `users/{uid}` desde el navegador: esa segunda puerta dejaba sin efecto
    // cualquier regla de autoría del backend. El error del callable viaja tal
    // cual —con su `code`, su `message` y sus `details`— porque es lo que
    // `formatFriendlyError` lee en la pantalla. La cuenta, la credencial y el
    // documento los escribe el servidor.
    console.warn(
      "[companyService] createCompanyUser rechazó el alta:",
      callableErr?.code,
      callableErr?.message || callableErr
    );
    throw callableErr;
  }
};

export const createB2BCompany = async (
  data: CreateCompanyFormInput
): Promise<{ id: string; provisionalPassword: string }> => {
  if (data.billingPeriod === "biweekly") {
    throw new Error(
      "El período catorcenal ('biweekly') está retirado. Usa Quincenal (15 y último día) o Semanal."
    );
  }

  const payload = buildCreateCompanyPayload(data);
  const countryCode = (payload.countryId || "sv").toLowerCase();

  // CF-43: Alta atómica de empresa, centro de costo, tarifas y usuario administrador vía createCompanyCallable
  const res = await createCompanyCallable(payload);

  const createdCompanyId = res.data.companyId;

  // CF-47: Crear viajero corporativo inicial vía createTravellerCallable
  try {
    await createTravellerCallable({
      companyId: createdCompanyId,
      countryId: countryCode,
      name: (data.contactName || "Viajero Corporativo").trim(),
      ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
      ...(data.email?.trim()
        ? { email: data.email.trim().toLowerCase() }
        : {}),
    });
  } catch (trErr) {
    console.warn("[companyService] createTravellerCallable initial note:", trErr);
  }

  return {
    id: createdCompanyId,
    provisionalPassword: "Enlace de activación enviado por correo (/establecer-clave)",
  };
};

// El país es obligatorio: `updateB2BCompany` era el camino por el que una
// empresa de otro país se guardaba en `countries/sv`. Los llamadores lo pasan
// (el de la fila y el que resolvió el detalle).
export const updateB2BCompany = async (
  id: string,
  data: Partial<Omit<B2BCompany, "id" | "createdAt" | "updatedAt">> & { reason?: string },
  countryCode: string
): Promise<void> => {
  if (data.billingPeriod === "biweekly") {
    throw new Error(
      "El período catorcenal ('biweekly') está retirado. Usa Quincenal (15 y último día) o Semanal."
    );
  }
  const { initialPassword: _ignored, ...companyData } = data;
  // El país de la fila manda sobre el `countryId` heredado del formulario (el
  // que antes fijaba El Salvador), así que editar una empresa de otro país
  // escribía en `countries/sv`. La pantalla pasa el país que leyó.
  const effectiveCountry = (countryCode || companyData.countryId || "sv").toLowerCase();

  // CF-86 / D-A: Invocación oficial de updateCompany (cero escrituras directas a Firestore)
  await updateCompanyCallable({
    companyId: id,
    countryId: effectiveCountry,
    ...(companyData.tradeName ? { tradeName: companyData.tradeName.trim() } : {}),
    ...(companyData.legalName ? { legalName: companyData.legalName.trim() } : {}),
    ...(companyData.nit ? { nit: companyData.nit.trim() } : {}),
    ...(companyData.nrc ? { nrc: companyData.nrc.trim() } : {}),
    ...(companyData.contactName ? { contactName: companyData.contactName.trim() } : {}),
    ...(companyData.email ? { contactEmail: companyData.email.trim().toLowerCase() } : {}),
    ...(companyData.phone ? { contactPhone: companyData.phone.trim() } : {}),
    ...(companyData.whatsapp ? { contactWhatsapp: companyData.whatsapp.trim() } : {}),
    ...(companyData.address ? { contactAddress: companyData.address.trim() } : {}),
    ...(companyData.paymentCondition ? { paymentCondition: companyData.paymentCondition } : {}),
    ...(companyData.billingPeriod ? { billingPeriod: companyData.billingPeriod } : {}),
    ...(typeof companyData.requiresCCF === "boolean" ? { requiresCCF: companyData.requiresCCF } : {}),
    // Las tarifas por categoría: el campo global (`negotiatedFareRate`) está
    // deprecado y este callable no lo acepta; el que rige es `fareRates`.
    ...(companyData.fareRates && Object.keys(companyData.fareRates).length > 0
      ? { fareRates: companyData.fareRates }
      : {}),
    ...(companyData.status === "active" || companyData.status === "suspended"
      ? { status: companyData.status }
      : {}),
    ...(data.reason?.trim() ? { reason: data.reason.trim() } : {}),
  });
};

export const updateB2BCompanyStatus = async (
  id: string,
  status: B2BCompany["status"],
  countryCode: string
): Promise<void> => {
  return updateB2BCompany(id, { status, countryId: countryCode }, countryCode);
};

/**
 * Lectura de centros de costo de una empresa. Lanza si ambos caminos fallan:
 * `getCostCenters` la envuelve para conservar su contrato de lista vacía
 * (CF-91 §4), y `getCostCentersResult` la expone con el error para que el alta
 * de reserva distinga «no hay centros» de «no se pudieron leer».
 */
const readCostCenters = async (
  companyId: string,
  countryCode: string
): Promise<CostCenter[]> => {
  await auth.authStateReady();
  // CF-46: Preferir listCostCentresCallable
  try {
    const res = await listCostCentresCallable({
      companyId,
      countryId: countryCode.toLowerCase(),
    });
    if (Array.isArray(res.data?.costCentres) && res.data.costCentres.length > 0) {
      return res.data.costCentres.map((c) => ({
        id: c.costCentreId,
        name: c.name,
        department: c.name,
        budgetLimit: normalizeBudgetLimitValue(c.budgetLimit),
        monthlyBudget: normalizeBudgetLimitValue(c.budgetLimit),
        spent: typeof c.spent === "number" ? c.spent : 0,
        reserved: typeof c.reserved === "number" ? c.reserved : 0,
        budgetWindowStart: c.budgetWindowStartAt ?? null,
        active: c.active !== false,
        status: c.active ? "active" : "inactive",
      }));
    }
  } catch {
    // Fallback a lectura directa Firestore
  }

  const subCol = collection(
    db,
    "countries",
    countryCode.toLowerCase(),
    "b2bCompanies",
    companyId,
    "costCenters"
  );
  const snapshot = await getDocs(subCol);
  return snapshot.docs.map((d) => {
    const raw = d.data();
    return {
      id: d.id,
      ...raw,
      department: raw.department || raw.name || "General",
      budgetLimit: normalizeBudgetLimitValue(raw.budgetLimit),
      spent: typeof raw.spent === "number" ? raw.spent : 0,
      reserved: typeof raw.reserved === "number" ? raw.reserved : 0,
      status: raw.active === false ? "inactive" : raw.status || "active",
    };
  }) as CostCenter[];
};

// Sin filtro: `CostCenterManager` consume este getter y necesita ver los centros
// retirados para poder reactivarlos. El alta de reserva filtra por su cuenta.
export const getCostCenters = async (
  companyId: string,
  countryCode = "sv"
): Promise<CostCenter[]> => {
  try {
    return await readCostCenters(companyId, countryCode);
  } catch (error) {
    console.warn("[companyService] Error fetching cost centers:", error);
    return [];
  }
};

export type CostCentersReadResult =
  | { ok: true; costCenters: CostCenter[] }
  | { ok: false; error: unknown };

/**
 * Igual que `getCostCenters` pero conserva el fallo de lectura en vez de
 * devolver `[]`: el alta de reserva no puede confundir «sin centros» con
 * «no se pudieron leer» (CF-91 §4).
 */
export const getCostCentersResult = async (
  companyId: string,
  countryCode = "sv"
): Promise<CostCentersReadResult> => {
  try {
    return {
      ok: true,
      costCenters: await readCostCenters(companyId, countryCode),
    };
  } catch (error) {
    console.warn("[companyService] Error fetching cost centers:", error);
    return { ok: false, error };
  }
};

export const createCostCenter = async (
  companyId: string,
  data: Omit<CostCenter, "id" | "createdAt">,
  countryCode = "sv"
): Promise<string> => {
  const normalizedLimit = normalizeBudgetLimitValue(data.budgetLimit);
  // CF-46 / D-33: createCostCentreCallable (NO enviar `department`)
  const res = await createCostCentreCallable({
    companyId,
    countryId: countryCode.toLowerCase(),
    name: data.name.trim(),
    ...(normalizedLimit !== null && normalizedLimit > 0
      ? { budgetLimit: Math.round(normalizedLimit) }
      : {}),
  });
  return res.data.costCentreId;
};

export const updateCostCenter = async (
  companyId: string,
  centerId: string,
  data: Partial<Omit<CostCenter, "id" | "createdAt">> & { reason?: string },
  countryCode = "sv"
): Promise<void> => {
  const payload: {
    companyId: string;
    countryId: string;
    costCentreId: string;
    name?: string;
    budgetLimit?: number | null;
    active?: boolean;
    reason?: string;
  } = {
    companyId,
    countryId: countryCode.toLowerCase(),
    costCentreId: centerId,
  };

  if (typeof data.name === "string" && data.name.trim()) {
    payload.name = data.name.trim();
  }
  if ("budgetLimit" in data) {
    const normalized = normalizeBudgetLimitValue(data.budgetLimit);
    payload.budgetLimit =
      normalized === null ? null : Math.max(1, Math.round(normalized));
  }
  if (data.status !== undefined) {
    payload.active = data.status === "active";
  }
  if (typeof data.active === "boolean") {
    payload.active = data.active;
  }
  if (data.reason?.trim()) {
    payload.reason = data.reason.trim();
  }

  // CF-46 / CF-81: updateCostCentreCallable
  await updateCostCentreCallable(payload);
};

export const deleteCostCenter = async (
  companyId: string,
  centerId: string,
  countryCode = "sv"
): Promise<void> => {
  // CF-46: Un centro de costo no se borra, se retira con active: false
  await updateCostCentreCallable({
    companyId,
    countryId: countryCode.toLowerCase(),
    costCentreId: centerId,
    active: false,
  });
};

export const getLimitRequests = async (
  companyId: string,
  countryCode = "sv"
): Promise<LimitRequest[]> => {
  try {
    await auth.authStateReady();
    // D-41 / CF-81: La historia oficial de cambios vive en costCentreHistory
    const historyCol = collection(
      db,
      "countries",
      countryCode.toLowerCase(),
      "b2bCompanies",
      companyId,
      "costCentreHistory"
    );
    const snapshot = await getDocs(historyCol);
    if (!snapshot.empty) {
      return snapshot.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          costCenterId: raw.costCentreId || "",
          costCenterName: raw.name || raw.costCentreName || "Centro de Costo",
          previousLimit:
            raw.previousValue?.budgetLimit ??
            (typeof raw.previousValue === "number" ? raw.previousValue : null),
          requestedLimit:
            raw.newValue?.budgetLimit ??
            (typeof raw.newValue === "number" ? raw.newValue : null),
          reason: raw.reason || `Actualización de ${raw.field || "techo"}`,
          requestedByUid: raw.changedBy || "admin",
          requestedByName: raw.changedBy || "Administrador",
          status: "applied",
          createdAt: raw.changedAt || raw.createdAt || new Date().toISOString(),
        };
      });
    }
    return [];
  } catch (err) {
    console.warn("[companyService] Error reading costCentreHistory:", err);
    return [];
  }
};

export const recordLimitRequestAudit = async (
  companyId: string,
  entry: Omit<LimitRequest, "id" | "createdAt">,
  countryCode = "sv"
): Promise<string> => {
  // D-41: updateCostCentre ya escribe automáticamente a costCentreHistory en la misma transacción.
  // Este helper se mantiene por compatibilidad sin escribir colecciones deprecadas.
  return `audit_${Date.now()}`;
};

export const getCompanyTravellers = async (
  companyId: string,
  countryCode = "sv"
): Promise<B2BTraveller[]> => {
  try {
    await auth.authStateReady();
    // CF-47: Preferir listTravellersCallable
    try {
      const res = await listTravellersCallable({
        companyId,
        countryId: countryCode.toLowerCase(),
      });
      if (Array.isArray(res.data?.travellers) && res.data.travellers.length > 0) {
        return res.data.travellers.map((t) => ({
          id: t.travellerId,
          companyId,
          name: t.name,
          email: t.email || "",
          phone: t.phone || "+503 7000-0000",
          department: "General",
          employeeCode: t.documentNumber || "",
          status: t.active ? "active" : "inactive",
        }));
      }
    } catch {
      // Fallback lectura Firestore
    }

    const subCol = collection(
      db,
      "countries",
      countryCode.toLowerCase(),
      "b2bCompanies",
      companyId,
      "travellers"
    );
    const snapshot = await getDocs(subCol);
    const list = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as B2BTraveller[];
    return list;
  } catch {
    return [];
  }
};

export const createCompanyTraveller = async (
  companyId: string,
  traveller: Omit<B2BTraveller, "id" | "createdAt">,
  countryCode = "sv"
): Promise<B2BTraveller> => {
  // CF-47: createTravellerCallable (escritura directa a travellers está cerrada en firestore.rules)
  const res = await createTravellerCallable({
    companyId,
    countryId: countryCode.toLowerCase(),
    name: traveller.name.trim(),
    ...(traveller.phone?.trim() ? { phone: traveller.phone.trim() } : {}),
    ...(traveller.email?.trim() ? { email: traveller.email.trim() } : {}),
    ...(traveller.employeeCode?.trim()
      ? { documentNumber: traveller.employeeCode.trim() }
      : {}),
  });
  return {
    ...traveller,
    id: res.data.travellerId,
    companyId,
    status: "active",
  };
};

