# Guía de Implementación Frontend - Sistema de Roles Admin (Next.js + TypeScript)

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Configuración de Firebase](#configuración-de-firebase)
3. [Estructura de Datos](#estructura-de-datos)
4. [Funciones de Verificación](#funciones-de-verificación)
5. [Hooks Personalizados](#hooks-personalizados)
6. [Componentes de Ejemplo](#componentes-de-ejemplo)
7. [Protección de Rutas](#protección-de-rutas)
8. [Operaciones CRUD](#operaciones-crud)
9. [Pruebas](#pruebas)
10. [Errores Comunes](#errores-comunes)

---

## Introducción

### ¿Qué es el sistema de roles admin?

El sistema de roles permite que usuarios con rol de **admin** tengan acceso completo de lectura y escritura a todas las colecciones de Cloud Firestore. Esto es necesario para el dashboard de administración.

### Cómo funciona

1. El documento del usuario en `users/{userId}` tiene un campo `role` que contiene el UID del documento del rol en la colección `roles`
2. Las reglas de Firestore verifican este UID para determinar si el usuario es admin
3. Si el usuario es admin, tiene acceso completo a todas las colecciones

---

## Configuración de Firebase

### 1. Instalar dependencias

```bash
npm install firebase
```

### 2. Configurar Firestore

```typescript
// src/lib/firebase/config.ts
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  app = getApps()[0];
  db = getFirestore(app);
  auth = getAuth(app);
}

export { app, db, auth };
```

---

## Estructura de Datos

### Documento de usuario

```typescript
interface User {
  uid: string;
  email: string;
  name: string;
  phone: string;
  userType: 'client' | 'driver';
  isActive: boolean;
  role?: string;  // UID del documento en colección roles
  createdAt: Date;
  // ...otros campos
}
```

### Documento de rol

```typescript
interface Role {
  name: string;        // ej: "admin", "conductor", "cliente"
  description: string; // ej: "Administrador del sistema"
}
```

---

## Funciones de Verificación

### Verificar si el usuario es admin

```typescript
// src/lib/firebase/adminCheck.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Verifica si el usuario actual tiene rol de admin
 * @param userId - UID del usuario
 * @returns Promise<boolean> - true si es admin
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await doc(db, 'users', userId).get();
    
    if (!userDoc.exists()) {
      return false;
    }
    
    const userData = userDoc.data();
    const roleId = userData?.role;
    
    if (!roleId) {
      return false;
    }
    
    const roleDoc = await doc(db, 'roles', roleId).get();
    
    return roleDoc.exists();
  } catch (error) {
    console.error('Error verificando rol de admin:', error);
    return false;
  }
}

/**
 * Obtiene los datos del rol del usuario
 * @param userId - UID del usuario
 * @returns Promise<Role | null>
 */
export async function getUserRole(userId: string): Promise<{ name: string; description: string } | null> {
  try {
    const userDoc = await doc(db, 'users', userId).get();
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data();
    const roleId = userData?.role;
    
    if (!roleId) {
      return null;
    }
    
    const roleDoc = await doc(db, 'roles', roleId).get();
    
    if (!roleDoc.exists()) {
      return null;
    }
    
    return roleDoc.data() as { name: string; description: string };
  } catch (error) {
    console.error('Error obteniendo rol del usuario:', error);
    return null;
  }
}
```

---

## Hooks Personalizados

### Hook para verificar rol de admin

```typescript
// src/hooks/useAdmin.ts
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth'; // Tu hook de autenticación existente
import { isUserAdmin } from '@/lib/firebase/adminCheck';

interface UseAdminReturn {
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useAdmin = (): UseAdminReturn => {
  const { user, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (authLoading) {
        return;
      }

      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        const adminStatus = await isUserAdmin(user.uid);
        setIsAdmin(adminStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error verificando admin');
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, authLoading]);

  return { isAdmin, isLoading, error };
};
```

### Hook para operaciones CRUD con verificación de permisos

```typescript
// src/hooks/useFirestoreAdmin.ts
import { useState, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from './useAdmin';

interface UseFirestoreAdminReturn<T> {
  // Lectura
  getAll: (collectionName: string) => Promise<T[]>;
  getById: (collectionName: string, id: string) => Promise<T | null>;
  query: (collectionName: string, conditions: WhereFilterOp[]) => Promise<T[]>;
  
  // Escritura
  create: (collectionName: string, data: Partial<T>) => Promise<string>;
  update: (collectionName: string, id: string, data: Partial<T>) => Promise<void>;
  remove: (collectionName: string, id: string) => Promise<void>;
  
  // Estado
  loading: boolean;
  error: string | null;
}

export const useFirestoreAdmin = <T>(): UseFirestoreAdminReturn<T> => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAll = useCallback(async (collectionName: string): Promise<T[]> => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await collection(db, collectionName).get();
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
      const snapshot = await docRef.get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as T : null;
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
      throw new Error('No tienes permisos para crear documentos');
    }
    setLoading(true);
    setError(null);
    try {
      const docRef = await collection(db, collectionName).add({
        ...data,
        createdAt: Timestamp.now(),
        createdBy: user?.uid,
      });
      return docRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error creando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  const update = useCallback(async (collectionName: string, id: string, data: Partial<T>): Promise<void> => {
    if (!isAdmin) {
      throw new Error('No tienes permisos para actualizar documentos');
    }
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, id);
      await docRef.update({
        ...data,
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error actualizando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  const remove = useCallback(async (collectionName: string, id: string): Promise<void> => {
    if (!isAdmin) {
      throw new Error('No tienes permisos para eliminar documentos');
    }
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, id);
      await docRef.delete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error eliminando documento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

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
```

---

## Componentes de Ejemplo

### Componente de verificación de admin

```tsx
// src/components/admin/AdminGuard.tsx
'use client';

import { useAdmin } from '@/hooks/useAdmin';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AdminGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AdminGuard({ children, fallback = null }: AdminGuardProps) {
  const { isAdmin, isLoading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.push('/unauthorized');
    }
  }, [isAdmin, isLoading, router]);

  if (isLoading) {
    return <div>Cargando...</div>;
  }

  if (!isAdmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

### Componente de tabla de usuarios (solo admin)

```tsx
// src/components/admin/UsersTable.tsx
'use client';

import { useState, useEffect } from 'react';
import { useFirestoreAdmin } from '@/hooks/useFirestoreAdmin';

interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  userType: string;
  isActive: boolean;
  role?: string;
}

export default function UsersTable() {
  const { getAll, remove, loading, error } = useFirestoreAdmin<User>();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const data = await getAll('users');
    setUsers(data);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      await remove('users', id);
      loadUsers();
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <table className="min-w-full">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Tipo</th>
          <th>Activo</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {users.map(user => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.email}</td>
            <td>{user.userType}</td>
            <td>{user.isActive ? 'Sí' : 'No'}</td>
            <td>
              <button onClick={() => handleDelete(user.id)}>
                Eliminar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Protección de Rutas

### Middleware para proteger rutas de admin

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth } from '@/lib/firebase/admin'; // Firebase Admin SDK para server-side

export async function middleware(request: NextRequest) {
  // Solo verificar rutas de admin
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Obtener token de sesión
  const sessionCookie = request.cookies.get('session');

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Verificar token en el servidor
    const auth = getAuth();
    const decodedToken = await auth.verifySessionCookie(sessionCookie.value);
    
    // Aquí podrías agregar verificación de rol de admin si es necesario
    
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

### Página de admin con protección

```tsx
// src/app/admin/page.tsx
import { AdminGuard } from '@/components/admin/AdminGuard';
import UsersTable from '@/components/admin/UsersTable';

export default function AdminPage() {
  return (
    <AdminGuard>
      <div className="p-4">
        <h1>Panel de Administración</h1>
        <UsersTable />
      </div>
    </AdminGuard>
  );
}
```

---

## Operaciones CRUD

### Ejemplos de operaciones

```typescript
// Ejemplo: Crear un nuevo usuario desde admin
const { create } = useFirestoreAdmin<User>();

await create('users', {
  email: 'nuevo@ejemplo.com',
  name: 'Nuevo Usuario',
  phone: '+1234567890',
  userType: 'client',
  isActive: true,
});

// Ejemplo: Actualizar un usuario
const { update } = useFirestoreAdmin<User>();

await update('users', userId, {
  name: 'Nombre Actualizado',
  isActive: false,
});

// Ejemplo: Eliminar un usuario
const { remove } = useFirestoreAdmin<User>();

await remove('users', userId);
```

---

## Pruebas

### Test de verificación de admin

```typescript
// __tests__/lib/adminCheck.test.ts
import { isUserAdmin } from '@/lib/firebase/adminCheck';

// Mock de Firestore
jest.mock('@/lib/firebase/config', () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
      }),
    }),
  },
}));

describe('isUserAdmin', () => {
  it('debe retornar true para usuario admin', async () => {
    // Implementar test con mocks
  });

  it('debe retornar false para usuario sin rol', async () => {
    // Implementar test con mocks
  });
});
```

---

## Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `PERMISSION_DENIED` | Usuario no es admin | Verificar que el campo `role` esté asignado en el documento del usuario |
| `Document not found` | El documento del rol no existe | Crear documento en colección `roles` y asignar UID al campo `role` del usuario |
| `null value` | El campo `role` es null | Asignar un valor al campo `role` en el documento del usuario |

---

## Notas Importantes

1. **Verificación del lado del cliente**: Las funciones de verificación de admin son del lado del cliente
2. **Seguridad en reglas**: Las reglas de Firestore también verifican el rol, así que las operaciones serán bloqueadas si no eres admin
3. **Obtener el UID del rol**: Cuando crees un rol en la colección `roles`, copia el UID del documento para asignarlo al campo `role` del usuario

---

## Recursos Adicionales

- [Documentación de Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Console - Firestore](https://console.firebase.google.com/project/_/firestore)
- [Firebase Rules](https://firebase.google.com/docs/firestore/security)