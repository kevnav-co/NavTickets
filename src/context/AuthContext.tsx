// src/context/AuthContext.tsx
//
// Migrado a Supabase Auth — reemplaza Firebase Auth.
// El login usa el formato {username}@navas.com (compatible con usuarios existentes).

import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { EMAIL_DOMAIN } from '../config';
import type { User } from '../types';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string, companyId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => void;
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

  // Perfil del usuario actual
  const { profile: userProfile, loading: userProfileLoading } = useUserProfile(authUserId, profileVersion);

  // Sincronizar currentUser con el perfil cargado
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
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading: isLoading,
    login,
    logout,
    refreshProfile,
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