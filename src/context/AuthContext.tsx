// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, User as FirebaseAuthUser, getIdTokenResult } from 'firebase/auth';
import { auth } from '../services/firebase';
import { User } from '../types';
import { getUserDataById } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string, companyId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("🔍 Iniciando AuthContext...");
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseAuthUser | null) => {
      console.log("👤 AuthState Changed:", firebaseUser ? "Logueado" : "No logueado");
      try {
        if (firebaseUser) {
          // Get user document from Firestore
          const appUser = await getUserDataById(firebaseUser.uid);
          if (appUser && isMounted) {
            // Try to get custom claims (companyId from Firebase Auth)
            try {
              const tokenResult = await getIdTokenResult(firebaseUser);
              const claimsCompanyId = tokenResult.claims.companyId as string | undefined;
              if (claimsCompanyId && !appUser.companyId) {
                appUser.companyId = claimsCompanyId;
              }
            } catch (claimErr) {
              console.warn('[AuthContext] Could not get custom claims:', claimErr);
            }
            setCurrentUser(appUser);
          } else if (isMounted) {
            setCurrentUser(null);
          }
        } else {
          if (isMounted) setCurrentUser(null);
        }
      } catch (e) {
        console.error("❌ Error en AuthState Change:", e);
      } finally {
        if (isMounted) {
          console.log("✅ Auth Loading Finalizado");
          setLoading(false);
        }
      }
    });

    // Timeout de seguridad
    const timeout = setTimeout(() => {
      if (loading && isMounted) {
        console.warn("⚠️ Firebase Auth tardó demasiado. Forzando carga...");
        setLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // --- FUNCIÓN DE LOGIN ACTUALIZADA ---
  const login = async (username: string, password: string, companyId?: string): Promise<boolean> => {
    try {
      // Use provided companyId's domain or fallback to default
      // The companyId helps determine the email domain for login
      const email = `${username}@navas.com`;
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (error) {
      console.error("Error en el inicio de sesión de Firebase:", error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
  };

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