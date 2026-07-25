// src/context/CompanyContext.tsx
// Provides company configuration (branding, tabs, features) to the entire app.
// Depends on AuthContext to know which company the current user belongs to.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
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

  const refreshCompany = useCallback(async () => {
    if (!currentUser?.companyId) {
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

    // Always fetch fresh data from Firestore
    try {
      const companyDocRef = doc(db, 'companies', companyId);
      const companySnap = await getDoc(companyDocRef);
      if (companySnap.exists()) {
        const config: CompanyConfig = {
          id: companySnap.id,
          ...companySnap.data(),
        } as CompanyConfig;
        setCompany(config);
        setCachedCompany(companyId, config);
      } else {
        console.warn(`[CompanyContext] No company config found for ID: ${companyId}`);
        if (!cached) {
          setCompany({ ...DEFAULT_COMPANY_CONFIG, id: companyId });
        }
      }
    } catch (err) {
      console.error('[CompanyContext] Error loading company config:', err);
      // Keep the cached/default value if fetch fails
    } finally {
      setLoading(false);
    }
  }, [currentUser?.companyId]);

  // Load company config when user changes
  useEffect(() => {
    setLoading(true);
    refreshCompany();
  }, [refreshCompany]);

  // Subscribe to real-time updates when company is loaded
  useEffect(() => {
    if (!currentUser?.companyId || !company.id) return;

    const companyDocRef = doc(db, 'companies', currentUser.companyId);
    const unsubscribe = onSnapshot(
      companyDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const config: CompanyConfig = {
            id: snapshot.id,
            ...snapshot.data(),
          } as CompanyConfig;
          setCompany(config);
          setCachedCompany(currentUser.companyId, config);
        }
      },
      (err) => {
        console.warn('[CompanyContext] Real-time sync error (silent):', err);
      }
    );

    return () => unsubscribe();
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