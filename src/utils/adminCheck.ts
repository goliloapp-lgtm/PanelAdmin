import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseApp } from './firebase';

const db = getFirestore(firebaseApp);

/**
 * Checks if the user with the given UID has an 'admin' role.
 * Supports both:
 * 1. Simple 'role' string field in the user document equals 'admin' (e.g. users/{uid}.role === 'admin').
 * 2. The 'role' field in the user document contains the ID of a document in the 'roles' collection,
 *    and that role document has the name 'admin'.
 * 
 * @param uid User identifier
 * @returns boolean indicating if the user is an administrator
 */
export async function isUserAdmin(uid: string): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return false;
    }

    const userData = userSnap.data();
    const roleId = userData?.role;

    if (!roleId) {
      return false;
    }

    // Direct check (case-insensitive) if role string is directly 'admin'
    if (typeof roleId === 'string' && roleId.toLowerCase() === 'admin') {
      return true;
    }

    // Reference check in the 'roles' collection
    const roleRef = doc(db, 'roles', roleId);
    const roleSnap = await getDoc(roleRef);

    if (!roleSnap.exists()) {
      return false;
    }

    const roleData = roleSnap.data();
    return roleData?.name?.toLowerCase() === 'admin';
  } catch (error) {
    console.error('Error verifying admin status:', error);
    return false;
  }
}

/**
 * Retrieves the user's role name and description.
 * 
 * @param uid User identifier
 * @returns Role data or null
 */
export async function getUserRole(uid: string): Promise<{ name: string; description: string } | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return null;
    }

    const userData = userSnap.data();
    const roleId = userData?.role;

    if (!roleId) {
      return null;
    }

    // If it's directly the string 'admin'
    if (typeof roleId === 'string' && roleId.toLowerCase() === 'admin') {
      return {
        name: 'admin',
        description: 'Administrador del sistema',
      };
    }

    // Retrieve from 'roles' collection
    const roleRef = doc(db, 'roles', roleId);
    const roleSnap = await getDoc(roleRef);

    if (!roleSnap.exists()) {
      return null;
    }

    const roleData = roleSnap.data();
    return {
      name: roleData?.name || '',
      description: roleData?.description || '',
    };
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}
