import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  QueryConstraint,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from './firebase';

const db = getFirestore(firebaseApp);

export interface SessionClaims {
  admin: boolean;
  superAdmin: boolean;
  countryIds: string[];
  companyId: string | null;
  companyRole: 'company_admin' | 'operator' | 'analyst' | null;
  role?: string | null;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Administrador General',
  operaciones: 'Operaciones y Despacho',
  atencion_cliente: 'Atención al Cliente',
};

/**
 * Reads custom claims from the current Firebase Auth token (CF-04, CF-20).
 * Defaults countryIds to ['sv'] when empty so queries are always country-scoped (CF-05).
 */
export async function getSessionClaims(forceRefresh = false): Promise<SessionClaims> {
  try {
    const auth = getAuth(firebaseApp);
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return {
        admin: false,
        superAdmin: false,
        countryIds: ['sv'],
        companyId: null,
        companyRole: null,
        role: null,
      };
    }

    let tokenResult = await currentUser.getIdTokenResult(forceRefresh);
    let claims = tokenResult.claims || {};

    // CF-05: Si el token en caché no tiene 'sv' o superAdmin, forzar refresco con el servidor
    if (!claims.superAdmin && (!Array.isArray(claims.countryIds) || !claims.countryIds.includes('sv'))) {
      try {
        tokenResult = await currentUser.getIdTokenResult(true);
        claims = tokenResult.claims || {};
      } catch (e) {
        // Fallback silencioso si no hay conexión
      }
    }

    const rawCountries = Array.isArray(claims.countryIds)
      ? (claims.countryIds as string[]).filter((c) => typeof c === 'string' && c.trim().length > 0)
      : [];

    const isSuper = Boolean(claims.superAdmin);
    const countries = isSuper
      ? Array.from(new Set(['sv', 've', 'us', ...rawCountries]))
      : Array.from(new Set(['sv', ...rawCountries]));

    return {
      admin: Boolean(claims.admin),
      superAdmin: isSuper,
      countryIds: countries,
      companyId: typeof claims.companyId === 'string' ? claims.companyId : null,
      companyRole:
        claims.companyRole === 'company_admin' ||
        claims.companyRole === 'operator' ||
        claims.companyRole === 'analyst'
          ? claims.companyRole
          : null,
      role: typeof claims.role === 'string' ? claims.role : null,
    };
  } catch (error) {
    console.warn('Error reading session claims, using default country scope [sv]:', error);
    return {
      admin: false,
      superAdmin: false,
      countryIds: ['sv'],
      companyId: null,
      companyRole: null,
      role: null,
    };
  }
}

/**
 * Executes country-scoped Firestore queries by iterating over each country in the admin's
 * custom claim `countryIds` (or a single `selectedCountry`) and merging results client-side (CF-05).
 */
export async function queryScopedCollection<T = Record<string, any>>(
  collectionName: string,
  extraConstraints: QueryConstraint[] = [],
  selectedCountry?: string
): Promise<Array<T & { id: string }>> {
  const claims = await getSessionClaims(false);
  const countries = selectedCountry
    ? [selectedCountry]
    : claims.countryIds.length > 0
      ? claims.countryIds
      : ['sv'];

  const snaps = await Promise.all(
    countries.map(async (cc) => {
      try {
        return await getDocs(
          query(collection(db, collectionName), where('countryId', '==', cc), ...extraConstraints)
        );
      } catch (err: any) {
        console.warn(
          `[queryScopedCollection] Scope query for ${collectionName} in ${cc} skipped or denied:`,
          err?.code || err?.message
        );
        return { docs: [] };
      }
    })
  );

  const byId = new Map<string, T & { id: string }>();
  for (const snap of snaps) {
    snap.docs.forEach((docSnap) => {
      byId.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as T) });
    });
  }
  return Array.from(byId.values());
}

/**
 * Checks if the user with the given UID has an 'admin' role.
 * CF-04: Checks custom claims exclusively. Does not read roles/{roleId} which requires admin privilege.
 */
export async function isUserAdmin(uid: string): Promise<boolean> {
  try {
    const claims = await getSessionClaims(false);
    return Boolean(claims.admin || claims.superAdmin);
  } catch (error) {
    console.error('Error verifying admin status:', error);
    return false;
  }
}

/**
 * Retrieves the user's role name and description without failing if `roles/{roleId}` is restricted to isAdmin() (CF-04, CF-09).
 */
export async function getUserRole(uid: string): Promise<{ name: string; description: string } | null> {
  try {
    const claims = await getSessionClaims(false);
    if (claims.superAdmin) {
      return { name: 'superAdmin', description: 'Super Administrador' };
    }
    if (claims.admin) {
      return { name: 'admin', description: ROLE_DESCRIPTIONS.admin };
    }
    if (claims.role && ['operaciones', 'atencion_cliente'].includes(claims.role.toLowerCase())) {
      const normalized = claims.role.toLowerCase();
      return { name: normalized, description: ROLE_DESCRIPTIONS[normalized] || normalized };
    }

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return null;
    }

    const userData = userSnap.data();
    const roleId = String(userData?.role || '').trim();

    if (!roleId) {
      return null;
    }

    const normalizedRole = roleId.toLowerCase();
    if (['admin', 'operaciones', 'atencion_cliente'].includes(normalizedRole)) {
      return {
        name: normalizedRole,
        description: ROLE_DESCRIPTIONS[normalizedRole] || normalizedRole,
      };
    }

    return {
      name: roleId,
      description: ROLE_DESCRIPTIONS[normalizedRole] || '',
    };
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

/**
 * Checks if the user with the given UID is authorized to access the dashboard.
 * CF-04: Authorized roles are: custom claim `admin == true`, `superAdmin == true`,
 * or operator/support roles.
 */
export async function hasDashboardAccess(uid: string): Promise<boolean> {
  try {
    const claims = await getSessionClaims(false);
    if (claims.admin || claims.superAdmin) {
      return true;
    }

    if (claims.role && ['operaciones', 'atencion_cliente'].includes(claims.role.toLowerCase())) {
      return true;
    }

    const roleData = await getUserRole(uid);
    if (!roleData) {
      return false;
    }
    const roleName = roleData.name.toLowerCase();
    return ['admin', 'operaciones', 'atencion_cliente'].includes(roleName);
  } catch (error) {
    console.error('Error verifying dashboard access:', error);
    return false;
  }
}

