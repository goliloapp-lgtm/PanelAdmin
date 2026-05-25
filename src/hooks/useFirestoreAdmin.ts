import { useState, useCallback } from 'react';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { firebaseApp } from '@/utils/firebase';
import { auth } from '@/utils/auth';
import { useAdmin } from './useAdmin';

const db = getFirestore(firebaseApp);

interface UseFirestoreAdminReturn<T> {
  getAll: (collectionName: string) => Promise<T[]>;
  getById: (collectionName: string, id: string) => Promise<T | null>;
  create: (collectionName: string, data: Partial<T>) => Promise<string>;
  update: (collectionName: string, id: string, data: Partial<T>) => Promise<void>;
  remove: (collectionName: string, id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const useFirestoreAdmin = <T>(): UseFirestoreAdminReturn<T> => {
  const { isAdmin } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAll = useCallback(async (collectionName: string): Promise<T[]> => {
    setLoading(true);
    setError(null);
    try {
      const colRef = collection(db, collectionName);
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error obteniendo documentos';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getById = useCallback(async (collectionName: string, id: string): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, id);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as T : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error obteniendo documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (collectionName: string, data: Partial<T>): Promise<string> => {
    if (!isAdmin) {
      throw new Error('No tienes permisos para crear documentos (requiere rol admin)');
    }
    setLoading(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      const colRef = collection(db, collectionName);
      const docRef = await addDoc(colRef, {
        ...data,
        createdAt: Timestamp.now(),
        createdBy: currentUser?.uid || null,
      });
      return docRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error creando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const update = useCallback(async (collectionName: string, id: string, data: Partial<T>): Promise<void> => {
    if (!isAdmin) {
      throw new Error('No tienes permisos para actualizar documentos (requiere rol admin)');
    }
    setLoading(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
        updatedBy: currentUser?.uid || null,
      } as any);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error actualizando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const remove = useCallback(async (collectionName: string, id: string): Promise<void> => {
    if (!isAdmin) {
      throw new Error('No tienes permisos para eliminar documentos (requiere rol admin)');
    }
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error eliminando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  return {
    getAll,
    getById,
    create,
    update,
    remove,
    loading,
    error,
  };
};
