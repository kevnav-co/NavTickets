// src/context/CompanyContext.tsx
// Provides company configuration (branding, tabs, features) to the entire app.
// Depends on AuthContext to know which company the current user belongs to.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useCollection } from '../hooks/useCollection';
import { CompanyConfig, DEFAULT_COMPANY_CONFIG } from '../types/company';

interface CompanyContextType {
  /** The current company's full configuration */
  company: CompanyConfig;
  /** The company ID string (shorthand for company.id) */
  companyId: string;
  /** True while loading company config for the first time */
  loading: boolean;
  /** Refresh company config from Supabase */
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

  const companyId = currentUser?.companyId;

  // Use useCollection hook to fetch company config from Supabase
  const { data: companyData, loading: loadingCollection, error } = useCollection<CompanyConfig>('companies', {
    filters: companyId ? [{ column: 'id', operator: 'eq', value: companyId }] : [],
    enabled: !!companyId,
    limit: 1,
  });

  // Update company state when data loads
  useEffect(() => {
    if (companyData && companyData.length > 0) {
      const config = companyData[0];
      setCompany(config);
      setCachedCompany(companyId!, config);
    } else if (!loadingCollection && companyId) {
      // No data found, use default with companyId
      const defaultConfig = { ...DEFAULT_COMPANY_CONFIG, id: companyId };
      setCompany(defaultConfig);
      setCachedCompany(companyId, defaultConfig);
    }
    setLoading(false);
  }, [companyData, loadingCollection, companyId]);

  const refreshCompany = useCallback(async () => {
    if (!companyId) {
      setCompany(DEFAULT_COMPANY_CONFIG);
      setLoading(false);
      return;
    }

    // Try cache first
    const cached = getCachedCompany(companyId);
    if (cached) {
      setCompany(cached);
      setLoading(false);
    }

    // The useCollection hook will automatically re-fetch when companyId changes
    // For manual refresh, we could invalidate the query cache here if needed
    // For now, the real-time subscription in useCollection will keep data fresh
  }, [companyId]);

  // Load company config when user changes
  useEffect(() => {
    setLoading(true);
  }, [refreshCompany]);

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