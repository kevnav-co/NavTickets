// src/context/CompanyContext.tsx
// Migrado a Supabase — reemplaza Firestore doc/getDoc/onSnapshot.
//
// Provides company configuration (branding, tabs, features) to the entire app.
// Depends on AuthContext to know which company the current user belongs to.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';
import { CompanyConfig, DEFAULT_COMPANY_CONFIG } from '../types/company';

interface CompanyContextType {
  /** The current company's full configuration */
  company: CompanyConfig;
  /** The company ID string (shorthand for company.id) */
  companyId: string;
  /** True while loading company config for the first time */
  loading: boolean;
  /** Refresh company config from Firestore */
  refreshCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const CACHE_KEY_PREFIX = 'navtickets_company_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: CompanyConfig;
  timestamp: number;
}

function getCachedCompany(companyId: string): CompanyConfig | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${companyId}`);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${companyId}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCachedCompany(companyId: string, config: CompanyConfig): void {
  try {
    const entry: CacheEntry = { data: config, timestamp: Date.now() };
    localStorage.setItem(`${CACHE_KEY_PREFIX}${companyId}`, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [company, setCompany] = useState<CompanyConfig>(DEFAULT_COMPANY_CONFIG);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshCompany = useCallback(async () => {
    if (!currentUser?.companyId || !isSupabaseConfigured()) {
      setCompany(DEFAULT_COMPANY_CONFIG);
      setLoading(false);
      return;
    }

    const companyId = currentUser.companyId;

    // Try cache first
    const cached = getCachedCompany(companyId);
    if (cached) {
      setCompany(cached);
      setLoading(false);
    }

    // Fetch from Supabase
    try {
      const { data: row, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) {
        console.warn(`[CompanyContext] Error loading company: ${error.message}`);
        if (!cached) {
          setCompany({ ...DEFAULT_COMPANY_CONFIG, id: companyId });
        }
      } else if (row) {
        // Mapear snake_case de PostgreSQL a camelCase (CompanyConfig)
        const normalized: CompanyConfig = {
          id: row.id,
          name: row.name,
          slug: (row as any).slug || '',
          theme: (row as any).theme || DEFAULT_COMPANY_CONFIG.theme,
          features: (row as any).features || DEFAULT_COMPANY_CONFIG.features,
          auth: (row as any).auth || DEFAULT_COMPANY_CONFIG.auth,
          tabs: (row as any).tabs || [],
        };
        setCompany(normalized);
        setCachedCompany(companyId, normalized);
      }
    } catch (err) {
      console.error('[CompanyContext] Error loading company config:', err);
      // Keep cached/default if fetch fails
    } finally {
      setLoading(false);
    }
  }, [currentUser?.companyId]);

  // Load company config when user changes
  useEffect(() => {
    setLoading(true);
    refreshCompany();
  }, [refreshCompany]);

  // Real-time subscription via Supabase Realtime
  useEffect(() => {
    if (!currentUser?.companyId || !isSupabaseConfigured() || !company.id) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`company-${currentUser.companyId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'companies',
          filter: `id=eq.${currentUser.companyId}`,
        },
        (payload: any) => {
          const newRecord = payload.new;
          if (newRecord) {
            const normalized: CompanyConfig = {
              id: newRecord.id,
              name: newRecord.name,
              slug: newRecord.slug || '',
              theme: newRecord.theme || DEFAULT_COMPANY_CONFIG.theme,
              features: newRecord.features || DEFAULT_COMPANY_CONFIG.features,
              auth: newRecord.auth || DEFAULT_COMPANY_CONFIG.auth,
              tabs: newRecord.tabs || [],
            };
            setCompany(normalized);
            setCachedCompany(currentUser.companyId, normalized);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.companyId, company.id]);

  const value: CompanyContextType = {
    company,
    companyId: company.id,
    loading,
    refreshCompany,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

export default CompanyContext;