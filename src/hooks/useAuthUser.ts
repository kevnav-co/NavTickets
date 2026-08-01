
// @deprecated — No se usa. Autenticación se maneja via AuthContext + Supabase Auth.
// Se eliminará en Phase 6: Cleanup.

import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types';

interface AuthState {
  customUser: User | null;
  loading: boolean;
  isAuthReady: boolean;
}

export const useAuthUser = (): AuthState => {
  const [customUser, setCustomUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            setCustomUser({ id: userDoc.id, ...userDoc.data() } as User);
          } else {
            console.warn(`Error de Sincronización: El usuario con UID ${user.uid} existe en Firebase Auth pero no tiene un documento en Firestore. Se cerrará la sesión para evitar un estado inconsistente.`);
            setCustomUser(null);
            await signOut(auth); // Cierra sesión activamente para evitar que el usuario quede atascado.
          }
        } else {
          setCustomUser(null);
        }
      } catch (error) {
        console.error("Error Crítico en Hook de Autenticación (useAuthUser):", error);
        console.warn("Esto puede deberse a un problema de conexión o a las reglas de seguridad de Firestore. Se forzará el cierre de sesión.");
        setCustomUser(null);
        if (auth.currentUser) {
            await signOut(auth);
        }
      } finally {
        // Este bloque se ejecuta siempre, asegurando que la UI se actualice.
        setIsAuthReady(true);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { customUser, loading, isAuthReady };
};
