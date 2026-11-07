import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions, firebaseApp } from "@/utils/firebase";
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

const getCompanyCol = (countryCode = "sv") =>
  collection(db, "countries", countryCode.toLowerCase(), "b2bCompanies");

const getCompanyDoc = (companyId: string, countryCode = "sv") =>
  doc(db, "countries", countryCode.toLowerCase(), "b2bCompanies", companyId);

const BILLING_CADENCES_COLLECTION = "billingCadences";

/**
 * Catálogo oficial de cadencias de facturación B2B (`billingCadences/{periodId}` - CF-24).
 */
export const DEFAULT_BILLING_CADENCES: BillingCadenceDocument[] = [
  {
    id: "daily",
    label: "Diario",
    description:
      "Cierre de facturación al finalizar cada día calendario (00:00 hora local del país de la empresa).",
    windowKind: "calendar_day",
    windowDays: 1,
    active: true,
    selectable: true,
    displayOrder: 1,
    constraint: null,
  },
  {
    id: "weekly",
    label: "Semanal",
    description: "Cierre cada 7 días corridos desde el inicio de la ventana activa.",
    windowKind: "rolling_days",
    windowDays: 7,
    active: true,
    selectable: true,
    displayOrder: 2,
    constraint: null,
  },
  {
    id: "semi-monthly",
    label: "Quincenal (15 y último día)",
    description:
      "Dos cierres por mes calendario: día 15 y último día del mes (28, 29, 30 o 31 según corresponda).",
    windowKind: "semi_monthly_15_eom",
    windowDays: null,
    active: true,
    selectable: true,
    displayOrder: 3,
    constraint: null,
  },
  {
    id: "monthly",
    label: "Mensual",
    description:
      "Cierre el último día de cada mes calendario (día 1 al último día del mes).",
    windowKind: "calendar_month",
    windowDays: null,
    active: true,
    selectable: true,
    displayOrder: 4,
    constraint: null,
  },
  {
    id: "biweekly",
    label: "Catorcenal (no disponible)",
    description:
      "Ciclos de 14 días corridos. Retirado del alta de empresas porque genera 3 cierres en meses con 31 días.",
    windowKind: "rolling_days",
    windowDays: 14,
    active: false,
    selectable: false,
    displayOrder: 99,
    constraint:
      "Deshabilitado: los ciclos de 14 días producen meses con 3 cierres, incompatible con la conciliación fiscal mensual de El Salvador. Usa Quincenal (15 y último día) o Semanal.",
  },
];

export const FALLBACK_SV_COMPANIES: B2BCompany[] = [
  {
    id: "XmXrFylloVeOIQhrGXG1",
    tradeName: "Industrias El Ángel S.A. de C.V.",
    legalName: "Industrias El Ángel Sociedad Anónima de Capital Variable",
    nit: "0614-120589-101-4",
    nrc: "184920-5",
    contactName: "Lic. Roberto Carlos Mendoza",
    phone: "+503 2250-8900",
    whatsapp: "+503 7890-1122",
    email: "logistica@elangel.com.sv",
    address: "Km 14 Carretera Troncal del Norte, Apopa, San Salvador",
    paymentCondition: "credit30",
    billingPeriod: "monthly",
    requiresInvoice: true,
    requiresCCF: true,
    balance: 75.95,
    status: "active",
    countryId: "sv",
  },
];

export let FALLBACK_SV_COST_CENTERS: CostCenter[] = [
  {
    id: "CCSJeYZJfT3FMy2kEass",
    code: "CC-APOPA-01",
    name: "Techo Corporativo General · Planta Apopa",
    department: "Operaciones y Logística Corporativa",
    budgetLimit: 2500,
    monthlyBudget: 2500,
    spent: 420.5,
    reserved: 19.7,
    budgetWindowStart: Date.now() - 5 * 86400000,
    status: "active",
  },
  {
    id: "xJmKzymXoW9MBxnSE4bD",
    code: "CC-COM-02",
    name: "Dirección Comercial y Logística (Sin límite)",
    department: "Ventas Corporativas",
    budgetLimit: null,
    monthlyBudget: null,
    spent: 315.75,
    reserved: 0,
    budgetWindowStart: null,
    status: "active",
  },
];

export let FALLBACK_SV_LIMIT_REQUESTS: LimitRequest[] = [
  {
    id: "limReqSv001",
    costCenterId: "CCSJeYZJfT3FMy2kEass",
    costCenterName: "Techo Corporativo General · Planta Apopa",
    previousLimit: 2000,
    requestedLimit: 2500,
    reason: "Incremento operativo por visitas de auditoría regional en Planta Apopa.",
    requestedByUid: "companyAdminElAngel",
    requestedByName: "Lic. Roberto Carlos Mendoza",
    status: "applied",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

export let FALLBACK_SV_TRAVELLERS: B2BTraveller[] = [
  {
    id: "travSv001",
    companyId: "compSv001",
    name: "Ing. Carlos Rivas",
    email: "crivas@elangel.com.sv",
    phone: "+503 7890-1122",
    department: "Operaciones Planta Apopa",
    employeeCode: "EA-1042",
    status: "active",
  },
  {
    id: "travSv002",
    companyId: "compSv001",
    name: "Lic. Sofía Méndez",
    email: "smendez@elangel.com.sv",
    phone: "+503 7700-3344",
    department: "Dirección Comercial",
    employeeCode: "EA-2019",
    status: "active",
  },
  {
    id: "travSv003",
    companyId: "compSv001",
    name: "Ing. Javier Ernesto Кury",
    email: "jkury@elangel.com.sv",
    phone: "+503 7611-9080",
    department: "Auditoría Externa / Invitado",
    employeeCode: "INV-088",
    status: "active",
  },
];

export const getBillingCadences = async (): Promise<BillingCadenceDocument[]> => {
  try {
    await auth.authStateReady();
    const snapshot = await getDocs(collection(db, BILLING_CADENCES_COLLECTION));
    if (snapshot.empty) {
      return DEFAULT_BILLING_CADENCES;
    }
    const list = snapshot.docs.map((docSnap) => ({
      id: docSnap.id as BillingCadenceDocument["id"],
      ...(docSnap.data() as Omit<BillingCadenceDocument, "id">),
    }));
    return list.sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
  } catch {
    return DEFAULT_BILLING_CADENCES;
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

const mapCompanySnap = (id: string, raw: Record<string, any>): B2BCompany =>
  ({
    id,
    ...raw,
    tradeName: raw.tradeName || raw.name || raw.legalName || "Empresa B2B",
    legalName: raw.legalName || raw.name || raw.tradeName || "Empresa B2B",
    contactName: raw.contactName || raw.contactPerson || "Contacto Corporativo",
    phone: raw.phone || raw.contactPhone || "+503 2200-0000",
    whatsapp: raw.whatsapp || raw.phone || "+503 7000-0000",
    email: raw.email || "",
    address: raw.address || "San Salvador, El Salvador",
    paymentCondition: raw.paymentCondition || "credit30",
    billingPeriod: raw.billingPeriod || "monthly",
    requiresInvoice: raw.requiresInvoice !== false,
    requiresCCF: Boolean(raw.requiresCCF),
    balance: typeof raw.balance === "number" ? raw.balance : 0,
    status: raw.status || "active",
    countryId: raw.countryId || "sv",
  }) as B2BCompany;

export const getB2BCompanies = async (countryCode = "sv"): Promise<B2BCompany[]> => {
  try {
    await auth.authStateReady();
    const snapshot = await getDocs(getCompanyCol(countryCode));
    const companies = snapshot.docs.map((docSnap) =>
      mapCompanySnap(docSnap.id, docSnap.data())
    );

    return sortCompaniesDesc(companies);
  } catch (error) {
    console.warn("[companyService] Error fetching companies:", error);
    return [];
  }
};

export const subscribeToB2BCompanies = (
  callback: (companies: B2BCompany[]) => void,
  onError?: (error: any) => void,
  countryCode = "sv"
) => {
  let unsubscribeFirestore: (() => void) | null = null;
  let cancelled = false;

  auth.authStateReady().then(() => {
    if (cancelled) return;

    unsubscribeFirestore = onSnapshot(
      getCompanyCol(countryCode),
      (snapshot) => {
        const companies = snapshot.docs.map((docSnap) =>
          mapCompanySnap(docSnap.id, docSnap.data())
        );

        callback(sortCompaniesDesc(companies));
      },
      (error) => {
        console.warn(
          "[companyService] Firestore read error on companies:",
          error?.code || error?.message
        );
        if (onError) onError(error);
        callback([]);
      }
    );
  });

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
};

export const getB2BCompanyById = async (
  id: string,
  countryCode = "sv"
): Promise<B2BCompany | null> => {
  try {
    await auth.authStateReady();
    const docRef = getCompanyDoc(id, countryCode);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return mapCompanySnap(snapshot.id, snapshot.data());
  } catch (error) {
    console.warn("[companyService] Error fetching company by id:", error);
    return null;
  }
};

export const generateTemporaryPassword = (): string => {
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `LiloSV-${randomDigits}!`;
};

const getSecondaryAuth = () => {
  const appName = "liloB2BProvisioner";
  const existing = getApps().find((a) => a.name === appName);
  const secondaryApp =
    existing || initializeApp(firebaseApp.options, appName);
  return getAuth(secondaryApp);
};

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
  password,
  contactName,
  phone,
  companyId,
  tradeName,
}: ProvisionB2BAuthParams): Promise<{
  uid?: string;
  email: string;
  temporaryPassword: string;
}> => {
  const normalizedEmail = email.trim().toLowerCase();
  const [firstName, ...rest] = contactName.trim().split(" ");
  const lastName = rest.join(" ") || "";
  let uid: string | undefined;
  let finalPassword = password;

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

    // CF-39 / MIGRACION §6-ter: Invocación de createCompanyUser callable oficial
    const createCompanyUserFn = httpsCallable<
      {
        email: string;
        roleId: string;
        companyId: string;
        countryId: string;
        firstName?: string;
        lastName?: string;
      },
      {
        uid: string;
        provisionalPassword: string;
        countryId: string;
        companyId: string;
        roleId: string;
      }
    >(functions, "createCompanyUser");

    const res = await createCompanyUserFn({
      email: normalizedEmail,
      roleId,
      companyId,
      countryId: "sv",
      firstName: firstName || "Admin",
      lastName,
    });

    uid = res.data.uid;
    finalPassword = res.data.provisionalPassword;
  } catch (authErr: any) {
    console.warn("[companyService] createCompanyUser note, falling back to secondaryAuth:", authErr?.message || authErr);
    // Fallback: Aprovisionamiento con secondaryAuth
    const secondaryAuth = getSecondaryAuth();
    try {
      const userCred = await createUserWithEmailAndPassword(
        secondaryAuth,
        normalizedEmail,
        password
      );
      uid = userCred.user.uid;
      finalPassword = password;
    } catch (secErr: any) {
      if (secErr?.code === "auth/email-already-in-use") {
        const usersSnap = await getDocs(
          query(collection(db, "users"), where("email", "==", normalizedEmail))
        );
        if (!usersSnap.empty) {
          uid = usersSnap.docs[0].id;
        }
      } else {
        throw secErr;
      }
    } finally {
      try {
        await signOut(secondaryAuth);
      } catch {
        // Ignorar error al cerrar secondaryAuth
      }
    }
  }

  if (uid) {
    await setDoc(
      doc(db, "users", uid),
      {
        uid,
        email: normalizedEmail,
        firstName: firstName || "Admin",
        lastName,
        displayName: contactName.trim(),
        phone: phone.trim(),
        userType: "client",
        countryId: "sv",
        companyId,
        companyRole: "company_admin",
        isActive: true,
        isEmailVerified: true,
        mustChangePassword: true,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await setDoc(
        doc(db, "users", uid, "countryMemberships", "sv"),
        {
          countryId: "sv",
          status: "active",
          role: "company_admin",
          companyId,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (memErr) {
      console.warn("[companyService] Membership record note:", memErr);
    }
  }

  try {
    await addDoc(collection(db, "mail"), {
      to: normalizedEmail,
      message: {
        subject: `Credenciales de Acceso — Portal Corporativo Lilo B2B (${
          tradeName || "El Salvador"
        })`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5EAEF; border-radius: 8px;">
            <h2 style="color: #2A3547; margin-top: 0;">Bienvenido al Portal Corporativo Lilo B2B</h2>
            <p style="color: #5A6A85;">Hola <strong>${contactName}</strong>,</p>
            <p style="color: #5A6A85;">Tu cuenta corporativa para <strong>${
              tradeName || normalizedEmail
            }</strong> en El Salvador ha sido habilitada.</p>
            <div style="background: #ECF2FF; padding: 16px; border-radius: 6px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Correo de acceso:</strong> ${normalizedEmail}</p>
              <p style="margin: 4px 0;"><strong>Contraseña temporal:</strong> <code style="font-size: 15px; font-weight: bold;">${finalPassword}</code></p>
            </div>
            <p style="color: #5A6A85; font-size: 13px;">Por seguridad, al iniciar sesión por primera vez el sistema te solicitará configurar tu contraseña corporativa definitiva.</p>
          </div>
        `,
      },
    });
  } catch (mailErr) {
    console.warn("[companyService] Could not queue welcome email:", mailErr);
  }

  return { uid, email: normalizedEmail, temporaryPassword: finalPassword };
};

export const createB2BCompany = async (
  data: Omit<B2BCompany, "id" | "createdAt" | "updatedAt"> & {
    fareRatesList?: Array<{ categoryId: string; fareRate: number }>;
    costCentreName?: string;
    minimumBookingLeadMinutes?: number;
  }
): Promise<{ id: string; provisionalPassword: string }> => {
  if (data.billingPeriod === "biweekly") {
    throw new Error(
      "El período catorcenal ('biweekly') está retirado. Usa Quincenal (15 y último día) o Semanal."
    );
  }

  const { initialPassword: _ignoredPassword, ...companyData } = data;
  const negotiatedFareRate =
    typeof companyData.negotiatedFareRate === "number" &&
    Number.isFinite(companyData.negotiatedFareRate) &&
    companyData.negotiatedFareRate > 0
      ? Number(companyData.negotiatedFareRate)
      : 0.67;

  const countryCode = (companyData.countryId || "sv").toLowerCase();
  const initialBudgetLimit = normalizeBudgetLimitValue(companyData.creditLimit);
  const [firstName, ...restName] = (
    companyData.contactName || "Administrador Corporativo"
  )
    .trim()
    .split(" ");
  const lastName = restName.join(" ") || "Corporativo";

  const fareRatesPayload =
    Array.isArray(data.fareRatesList) && data.fareRatesList.length > 0
      ? data.fareRatesList.filter(
          (r) => r.categoryId && typeof r.fareRate === "number" && r.fareRate > 0
        )
      : [{ categoryId: "suv", fareRate: negotiatedFareRate }];

  // CF-43: Alta atómica de empresa, centro de costo, tarifas y usuario administrador vía createCompanyCallable
  const res = await createCompanyCallable({
    countryId: countryCode,
    name: (companyData.tradeName || companyData.legalName).trim(),
    legalName: (companyData.legalName || companyData.tradeName).trim(),
    nit: companyData.nit.trim(),
    ...(companyData.nrc?.trim() ? { nrc: companyData.nrc.trim() } : {}),
    billingPeriod: companyData.billingPeriod || "monthly",
    paymentCondition: companyData.paymentCondition || "credit30",
    requiresCCF: Boolean(companyData.requiresCCF),
    minimumBookingLeadMinutes:
      typeof data.minimumBookingLeadMinutes === "number" &&
      data.minimumBookingLeadMinutes >= 0
        ? Math.round(data.minimumBookingLeadMinutes)
        : 180,
    costCentre: {
      name: (data.costCentreName || "Operaciones Corporativas").trim(),
      ...(initialBudgetLimit !== null && initialBudgetLimit > 0
        ? { budgetLimit: Math.round(initialBudgetLimit) }
        : {}),
    },
    ...(fareRatesPayload.length > 0 ? { fareRates: fareRatesPayload } : {}),
    admin: {
      email: companyData.email.trim().toLowerCase(),
      firstName: firstName || "Admin",
      lastName,
    },
  });

  const createdCompanyId = res.data.companyId;

  // CF-47: Crear viajero corporativo inicial vía createTravellerCallable
  try {
    await createTravellerCallable({
      companyId: createdCompanyId,
      countryId: countryCode,
      name: (companyData.contactName || "Viajero Corporativo").trim(),
      ...(companyData.phone?.trim() ? { phone: companyData.phone.trim() } : {}),
      ...(companyData.email?.trim()
        ? { email: companyData.email.trim().toLowerCase() }
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

export const updateB2BCompany = async (
  id: string,
  data: Partial<Omit<B2BCompany, "id" | "createdAt" | "updatedAt">> & { reason?: string },
  countryCode = "sv"
): Promise<void> => {
  if (data.billingPeriod === "biweekly") {
    throw new Error(
      "El período catorcenal ('biweekly') está retirado. Usa Quincenal (15 y último día) o Semanal."
    );
  }
  const { initialPassword: _ignored, ...companyData } = data;
  const effectiveCountry = (companyData.countryId || countryCode || "sv").toLowerCase();

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
    ...(companyData.address ? { address: companyData.address.trim() } : {}),
    ...(companyData.paymentCondition ? { paymentCondition: companyData.paymentCondition } : {}),
    ...(companyData.billingPeriod ? { billingPeriod: companyData.billingPeriod } : {}),
    ...(typeof companyData.requiresCCF === "boolean" ? { requiresCCF: companyData.requiresCCF } : {}),
    ...(companyData.status === "active" || companyData.status === "suspended"
      ? { status: companyData.status }
      : {}),
    ...(data.reason?.trim() ? { reason: data.reason.trim() } : {}),
  });
};

export const updateB2BCompanyStatus = async (
  id: string,
  status: B2BCompany["status"],
  countryCode = "sv"
): Promise<void> => {
  return updateB2BCompany(id, { status, countryId: countryCode }, countryCode);
};

/**
 * Normaliza `budgetLimit` según CF-23:
 * `null` o `undefined` = SIN LÍMITE (jamás coercer a 0).
 * Número >= 0 = techo efectivo en USD (`0` bloquea el despacho).
 */
const normalizeBudgetLimitValue = (
  raw: number | null | undefined
): number | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

export const getCostCenters = async (
  companyId: string,
  countryCode = "sv"
): Promise<CostCenter[]> => {
  try {
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
    const list = snapshot.docs.map((d) => {
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
    return list;
  } catch (error) {
    console.warn("[companyService] Error fetching cost centers:", error);
    return [];
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
    return list.length > 0 ? list : FALLBACK_SV_TRAVELLERS;
  } catch {
    return FALLBACK_SV_TRAVELLERS;
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

