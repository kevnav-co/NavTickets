import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from '../types';
import { useLocalStorage } from './useLocalStorage';

/**
 * Hook para gestionar la sesión del usuario, la persistencia y la restauración.
 */
export const useAuthSession = (isAuthReady: boolean) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Persistencia en localStorage
  const [session, setSession] = useLocalStorage<string | null>('navas_session', null);
  const [lastActiveUser, setLastActiveUser] = useLocalStorage<User | null>('navas_last_active_user', null);

  // Efecto para restaurar la sesión cuando Firebase está listo.
  useEffect(() => {
    if (!isAuthReady) return; // Esperar a que la autenticación de Firebase esté inicializada

    if (session && db) {
      // 1. Intenta cargar desde el caché rápido `lastActiveUser`
      if (lastActiveUser?.id === session) {
        setCurrentUser(lastActiveUser);
        setLoading(false);
      } else {
        // 2. Si no, busca en Firestore y actualiza la caché.
        setLoading(true);
        getDoc(doc(db, 'users', session))
          .then(docSnap => {
            if (docSnap.exists()) {
              const user = docSnap.data() as User;
              setCurrentUser(user);
              setLastActiveUser(user); // Actualizar caché para la próxima vez
            }
          })
          .finally(() => setLoading(false));
      }
    } else {
      // Si no hay sesión, simplemente terminamos de cargar.
      setCurrentUser(null);
      setLoading(false);
    }
  }, [isAuthReady, session, lastActiveUser, setLastActiveUser]);

  // Función para iniciar una nueva sesión
  const startSession = (user: User, rememberMe: boolean) => {
    setCurrentUser(user);
    if (rememberMe) {
      setSession(user.id);
      setLastActiveUser(user);
    }
  };

  // Función para terminar la sesión
  const endSession = () => {
    // Usar un confirm antes de llamar a esta función
    sessionStorage.setItem('navas_just_logged_out', 'true');
    setCurrentUser(null);
    setSession(null);
    setLastActiveUser(null); // Limpiar también el último usuario activo
  };

  return { currentUser, loading, startSession, endSession };
};