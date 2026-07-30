import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { User } from '../types';
import type { Session } from '@supabase/supabase-js';

interface SupabaseAuthState {
  currentUser: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

interface SupabaseAuthActions {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

/**
 * Hook de autenticación con Supabase.
 *
 * Reemplaza onAuthStateChanged de Firebase por supabase.auth.onAuthStateChange.
 * El login usa el formato {username}@navas.com para mantener compatibilidad
 * con la base de usuarios existente.
 */
export function useSupabaseAuth(): SupabaseAuthState & SupabaseAuthActions {
  const [state, setState] = useState<SupabaseAuthState>({
    currentUser: null,
    session: null,
    loading: true,
    initialized: false,
    error: null,
  });

  /**
   * Busca el perfil del usuario en la tabla `users` usando su supabase_auth_id.
   * Convierte el registro de snake_case al modelo User de la app (camelCase).
   */
  const fetchUserProfile = useCallback(async (authUserId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('supabase_auth_id', authUserId)
        .single();

      if (error || !data) {
        console.error('[SupabaseAuth] Error fetching user profile:', error?.message);
        return null;
      }

      // Mapear snake_case de DB al modelo User (camelCase)
      const user: User = {
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

      return user;
    } catch (err) {
      console.error('[SupabaseAuth] fetchUserProfile error:', err);
      return null;
    }
  }, []);

  // ─── Efecto: suscripción a cambios de auth ────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState(prev => ({ ...prev, loading: false, initialized: true }));
      return;
    }

    let mounted = true;

    const initialize = async () => {
      try {
        // 1. Obtener sesión actual
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          const userProfile = await fetchUserProfile(session.user.id);
          setState({
            currentUser: userProfile,
            session,
            loading: false,
            initialized: true,
            error: null,
          });
        } else {
          setState(prev => ({ ...prev, loading: false, initialized: true }));
        }
      } catch (err: any) {
        console.error('[SupabaseAuth] Init error:', err);
        if (mounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            initialized: true,
            error: err.message,
          }));
        }
      }
    };

    initialize();

    // 2. Suscribirse a cambios en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[SupabaseAuth] Auth event:', event);

        if (!mounted) return;

        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const userProfile = await fetchUserProfile(session.user.id);
          setState({
            currentUser: userProfile,
            session,
            loading: false,
            initialized: true,
            error: null,
          });
        } else if (event === 'SIGNED_OUT') {
          setState({
            currentUser: null,
            session: null,
            loading: false,
            initialized: true,
            error: null,
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (username: string, password: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const email = username.includes('@') ? username : `${username}@navas.com`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setState(prev => ({ ...prev, loading: false }));
        return { success: false, error: error.message };
      }

      if (data.session) {
        // El perfil se carga via onAuthStateChange
        return { success: true };
      }

      return { success: false, error: 'No se pudo iniciar sesión' };
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false }));
      return { success: false, error: err.message };
    }
  }, []);

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      await supabase.auth.signOut();
      // El estado se limpia via onAuthStateChange
    } catch (err: any) {
      console.error('[SupabaseAuth] Logout error:', err);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // ─── Refresh ───────────────────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const userProfile = await fetchUserProfile(session.user.id);
      setState(prev => ({ ...prev, currentUser: userProfile, session }));
    }
  }, [fetchUserProfile]);

  return {
    currentUser: state.currentUser,
    session: state.session,
    loading: state.loading,
    initialized: state.initialized,
    error: state.error,
    login,
    logout,
    refreshUser,
  };
}