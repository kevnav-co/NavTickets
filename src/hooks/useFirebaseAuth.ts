import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../services/firebase';

/**
 * Hook para gestionar la inicialización de la autenticación con Firebase.
 * Se encarga del inicio de sesión anónimo y reporta cuándo los servicios están listos.
 */
export const useFirebaseAuth = () => {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // onAuthStateChanged se dispara cuando el usuario inicia sesión o se desconecta,
    // y también una vez al cargar la librería.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Si no hay un usuario real (ni siquiera anónimo), intentamos crear uno.
      if (!user) {
        try {
          await signInAnonymously(auth);
          console.log("Signed in anonymously.");
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
        }
      }
      // Una vez que tenemos un usuario (anónimo o real) o el sign-in anónimo falló,
      // podemos considerar que la autenticación está "lista".
      if (!isAuthReady) {
        setIsAuthReady(true);
      }
    });

    // Limpiamos la suscripción al desmontar el componente para evitar fugas de memoria.
    return () => unsubscribe();
  }, [isAuthReady]); // La dependencia en isAuthReady previene re-ejecuciones innecesarias.

  return { isAuthReady };
};