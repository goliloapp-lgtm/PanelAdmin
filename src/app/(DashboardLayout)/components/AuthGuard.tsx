"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, logout } from "@/utils/auth";
import { isUserAdmin } from "@/utils/adminCheck";
import toast from "react-hot-toast";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const adminStatus = await isUserAdmin(user.uid);
          if (adminStatus) {
            setIsAuth(true);
          } else {
            toast.error("Acceso denegado: Se requieren permisos de administrador.");
            setIsAuth(false);
            await logout();
            router.replace("/authentication/login");
          }
        } catch (error) {
          console.error("Error al validar rol de administrador:", error);
          toast.error("Ocurrió un error al verificar tus permisos.");
          setIsAuth(false);
          await logout();
          router.replace("/authentication/login");
        }
      } else {
        setIsAuth(false);
        router.replace("/authentication/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Cargando administrador...</div>;
  if (!isAuth) return null;

  return <>{children}</>;
}