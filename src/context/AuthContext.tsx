// src/context/AuthContext.tsx
//
// Migrado a Supabase Auth — reemplaza Firebase Auth.
// El login usa el formato {username}@navas.com (compatible con usuarios existentes).

import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { EMAIL_DOMAIN } from '../config';
import type { User } from '../types';

interface AuthContextType {
  /** Usuario efectivo: si hay una vista previa activa, refleja el rol/empresa
   *  del tenant impersonado; si no, es el perfil real del usuario. Toda la app
   *  (DataContext, routing, nav, permissions) consume reales por aquí. */
  currentUser: User | null;
  /** Estado de vista previa como admin de otra empresa (impersonación de tenant). */
  impersonation: { companyId: string; role: User['role'] } | null;
  loading: boolean;
  login: (username: string, password: string, companyId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => void;
  /** Entra en vista previa como admin de la empresa indicada (solo super_admin). */
  startImpersonation: (companyId: string) => Promise<boolean>;
  /** Sale de la vista previa y vuelve al perfil real del usuario. */
  stopImpersonation: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Convierte el perfil de la BD (snake_case) al modelo User (camelCase)
 */
function mapUserProfile(data: any): User | null {
  if (!data) return null;

  return {
    id: data.id,
    companyId: data.company_id,
    name: data.name,
    role: data.role,
    username: data.username,
    email: data.email || undefined,
    identification: data.identification || undefined,
    address: data.address || undefined,
    latitude: data.latitude || undefined,
    longitude: data.longitude || undefined,
    locationUpdatedAt: data.location_updated_at || undefined,
    fcmToken: data.fcm_token || undefined,
    onesignalPlayerId: data.onesignal_player_id || undefined,
    mustResetPassword: data.must_reset_password === true,
    signature: data.signature || undefined,
  };
}

/**
 * Hook interno para obtener el perfil del usuario con caché usando useEffect simple
 * En el futuro se puede migrar a TanStack Query para mejor caching
 */
function useUserProfile(authUserId: string | null, profileVersion: number): { profile: User | null; loading: boolean; error: Error | null } {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!authUserId || !isSupabaseConfigured()) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('supabase_auth_id', authUserId)
          .single();

        if (!cancelled) {
          if (dbError || !data) {
            setError(new Error(dbError?.message || 'Perfil no encontrado'));
            setProfile(null);
          } else {
            setProfile(mapUserProfile(data));
            setError(null);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err);
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetch();

    return () => {
      cancelled = true;
    };
  }, [authUserId, profileVersion]);

  return { profile, loading, error };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [impersonation, setImpersonation] = useState<{ companyId: string; role: User['role'] } | null>(null);

  // Refetch del perfil (p. ej. tras un cambio de contraseña forzado, para que
  // must_reset_password se entere de que ya se cambió y desbloquee la app).
  const refreshProfile = useCallback(() => setProfileVersion(v => v + 1), []);

  useEffect(() => {
    setMounted(true);
    console.log("🔍 Iniciando AuthContext (Supabase)...");

    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase no configurado — Auth deshabilitado');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Obtener sesión actual - Supabase ya persiste la sesión en localStorage
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (session?.user) {
          console.log("👤 Sesión activa detectada");
        } else {
          console.log("👤 Sin sesión activa");
        }
      } catch (e) {
        console.error("❌ Error iniciando auth:", e);
      } finally {
        if (isMounted) {
          console.log("✅ Auth init completado");
          setLoading(false);
        }
      }
    };

    initAuth();

    // 2. Suscripción a cambios de auth en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("👤 Auth Event:", event, session ? "Sesión presente" : "Sin sesión");

        if (!isMounted) return;

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          // El perfil se cargará via useUserProfile hook en el componente que lo necesite
          // Aquí solo actualizamos el estado mínimo
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Obtener el auth user ID desde la sesión actual
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    // Obtener el user ID de la sesión actual al montar
    const getAuthUserId = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthUserId(session.user.id);
      }
    };
    getAuthUserId();

    // Escuchar cambios de auth para actualizar authUserId
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUserId(session.user.id);
      } else {
        setAuthUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hidratar `impersonation` desde el JWT de sesión (migración 018). Un override
  // de vista previa vive en `auth.users.raw_app_meta_data` y sobrevive al logout,
  // así que un login nuevo lo vuelve a heredar. Sin esta hidratación, un override
  // estancado ni siquiera mostraba el banner "Salir de la vista" → el super_admin
  // quedaba sin forma de limpiarlo desde la UI. Con esto: si el JWT trae
  // imp_company_id/imp_role se muestra la vista previa (y su salida); si no, no.
  useEffect(() => {
    const sync = (session: any) => {
      const meta: any = session?.user?.app_metadata;
      const impCompanyId = meta?.imp_company_id;
      const impRole = meta?.imp_role;
      if (impCompanyId || impRole) {
        setImpersonation({ companyId: impCompanyId, role: impRole ?? 'admin' });
      } else {
        setImpersonation(null);
      }
    };
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) sync(data?.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setImpersonation(null);
        return;
      }
      sync(session);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // Perfil del usuario actual
  const { profile: userProfile, loading: userProfileLoading } = useUserProfile(authUserId, profileVersion);

  // Sincronizar currentUser con el perfil cargado.
  // IMPORTANTE: durante una vista previa (impersonación) el perfil del super_admin
  // puede quedar "oculto" por RLS (ahora scoupeado a la empresa de destino). Solo
  // se actualiza si hay perfil real; nunca se anula currentUser a null por eso.
  useEffect(() => {
    if (userProfile) {
      setCurrentUser(userProfile);
    }
  }, [userProfile]);

  // Loading combina la carga inicial de auth + carga del perfil
  const isLoading = loading || userProfileLoading;

  const login = useCallback(async (username: string, password: string, _companyId?: string): Promise<boolean> => {
    try {
      // Permite que el usuario escriba "usuario" o "usuario@dominio".
      const email = username.includes('@') ? username : `${username}@${EMAIL_DOMAIN}`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error("❌ Error en login:", error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error("❌ Error en login:", error);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setImpersonation(null);
    await supabase.auth.signOut();
  }, []);

  // Vista previa como admin de otra empresa (solo super_admin). El RPC escribe el
  // override en app_metadata del JWT (migración 018) y refreshSession emite un token
  // nuevo con él: a partir de ahí el RLS de la DB se re-escala al tenant de destino.
  const startImpersonation = useCallback(async (companyId: string): Promise<boolean> => {
    if (!currentUser || currentUser.role !== 'super_admin') return false;
    try {
      const { error } = await supabase.rpc('admin_impersonate_start', {
        target_company: companyId,
        target_role: 'admin',
      });
      if (error) {
        console.error('[Auth] impersonate start:', error.message);
        return false;
      }
      const { data } = await supabase.auth.refreshSession();
      const meta = data?.session?.user?.app_metadata as any;
      setImpersonation({
        companyId: meta?.imp_company_id ?? companyId,
        role: meta?.imp_role ?? 'admin',
      });
      return true;
    } catch (e) {
      console.error('[Auth] impersonate start error:', e);
      return false;
    }
  }, [currentUser]);

  const stopImpersonation = useCallback(async (): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc('admin_impersonate_stop');
      if (error) {
        console.error('[Auth] impersonate stop:', error.message);
        return false;
      }
      await supabase.auth.refreshSession();
      setImpersonation(null);
      return true;
    } catch (e) {
      console.error('[Auth] impersonate stop error:', e);
      return false;
    }
  }, []);

  // Usuario efectivo: con vista previa activa, se sobreescribe rol y empresa.
  const effectiveUser: User | null =
    impersonation && currentUser
      ? { ...currentUser, companyId: impersonation.companyId, role: impersonation.role }
      : currentUser;

  const value: AuthContextType = {
    currentUser: effectiveUser,
    impersonation,
    loading: isLoading,
    login,
    logout,
    refreshProfile,
    startImpersonation,
    stopImpersonation,
  };

  if (!mounted) {
    return <LoadingFallback />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Importar LoadingFallback aquí para evitar importación circular
const LoadingFallback = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#7b1113] border-t-transparent"></div>
  </div>
);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};