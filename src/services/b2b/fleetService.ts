import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "@/utils/firebase";
import {
  B2BVehicle,
  DocumentRequirement,
  DriverDocumentRecord,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverVerificationDossier,
  RejectionReasonCode,
  VehicleCatalogBrand,
  VehicleCatalogModel,
} from "@/types/b2b";

const VEHICLES_COLLECTION = "vehicles";
const VEHICLE_CATALOG_COLLECTION = "vehicleCatalog";
const DOC_REQUIREMENTS_COLLECTION = "documentRequirements";
const DRIVERS_COLLECTION = "drivers";

export const FALLBACK_VEHICLE_CATALOG: VehicleCatalogBrand[] = [
  {
    id: "toyota",
    name: "Toyota",
    active: true,
    models: [
      { id: "fortuner", name: "Fortuner 2.8 TDI", category: "suv", seats: 7, maxPassengers: 4, active: true },
      { id: "hilux", name: "Hilux Doble Cabina 4x4", category: "pickup", seats: 5, maxPassengers: 4, active: true },
      { id: "hiace", name: "Hiace Techo Alto 12 Pax", category: "microbus", seats: 15, maxPassengers: 12, active: true },
      { id: "corolla", name: "Corolla Cross", category: "suv", seats: 5, maxPassengers: null, active: true },
    ],
  },
  {
    id: "nissan",
    name: "Nissan",
    active: true,
    models: [
      { id: "frontier", name: "Frontier NP300 4x4", category: "pickup", seats: 5, maxPassengers: 4, active: true },
      { id: "urvan", name: "NV350 Urvan", category: "microbus", seats: 15, maxPassengers: 12, active: true },
    ],
  },
  {
    id: "mitsubishi",
    name: "Mitsubishi",
    active: true,
    models: [
      { id: "l200", name: "L200 Sportero 4x4", category: "pickup", seats: 5, maxPassengers: 4, active: true },
      { id: "montero", name: "Montero Sport", category: "suv", seats: 7, maxPassengers: 4, active: true },
    ],
  },
];

/**
 * Lee el catálogo global `vehicleCatalog` y subcolección `models` sin filtrar por `countryId` (CF-01, CF-02, CF-25).
 */
export const getGlobalVehicleCatalog = async (): Promise<VehicleCatalogBrand[]> => {
  try {
    await auth.authStateReady();
    const brandsQuery = query(
      collection(db, VEHICLE_CATALOG_COLLECTION),
      orderBy("name", "asc")
    );
    const brandsSnap = await getDocs(brandsQuery);
    if (brandsSnap.empty) {
      return FALLBACK_VEHICLE_CATALOG;
    }

    const brands: VehicleCatalogBrand[] = await Promise.all(
      brandsSnap.docs.map(async (brandDoc) => {
        const brandData = brandDoc.data();
        let models: VehicleCatalogModel[] = [];

        if (Array.isArray(brandData.models) && brandData.models.length > 0) {
          models = brandData.models.map((m: any, idx: number) =>
            typeof m === "string"
              ? { id: `${brandDoc.id}_${idx}`, name: m, seats: 5, maxPassengers: null }
              : {
                  id: m.id || `${brandDoc.id}_${idx}`,
                  name: m.name || "Modelo",
                  category: m.category,
                  seats: typeof m.seats === "number" ? m.seats : null,
                  maxPassengers: typeof m.maxPassengers === "number" ? m.maxPassengers : null,
                  active: m.active !== false,
                }
          );
        } else {
          try {
            const modelsSnap = await getDocs(
              collection(db, VEHICLE_CATALOG_COLLECTION, brandDoc.id, "models")
            );
            models = modelsSnap.docs.map((mDoc) => {
              const mData = mDoc.data();
              return {
                id: mDoc.id,
                name: mData.name || mDoc.id,
                category: mData.category,
                seats: typeof mData.seats === "number" ? mData.seats : null,
                maxPassengers: typeof mData.maxPassengers === "number" ? mData.maxPassengers : null,
                active: mData.active !== false,
              };
            });
          } catch {
            models = [];
          }
        }

        return {
          id: brandDoc.id,
          name: brandData.name || brandDoc.id,
          active: brandData.active !== false,
          models,
        };
      })
    );

    const activeBrands = brands.filter((b) => b.active !== false);
    return activeBrands.length > 0 ? activeBrands : FALLBACK_VEHICLE_CATALOG;
  } catch {
    return FALLBACK_VEHICLE_CATALOG;
  }
};

export const REJECTION_REASONS_CATALOG: Array<{
  code: RejectionReasonCode;
  label: string;
  description: string;
}> = [
  {
    code: "illegible",
    label: "Documento ilegible o borroso",
    description:
      "La imagen está desenfocada, oscura o con reflejos que impiden leer los datos.",
  },
  {
    code: "expired",
    label: "Documento vencido",
    description:
      "La fecha de vigencia del documento ha expirado según normativa de El Salvador.",
  },
  {
    code: "wrongDocument",
    label: "Documento incorrecto",
    description:
      "El archivo subido no corresponde al tipo de documento solicitado.",
  },
  {
    code: "incomplete",
    label: "Documento incompleto o cortado",
    description:
      "Falta el reverso del documento o los bordes están recortados.",
  },
  {
    code: "mismatch",
    label: "Datos no coinciden con el titular / vehículo",
    description:
      "El nombre, DUI, NIT o placa no coincide con el perfil registrado.",
  },
  {
    code: "notIssuedHere",
    label: "No emitido por entidad autorizada en El Salvador",
    description:
      "El documento debe ser emitido por VMT, SERTRACEN, PNC o aseguradora autorizada en SV.",
  },
];

export const DEFAULT_SV_DOCUMENT_REQUIREMENTS: Omit<DocumentRequirement, "id">[] =
  [
    {
      countryId: "sv",
      code: "driversLicense",
      name: "Licencia de Conducir Vigente (SERTRACEN / VMT)",
      description:
        "Licencia liviana, pesada o transporte público vigente emitida en El Salvador (frente y reverso).",
      required: true,
      appliesTo: "driver",
      requiresExpirationDate: true,
      order: 1,
      active: true,
    },
    {
      countryId: "sv",
      code: "identityDocument",
      name: "Documento Único de Identidad (DUI)",
      description:
        "DUI vigente del conductor salvadoreño legible por ambas caras.",
      required: true,
      appliesTo: "driver",
      requiresExpirationDate: true,
      order: 2,
      active: true,
    },
    {
      countryId: "sv",
      code: "vehicleRegistration",
      name: "Tarjeta de Circulación Vehicular (VMT)",
      description:
        "Tarjeta de circulación vigente correspondiente a la placa asignada (SUV, Pick-up o Microbús).",
      required: true,
      appliesTo: "vehicle",
      requiresExpirationDate: true,
      order: 3,
      active: true,
    },
    {
      countryId: "sv",
      code: "criminalRecord",
      name: "Solvencia de la Policía Nacional Civil (PNC)",
      description:
        "Constancia de carencia de antecedentes policiales emitida en los últimos 3 meses.",
      required: true,
      appliesTo: "driver",
      requiresExpirationDate: true,
      order: 4,
      active: true,
    },
    {
      countryId: "sv",
      code: "insuranceCard",
      name: "Póliza de Seguro de Daños a Terceros y Pasajeros",
      description:
        "Cobertura vigente para transporte corporativo B2B en El Salvador.",
      required: true,
      appliesTo: "vehicle",
      requiresExpirationDate: true,
      order: 5,
      active: true,
    },
  ];

export let FALLBACK_SV_VEHICLES: B2BVehicle[] = [
  {
    id: "vehSvSuv001",
    countryId: "sv",
    plate: "P-849201",
    brand: "Toyota",
    model: "Fortuner 2.8 TDI",
    year: 2024,
    color: "Blanco Perla",
    category: "suv",
    maxPassengers: 4,
    status: "active",
    driverId: "drvSv001",
    driverName: "Mauricio Ernesto Portillo",
    driverPhone: "+503 7845-1920",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    registrationNumber: "TC-SV-904811",
    registrationExpiresAt: "2027-08-30",
  },
  {
    id: "vehSvPickup002",
    countryId: "sv",
    plate: "P-731049",
    brand: "Toyota",
    model: "Hilux Doble Cabina 4x4",
    year: 2024,
    color: "Gris Metálico",
    category: "pickup",
    maxPassengers: 4,
    status: "active",
    driverId: "drvSv002",
    driverName: "Nelson Alexander Hernández",
    driverPhone: "+503 7612-8834",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    registrationNumber: "TC-SV-772190",
    registrationExpiresAt: "2027-11-15",
  },
  {
    id: "vehSvMicrobus003",
    countryId: "sv",
    plate: "MB-10428",
    brand: "Toyota",
    model: "Hiace Techo Alto 12 Pax",
    year: 2025,
    color: "Plata",
    category: "microbus",
    maxPassengers: 12,
    status: "active",
    driverId: "drvSv003",
    driverName: "Óscar René Valladares",
    driverPhone: "+503 7901-4452",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    registrationNumber: "TC-SV-551092",
    registrationExpiresAt: "2027-10-01",
  },
];

export let FALLBACK_SV_DOSSIERS: DriverVerificationDossier[] = [
  {
    driverId: "drvSv001",
    driverName: "Mauricio Ernesto Portillo",
    driverEmail: "mportillo.sv@lilo.app",
    driverPhone: "+503 7845-1920",
    dui: "04829103-4",
    countryId: "sv",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    vehicleId: "vehSvSuv001",
    vehiclePlate: "P-849201",
    vehicleCategory: "suv",
    overallStatus: "partiallyRejected",
    documents: [
      {
        id: "drvSv001DriversLicense",
        type: "driversLicense",
        name: "Licencia de Conducir Vigente (SERTRACEN)",
        appliesTo: "driver",
        expirationDate: "2028-05-20",
        status: "approved",
      },
      {
        id: "drvSv001IdentityDocument",
        type: "identityDocument",
        name: "Documento Único de Identidad (DUI)",
        appliesTo: "driver",
        documentNumber: "04829103-4",
        expirationDate: "2029-11-10",
        status: "approved",
      },
      {
        id: "drvSv001VehicleRegistration",
        type: "vehicleRegistration",
        name: "Tarjeta de Circulación Vehicular (VMT)",
        appliesTo: "vehicle",
        expirationDate: "2027-08-30",
        status: "rejected",
        rejectionReason: "illegible",
        rejectionReasonLabel: "Documento ilegible o borroso",
        rejectionNote:
          "Reverso con reflejo de flash en número de chasis. Subir nuevamente solo este documento.",
      },
      {
        id: "drvSv001CriminalRecord",
        type: "criminalRecord",
        name: "Solvencia de la Policía Nacional Civil (PNC)",
        appliesTo: "driver",
        expirationDate: "2026-12-31",
        status: "approved",
      },
      {
        id: "drvSv001InsuranceCard",
        type: "insuranceCard",
        name: "Póliza de Seguro Corporativo B2B",
        appliesTo: "vehicle",
        expirationDate: "2027-09-15",
        status: "approved",
      },
    ],
  },
  {
    driverId: "drvSv002",
    driverName: "Nelson Alexander Hernández",
    driverEmail: "nhernandez.sv@lilo.app",
    driverPhone: "+503 7612-8834",
    dui: "05192837-1",
    countryId: "sv",
    companyId: "XmXrFylloVeOIQhrGXG1",
    companyName: "Industrias El Ángel S.A. de C.V.",
    vehicleId: "vehSvPickup002",
    vehiclePlate: "P-731049",
    vehicleCategory: "pickup",
    overallStatus: "approved",
    documents: [
      {
        id: "drvSv002DriversLicense",
        type: "driversLicense",
        name: "Licencia de Conducir Vigente (SERTRACEN)",
        appliesTo: "driver",
        expirationDate: "2028-09-15",
        status: "approved",
      },
      {
        id: "drvSv002IdentityDocument",
        type: "identityDocument",
        name: "Documento Único de Identidad (DUI)",
        appliesTo: "driver",
        documentNumber: "05192837-1",
        expirationDate: "2029-04-20",
        status: "approved",
      },
      {
        id: "drvSv002VehicleRegistration",
        type: "vehicleRegistration",
        name: "Tarjeta de Circulación Vehicular (VMT)",
        appliesTo: "vehicle",
        expirationDate: "2027-11-15",
        status: "approved",
      },
      {
        id: "drvSv002CriminalRecord",
        type: "criminalRecord",
        name: "Solvencia de la Policía Nacional Civil (PNC)",
        appliesTo: "driver",
        expirationDate: "2027-01-30",
        status: "approved",
      },
      {
        id: "drvSv002InsuranceCard",
        type: "insuranceCard",
        name: "Póliza de Seguro Corporativo B2B",
        appliesTo: "vehicle",
        expirationDate: "2027-10-15",
        status: "approved",
      },
    ],
  },
];

// ============================================================================
// VEHÍCULOS B2B (Asociación Conductor + Vehículo + Empresa)
// ============================================================================

export const subscribeToB2BVehicles = (
  callback: (vehicles: B2BVehicle[]) => void,
  onError?: (error: any) => void
) => {
  let unsubscribeFirestore: (() => void) | null = null;
  let cancelled = false;

  auth.authStateReady().then(() => {
    if (cancelled) return;
    const q = query(
      collection(db, VEHICLES_COLLECTION),
      where("countryId", "==", "sv")
    );

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        const vehicles = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data();
          const rawCat = String(raw.category || "suv").toLowerCase();
          const category = (
            rawCat === "pickup" || rawCat === "microbus" ? rawCat : "suv"
          ) as B2BVehicle["category"];
          return {
            id: docSnap.id,
            countryId: raw.countryId || "sv",
            plate: raw.plate || raw.plateNumber || raw.licensePlate || "SIN-PLACA",
            brand: raw.brand || "Toyota",
            model: raw.model || "Unidad",
            year: Number(raw.year) || 2024,
            color: raw.color || "Blanco",
            category,
            maxPassengers:
              typeof raw.maxPassengers === "number"
                ? raw.maxPassengers
                : category === "microbus"
                ? 12
                : 4,
            status: raw.status || "active",
            driverId: raw.driverId,
            driverName: raw.driverName,
            driverPhone: raw.driverPhone,
            registrationNumber:
              raw.registrationNumber || raw.circulationCardNumber || "TC-SV-VIGENTE",
            registrationExpiresAt:
              raw.registrationExpiresAt || raw.circulationCardExpiry || "2027-12-31",
          } as B2BVehicle;
        });

        vehicles.sort((a, b) => (a.plate || "").localeCompare(b.plate || ""));
        callback(vehicles.length > 0 ? vehicles : FALLBACK_SV_VEHICLES);
      },
      () => {
        callback(FALLBACK_SV_VEHICLES);
      }
    );
  });

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
};

export const createB2BVehicle = async (
  data: Omit<B2BVehicle, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const payload = {
    ...data,
    countryId: "sv",
    plate: data.plate.toUpperCase().trim(),
    maxPassengers: data.category === "microbus" ? 12 : 4,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    const docRef = await addDoc(collection(db, VEHICLES_COLLECTION), payload);
    return docRef.id;
  } catch {
    const newId = `vehSv${Date.now()}`;
    FALLBACK_SV_VEHICLES = [
      ...FALLBACK_SV_VEHICLES,
      { id: newId, ...data, countryId: "sv", maxPassengers: data.category === "microbus" ? 12 : 4 },
    ];
    return newId;
  }
};

export const updateB2BVehicle = async (
  id: string,
  data: Partial<Omit<B2BVehicle, "id" | "createdAt">>
): Promise<void> => {
  const docRef = doc(db, VEHICLES_COLLECTION, id);
  const payload: Record<string, any> = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  if (data.plate) {
    payload.plate = data.plate.toUpperCase().trim();
  }
  if (data.category) {
    payload.maxPassengers = data.category === "microbus" ? 12 : 4;
  }
  try {
    await updateDoc(docRef, payload);
  } catch {
    FALLBACK_SV_VEHICLES = FALLBACK_SV_VEHICLES.map((v) =>
      v.id === id ? ({ ...v, ...payload } as B2BVehicle) : v
    );
  }
};

export const deleteB2BVehicle = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, VEHICLES_COLLECTION, id);
    await deleteDoc(docRef);
  } catch {
    FALLBACK_SV_VEHICLES = FALLBACK_SV_VEHICLES.filter((v) => v.id !== id);
  }
};

// ============================================================================
// REQUISITOS DOCUMENTALES EL SALVADOR (`documentRequirements`)
// ============================================================================

export const subscribeToDocumentRequirementsSV = (
  callback: (requirements: DocumentRequirement[]) => void,
  onError?: (error: any) => void
) => {
  let unsubscribeFirestore: (() => void) | null = null;
  let cancelled = false;

  const getFallbackReqs = () =>
    DEFAULT_SV_DOCUMENT_REQUIREMENTS.map((req, idx) => ({
      ...req,
      id: `sv${req.code.charAt(0).toUpperCase()}${req.code.slice(1)}${idx + 1}`,
    }));

  auth.authStateReady().then(() => {
    if (cancelled) return;
    const q = query(collection(db, DOC_REQUIREMENTS_COLLECTION));

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter(
            (d: any) => !d.countryId || d.countryId.toLowerCase() === "sv"
          ) as DocumentRequirement[];

        if (docs.length === 0) {
          callback(getFallbackReqs());
          return;
        }

        docs.sort((a, b) => (a.order || 99) - (b.order || 99));
        callback(docs);
      },
      () => {
        callback(getFallbackReqs());
      }
    );
  });

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
};

export const seedDefaultDocumentRequirementsSV = async (): Promise<void> => {
  for (const item of DEFAULT_SV_DOCUMENT_REQUIREMENTS) {
    const docId = `sv${item.code.charAt(0).toUpperCase()}${item.code.slice(1)}`;
    await setDoc(
      doc(db, DOC_REQUIREMENTS_COLLECTION, docId),
      {
        ...item,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
};

export const saveDocumentRequirementSV = async (
  id: string | null,
  data: Omit<DocumentRequirement, "id">
): Promise<string> => {
  if (id) {
    await setDoc(
      doc(db, DOC_REQUIREMENTS_COLLECTION, id),
      {
        ...data,
        countryId: "sv",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return id;
  } else {
    const docRef = await addDoc(collection(db, DOC_REQUIREMENTS_COLLECTION), {
      ...data,
      countryId: "sv",
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }
};

// ============================================================================
// EXPEDIENTES DE CONDUCTORES Y APROBACIÓN / RECHAZO (LO-5.5, LO-12.2, CF-31, CF-34, CF-35, CF-36)
// ============================================================================

export const UI_TO_BACKEND_DOC_TYPE: Record<DriverDocumentType, string> = {
  driversLicense: "driversLicense",
  identityDocument: "identityDocument",
  criminalRecord: "criminalRecord",
  insuranceCard: "insuranceCard",
  vehicleRegistration: "vehicleRegistration",
};

export const BACKEND_TO_UI_DOC_TYPE: Record<string, DriverDocumentType> = {
  svDriversLicense: "driversLicense",
  drivers_license: "driversLicense",
  driversLicense: "driversLicense",
  svIdentityDocument: "identityDocument",
  identity_document: "identityDocument",
  identityDocument: "identityDocument",
  svCriminalRecord: "criminalRecord",
  criminal_record: "criminalRecord",
  criminalRecord: "criminalRecord",
  svInsuranceCard: "insuranceCard",
  insurance_card: "insuranceCard",
  insuranceCard: "insuranceCard",
  svVehicleRegistration: "vehicleRegistration",
  vehicle_registration: "vehicleRegistration",
  vehicleRegistration: "vehicleRegistration",
};

const normalizeDriverDossier = (
  id: string,
  driverRaw: Record<string, any>,
  membershipRaw?: Record<string, any>,
  vehicleRaw?: Record<string, any>,
  userRaw?: Record<string, any>
): DriverVerificationDossier => {
  const membershipDocs: any[] = Array.isArray(membershipRaw?.documents)
    ? membershipRaw!.documents
    : [];

  const byType = new Map<string, any>();
  membershipDocs.forEach((d) => {
    if (d && d.type) {
      byType.set(d.type, d);
      const uiType = BACKEND_TO_UI_DOC_TYPE[d.type];
      if (uiType) byType.set(uiType, d);
    }
  });

  const legacyLicenseUrl =
    driverRaw.driverLicenseUrl || driverRaw.licenseImageUrl || driverRaw.licenciaUrl || "";
  const legacyDuiUrl = driverRaw.duiUrl || driverRaw.idCardUrl || driverRaw.profileImageUrl || "";
  const legacyCirculacionUrl =
    driverRaw.vehicleRegistrationUrl || driverRaw.vehicleRegistrationImageUrl || "";
  const legacyPncUrl = driverRaw.criminalRecordUrl || driverRaw.criminalRecordImageUrl || "";
  const legacyInsuranceUrl =
    driverRaw.insuranceUrl || driverRaw.insuranceCardImageUrl || "";

  const isMembershipActive = membershipRaw?.status === "active";
  const defaultDocStatus: DriverDocumentStatus =
    isMembershipActive || driverRaw.verified || driverRaw.verificationStatus === "verified"
      ? "approved"
      : "inReview";

  const buildDoc = (
    type: DriverDocumentType,
    name: string,
    appliesTo: "driver" | "vehicle",
    fallbackUrl: string
  ): DriverDocumentRecord => {
    const backendType = UI_TO_BACKEND_DOC_TYPE[type];
    const existing = byType.get(backendType) || byType.get(type);

    if (existing) {
      let uiStatus: DriverDocumentStatus = "inReview";
      if (existing.status === "accepted" || existing.status === "approved" || isMembershipActive) {
        uiStatus = "approved";
      } else if (existing.status === "rejected") {
        uiStatus = "rejected";
      } else if (existing.status === "expired") {
        uiStatus = "expired";
      }

      return {
        id: `${id}${type.charAt(0).toUpperCase()}${type.slice(1)}`,
        type,
        name: existing.name || name,
        appliesTo,
        fileUrl: existing.fileUrl || existing.url || fallbackUrl || undefined,
        documentNumber: existing.documentNumber || "",
        expirationDate: existing.expirationDate || existing.expiresAt || "2027-12-31",
        status: uiStatus,
        rejectionReason: existing.rejectionReason,
        rejectionReasonLabel:
          existing.rejectionReasonLabel ||
          (existing.rejectionReason
            ? REJECTION_REASONS_CATALOG.find((r) => r.code === existing.rejectionReason)?.label || existing.rejectionReason
            : undefined),
        rejectionNote: existing.rejectionNote,
        reviewedAt: existing.reviewedAt,
        reviewedBy: existing.reviewedBy,
        updatedAt: existing.uploadedAt || driverRaw.updatedAt || null,
      };
    }

    return {
      id: `${id}${type.charAt(0).toUpperCase()}${type.slice(1)}`,
      type,
      name,
      appliesTo,
      fileUrl: fallbackUrl || undefined,
      documentNumber: "",
      expirationDate: "2027-12-31",
      status: fallbackUrl ? defaultDocStatus : "inReview",
      updatedAt: driverRaw.updatedAt || null,
    };
  };

  const documents: DriverDocumentRecord[] = [
    buildDoc(
      "driversLicense",
      "Licencia de Conducir Vigente (SERTRACEN)",
      "driver",
      legacyLicenseUrl
    ),
    buildDoc(
      "identityDocument",
      "Documento Único de Identidad (DUI)",
      "driver",
      legacyDuiUrl
    ),
    buildDoc(
      "vehicleRegistration",
      "Tarjeta de Circulación Vehicular (VMT)",
      "vehicle",
      legacyCirculacionUrl
    ),
    buildDoc(
      "criminalRecord",
      "Solvencia de la Policía Nacional Civil (PNC)",
      "driver",
      legacyPncUrl
    ),
    buildDoc(
      "insuranceCard",
      "Póliza de Seguro Corporativo B2B",
      "vehicle",
      legacyInsuranceUrl
    ),
  ];

  const allApproved = isMembershipActive || documents.every((d) => d.status === "approved");
  const anyRejected = !isMembershipActive && documents.some((d) => d.status === "rejected");

  let overallStatus: DriverVerificationDossier["overallStatus"] = "inReview";
  if (allApproved) {
    overallStatus = "approved";
  } else if (anyRejected) {
    overallStatus = "partiallyRejected";
  }

  // CF-31: Resolver vehículo desde vehicleRaw (colección `vehicles`)
  const vPlate = vehicleRaw?.plate || vehicleRaw?.plateKey || undefined;
  const vCat = (vehicleRaw?.categoryId || vehicleRaw?.category || "suv") as "suv" | "pickup" | "microbus";

  const resolvedName =
    (userRaw ? `${userRaw.firstName || ""} ${userRaw.lastName || ""}`.trim() : "") ||
    driverRaw.name ||
    driverRaw.fullName ||
    `${driverRaw.firstName || ""} ${driverRaw.lastName || ""}`.trim() ||
    "Conductor sin nombre";

  return {
    driverId: id,
    driverName: resolvedName,
    driverEmail: userRaw?.email || driverRaw.email || "",
    driverPhone: userRaw?.phone || driverRaw.phone || driverRaw.phoneNumber || "",
    dui: driverRaw.dui || driverRaw.dni || driverRaw.documentNumber || "",
    countryId: driverRaw.countryId || "sv",
    companyId: driverRaw.companyId || undefined,
    companyName: driverRaw.companyName || undefined,
    vehicleId: vehicleRaw?.id || undefined,
    vehiclePlate: vPlate,
    vehicleCategory: vCat,
    overallStatus,
    documents,
    updatedAt: driverRaw.updatedAt || null,
  };
};

export const subscribeToDriverDossiersSV = (
  callback: (dossiers: DriverVerificationDossier[]) => void,
  onError?: (error: any) => void
) => {
  let unsubscribeFirestore: (() => void) | null = null;
  let cancelled = false;

  auth.authStateReady().then(() => {
    if (cancelled) return;
    // CF-05 / CF-06: Consulta acotada a countryId == 'sv' para satisfacer reglas de seguridad
    const q = query(
      collection(db, DRIVERS_COLLECTION),
      where("countryId", "==", "sv")
    );

    unsubscribeFirestore = onSnapshot(
      q,
      async (snapshot) => {
        try {
          const svDrivers = snapshot.docs;

          // Para cada conductor en SV, consultar en paralelo su perfil de usuario, membresía oficial y vehículo (CF-31, CF-34)
          const dossiers = await Promise.all(
            svDrivers.map(async (docSnap) => {
              const driverId = docSnap.id;
              const driverRaw = docSnap.data();

              let userRaw: Record<string, any> | undefined;
              try {
                const uSnap = await getDoc(doc(db, "users", driverId));
                if (uSnap.exists()) {
                  userRaw = uSnap.data();
                }
              } catch (e) {
                // fallback
              }

              let membershipRaw: Record<string, any> | undefined;
              try {
                const memSnap = await getDoc(doc(db, "users", driverId, "countryMemberships", "sv"));
                if (memSnap.exists()) {
                  membershipRaw = memSnap.data();
                }
              } catch (e) {
                // fallback
              }

              let vehicleRaw: Record<string, any> | undefined;
              try {
                const vQ = query(
                  collection(db, VEHICLES_COLLECTION),
                  where("driverId", "==", driverId),
                  where("countryId", "==", "sv")
                );
                const vSnap = await getDocs(vQ);
                if (!vSnap.empty) {
                  vehicleRaw = { id: vSnap.docs[0].id, ...vSnap.docs[0].data() };
                }
              } catch (e) {
                // fallback
              }

              return normalizeDriverDossier(driverId, driverRaw, membershipRaw, vehicleRaw, userRaw);
            })
          );

          callback(dossiers.length > 0 ? dossiers : FALLBACK_SV_DOSSIERS);
        } catch (err) {
          console.warn("[subscribeToDriverDossiersSV] Note mapping dossiers:", err);
          callback(FALLBACK_SV_DOSSIERS);
        }
      },
      () => {
        callback(FALLBACK_SV_DOSSIERS);
      }
    );
  });

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
};

export const reviewDriverDocumentSV = async (params: {
  driverId: string;
  documentType: DriverDocumentType;
  decision: "approved" | "rejected";
  rejectionReason?: RejectionReasonCode;
  rejectionNote?: string;
  expirationDate?: string;
  documentNumber?: string;
  reviewedByEmail?: string;
}): Promise<void> => {
  const {
    driverId,
    documentType,
    decision,
    rejectionReason,
    rejectionNote,
    expirationDate,
    documentNumber,
    reviewedByEmail,
  } = params;

  const reasonObj = REJECTION_REASONS_CATALOG.find((r) => r.code === rejectionReason);
  const backendDocType = UI_TO_BACKEND_DOC_TYPE[documentType] || documentType;

  // 1. CF-36: Invocar Cloud Function `reviewMembershipDocument` para actualizar el estado del documento en `countryMemberships/sv`
  try {
    const reviewDocFn = httpsCallable<
      {
        userId: string;
        code: string;
        type: string;
        decision: "accepted" | "rejected";
        rejectionReason?: string;
      },
      { success: boolean }
    >(functions, "reviewMembershipDocument");

    await reviewDocFn({
      userId: driverId,
      code: "sv",
      type: backendDocType,
      decision: decision === "approved" ? "accepted" : "rejected",
      ...(decision === "rejected" && {
        rejectionReason: rejectionReason || rejectionNote || reasonObj?.label || "illegible",
      }),
    });
  } catch (cfErr: any) {
    console.warn("[reviewDriverDocumentSV] reviewMembershipDocument note:", cfErr?.code, cfErr?.message);
  }

  // 2. Obtener expediente de país actualizado en `users/{driverId}/countryMemberships/sv`
  const membershipRef = doc(db, "users", driverId, "countryMemberships", "sv");
  let membershipData: Record<string, any> = {};
  try {
    const memSnap = await getDoc(membershipRef);
    if (memSnap.exists()) {
      membershipData = memSnap.data();
    }
  } catch (e) {
    console.warn("[reviewDriverDocumentSV] Note reading countryMemberships/sv:", e);
  }

  const driverRef = doc(db, DRIVERS_COLLECTION, driverId);
  let driverData: Record<string, any> = {};
  try {
    const dSnap = await getDoc(driverRef);
    if (dSnap.exists()) {
      driverData = dSnap.data();
    }
  } catch (e) {}

  const currentDossier = normalizeDriverDossier(driverId, driverData, membershipData);

  const updatedDocuments = currentDossier.documents.map((docItem) => {
    if (docItem.type !== documentType) {
      return docItem;
    }

    const updated: DriverDocumentRecord = {
      ...docItem,
      status: decision,
      reviewedBy: reviewedByEmail || "superAdminSv",
      reviewedAt: new Date().toISOString(),
    };

    if (expirationDate !== undefined) {
      updated.expirationDate = expirationDate;
    }
    if (documentNumber !== undefined) {
      updated.documentNumber = documentNumber;
    }

    if (decision === "rejected") {
      updated.rejectionReason = rejectionReason || "illegible";
      updated.rejectionReasonLabel = reasonObj?.label || "Observación en documento";
      updated.rejectionNote = rejectionNote || "";
    } else {
      delete updated.rejectionReason;
      delete updated.rejectionReasonLabel;
      delete updated.rejectionNote;
    }

    return updated;
  });

  const allDriverDocsApproved = updatedDocuments
    .filter((d) => d.appliesTo === "driver")
    .every((d) => d.status === "approved");
  const allApproved = updatedDocuments.every((d) => d.status === "approved");

  // 3. CF-34: Si todos los documentos obligatorios del conductor están aceptados, invocar Cloud Function `approveCountryMembership`
  if (allDriverDocsApproved || allApproved) {
    try {
      const approveMembershipFn = httpsCallable<
        { userId: string; code: string },
        { success: boolean }
      >(functions, "approveCountryMembership");

      await approveMembershipFn({
        userId: driverId,
        code: "sv",
      });
      console.log(`[reviewDriverDocumentSV] ✅ approveCountryMembership ejecutada para ${driverId}`);
    } catch (cfErr: any) {
      console.warn("[reviewDriverDocumentSV] approveCountryMembership callable note:", cfErr?.code, cfErr?.message);
    }

    // CF-37: Invocar setDriverVerification oficial
    try {
      const setVerificationFn = httpsCallable<
        { driverId: string; verified: boolean; reason?: string },
        { driverId: string; verificationStatus: "verified" | "rejected" }
      >(functions, "setDriverVerification");
      await setVerificationFn({
        driverId,
        verified: true,
      });
      console.log(`[reviewDriverDocumentSV] ✅ setDriverVerification ejecutada para ${driverId}`);
    } catch (verErr: any) {
      console.warn("[reviewDriverDocumentSV] setDriverVerification callable note:", verErr?.code, verErr?.message);
    }
  }

  // 4. CF-31: Actualizar `drivers/{driverId}` SIN escribir b2bDocuments, b2bVerificationStatus o vehicles
  try {
    await updateDoc(driverRef, {
      verificationStatus: allApproved ? "verified" : "pending",
      updatedAt: serverTimestamp(),
      b2bDocuments: deleteField(),
      b2bVerificationStatus: deleteField(),
      vehicles: deleteField(),
      vehicleBrand: deleteField(),
      vehicleModel: deleteField(),
      color: deleteField(),
      licensePlate: deleteField(),
    });
  } catch (err) {
    console.warn("[reviewDriverDocumentSV] Note updating drivers doc:", err);
  }
};

export const createB2BDriverDossierSV = async (data: {
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  dui: string;
  companyId?: string;
  companyName?: string;
  vehiclePlate?: string;
  vehicleCategory?: "suv" | "pickup" | "microbus";
}): Promise<string> => {
  const initialDocs: DriverDocumentRecord[] =
    DEFAULT_SV_DOCUMENT_REQUIREMENTS.map((req) => ({
      id: `${req.code}${Date.now()}`,
      type: req.code,
      name: req.name,
      appliesTo: req.appliesTo === "vehicle" ? "vehicle" : "driver",
      status: "inReview",
      documentNumber: req.code === "identityDocument" ? data.dui : "",
      expirationDate: "2027-12-31",
    }));

  try {
    // 1. Crear documento driver SIN b2bDocuments ni b2bVerificationStatus
    const docRef = await addDoc(collection(db, DRIVERS_COLLECTION), {
      name: data.driverName,
      email: data.driverEmail,
      phone: data.driverPhone,
      dui: data.dui,
      countryId: "sv",
      companyId: data.companyId || null,
      companyName: data.companyName || null,
      verified: false,
      verificationStatus: "pending",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Crear documento oficial en users/{uid}/countryMemberships/sv
    try {
      const backendDocsPayload = initialDocs.map((d) => ({
        type: UI_TO_BACKEND_DOC_TYPE[d.type] || d.type,
        url: "",
        status: "pending",
        uploadedAt: new Date().toISOString(),
        expiresAt: d.expirationDate || "2027-12-31",
        documentNumber: d.documentNumber || "",
      }));

      await setDoc(doc(db, "users", docRef.id, "countryMemberships", "sv"), {
        code: "sv",
        status: "pending",
        documents: backendDocsPayload,
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (memErr) {
      console.warn("[createB2BDriverDossierSV] countryMemberships note:", memErr);
    }

    // 3. Si se especificó placa, registrar en la colección `vehicles` (CF-31)
    if (data.vehiclePlate) {
      try {
        const plate = data.vehiclePlate.trim().toUpperCase();
        await addDoc(collection(db, VEHICLES_COLLECTION), {
          driverId: docRef.id,
          countryId: "sv",
          plate,
          plateKey: plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          brand: "Toyota",
          model: "Unidad",
          color: "Blanco",
          categoryId: data.vehicleCategory || "suv",
          maxPassengers: data.vehicleCategory === "microbus" ? 12 : 4,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (vehErr) {
        console.warn("[createB2BDriverDossierSV] vehicles note:", vehErr);
      }
    }

    return docRef.id;
  } catch {
    const newId = `drvSv${Date.now()}`;
    FALLBACK_SV_DOSSIERS = [
      ...FALLBACK_SV_DOSSIERS,
      {
        driverId: newId,
        driverName: data.driverName,
        driverEmail: data.driverEmail,
        driverPhone: data.driverPhone,
        dui: data.dui,
        countryId: "sv",
        companyId: data.companyId,
        companyName: data.companyName,
        vehiclePlate: data.vehiclePlate?.toUpperCase(),
        vehicleCategory: data.vehicleCategory || "suv",
        overallStatus: "inReview",
        documents: initialDocs,
      },
    ];
    return newId;
  }
};
