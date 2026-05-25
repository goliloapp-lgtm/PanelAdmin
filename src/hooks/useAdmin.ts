import { useState, useEffect } from 'react';
import { auth } from '@/utils/auth';
import { isUserAdmin, getUserRole } from '@/utils/adminCheck';

interface UseAdminReturn {
  isAdmin: boolean;
  isLoading: boolean;
  roleName: string | null;
  error: string | null;
}

export const useAdmin = (): UseAdminReturn => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setRoleName(null);
        setIsLoading(false);
        return;
      }

      try {
        const adminStatus = await isUserAdmin(user.uid);
        setIsAdmin(adminStatus);
        
        const roleData = await getUserRole(user.uid);
        if (roleData) {
          setRoleName(roleData.name);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error verificando admin');
        setIsAdmin(false);
        setRoleName(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { isAdmin, isLoading, roleName, error };
};
