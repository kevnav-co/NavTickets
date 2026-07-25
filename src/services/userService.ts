
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

/**
 * Busca y obtiene los datos de un usuario desde la colección 'users' de Firestore
 * utilizando su UID (el ID de autenticación de Firebase).
 * @param uid El ID único del usuario de Firebase Authentication.
 * @returns El objeto de usuario con sus datos de la app (incluyendo el rol), o null si no se encuentra.
 */
export const getUserDataById = async (uid: string): Promise<User | null> => {
  if (!uid) return null;
  
  const userDocRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userDocRef);
  
  if (userDoc.exists()) {
    // Construye el objeto de usuario a partir del documento de Firestore
    const userData: User = {
      id: userDoc.id,
      name: userDoc.data().name || '',
      role: userDoc.data().role || 'technician', // Asigna 'technician' por defecto si no hay rol
      username: userDoc.data().username || '',
      // No incluyas la contraseña aquí, ya que no debe estar en la base de datos de Firestore
    };
    return userData;
  } else {
    console.warn(`ADVERTENCIA: Usuario autenticado con UID (${uid}) pero sin documento correspondiente en la colección 'users'.`);
    return null;
  }
};
