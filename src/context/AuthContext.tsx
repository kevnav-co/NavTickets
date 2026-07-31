// src/context/AuthContext.tsx
//
// Migrado a Supabase Auth — reemplaza Firebase Auth.
// El login usa el formato {username}@navas.com (compatible con usuarios existentes).

import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { User } from '../types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string, companyId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Busca el perfil del usuario en la tabla `users` usando supabase_auth_id.
 * Convierte snake_case de PostgreSQL a camelCase (modelo User).
 */
async function fetchUserProfile(authUserId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_auth_id', authUserId)
      .single();

    if (error || !data) {
      console.error('[AuthContext] Error fetching profile:', error?.message);
      return null;
    }

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
      signature: data.signature || undefined,
    };
  } catch (err) {
    console.error('[AuthContext] fetchUserProfile error:', err);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("🔍 Iniciando AuthContext (Supabase)...");

    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase no configurado — Auth deshabilitado');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Obtener sesión actual
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (session?.user) {
          console.log("👤 Sesión activa detectada, cargando perfil...");
          const userProfile = await fetchUserProfile(session.user.id);
          if (isMounted) {
            setCurrentUser(userProfile);
          }
        } else {
          console.log("👤 Sin sesión activa");
        }
      } catch (e) {
        console.error("❌ Error iniciando auth:", e);
      } finally {
        if (isMounted) {
          console.log("✅ Auth Loading Finalizado");
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
          const userProfile = await fetchUserProfile(session.user.id);
          if (isMounted) {
            setCurrentUser(userProfile);
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
            setLoading(false);
          }
        }
      }
    );

    // Timeout de seguridad
    const timeout = setTimeout(() => {
      if (loading && isMounted) {
        console.warn("⚠️ Auth tardó demasiado. Forzando carga...");
        setLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const login = useCallback(async (username: string, password: string, _companyId?: string): Promise<boolean> => {
    try {
      const email = `${username}@navas.com`;
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

  const value = {
    currentUser,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};