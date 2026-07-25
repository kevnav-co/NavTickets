
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types'; // Importar el tipo User

/**
 * Valida las credenciales del usuario contra la base de datos de Firestore.
 * @param username El nombre de usuario a verificar.
 * @param password La contraseña a verificar.
 * @returns El objeto User en caso de éxito, o null en caso de fallo.
 */
export const loginUser = async (username: string, password?: string): Promise<User | null> => {
  if (!db) {
    console.error("Error: La conexión a Firestore no está inicializada.");
    return null;
  }
  if (!username || !password) {
    console.error("El nombre de usuario y la contraseña son obligatorios.");
    return null;
  }

  try {
    const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log(`Intento de login fallido: No se encontró el usuario "${username}".`);
      return null;
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.password === password) {
      console.log(`Login exitoso para el usuario "${username}".`);
      
      // CORRECCIÓN FINAL: Crear un objeto que se ajuste estrictamente al tipo `User`.
      // Se elimina la propiedad `uid` que no pertenece al tipo.
      const user: User = {
        id: userDoc.id,
        companyId: userData.companyId || 'default', // ← NUEVO
        name: userData.name || '',
        role: userData.role || 'technician',
        username: userData.username || '',
        // Se asume que el tipo User tiene estas propiedades. Si faltan más, se deben añadir.
      };

      return user;
    } else {
      console.log(`Intento de login fallido: Contraseña incorrecta para "${username}".`);
      return null;
    }
  } catch (error) {
    console.error("Error crítico durante la validación del usuario en la base de datos:", error);
    return null;
  }
};

/**
 * Cierra la sesión del usuario (manejado por el contexto).
 */
export const logoutUser = async (): Promise<void> => {
    console.log("Logout solicitado. El estado del usuario debe ser limpiado por el AuthContext.");
    return Promise.resolve();
};
