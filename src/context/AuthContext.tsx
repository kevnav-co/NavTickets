// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
// IMPORTACIONES NUEVAS: Necesitamos el sdk de Auth de Firebase
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, User as FirebaseAuthUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import { User } from '../types'; 
import { getUserDataById } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
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
          const appUser = await getUserDataById(firebaseUser.uid);
          if (isMounted) setCurrentUser(appUser);
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

    // Timeout de seguridad: Si en 5 segundos Firebase no responde, forzamos la carga para mostrar el login
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

  // --- ESTA ES LA FUNCIÓN MODIFICADA ---
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // 1. El "Puente": Convertimos el username a formato email.
      //    Usa tu propio dominio aquí.
      const email = `${username}@navas.com`;

      // 2. Llamamos a Firebase Auth. Ya no usamos nuestro 'authService' para esto.
      await signInWithEmailAndPassword(auth, email, password);
      
      // 3. Si tiene éxito, el `onAuthStateChanged` de arriba se activará solo
      //    y actualizará el estado del usuario.
      return true;

    } catch (error) {
      console.error("Error en el inicio de sesión de Firebase:", error);
      // Puedes añadir lógica para mostrar errores específicos al usuario
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

// --- NECESITARÁS ESTA NUEVA FUNCIÓN EN 'userService.ts' ---
// Deberás crear o modificar un archivo `src/services/userService.ts`

/*
// src/services/userService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

export const getUserDataById = async (uid: string): Promise<User | null> => {
  const userDocRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userDocRef);
  if (userDoc.exists()) {
    return { id: userDoc.id, ...userDoc.data() } as User;
  }
  return null;
};
*/
