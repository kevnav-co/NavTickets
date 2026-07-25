import { getStorage, ref, deleteObject } from 'firebase/storage';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ServiceOrder } from '../types';

/**
 * Elimina una orden de servicio y toda la evidencia de imágenes asociada a ella en Firebase Storage.
 * @param order El objeto de la orden de servicio a eliminar.
 */
export const deleteOrderWithEvidence = async (order: ServiceOrder): Promise<void> => {
  const storage = getStorage();

  // 1. Recopilar todas las URIs de la evidencia de la orden.
  const evidenceItems = [
    ...(order.initialEvidence || []),
    ...(order.closingData?.evidenceImages || []),
  ];

  // CORRECCIÓN: Filtramos para quedarnos solo con los elementos que son strings (URLs de Firebase).
  // Los Blobs locales no necesitan ser eliminados de Storage, por lo que los ignoramos.
  const storageUris = evidenceItems.filter(
    (item): item is string => typeof item === 'string' && item.includes('firebasestorage.googleapis.com')
  );

  // 2. Crear promesas para eliminar cada archivo de Storage.
  const deletePromises = storageUris.map(uri => {
    try {
      const fileRef = ref(storage, uri);
      return deleteObject(fileRef);
    } catch (error) { 
      console.error('Error creando referencia de storage para eliminar:', error);
      return Promise.resolve();
    }
  });

  // 3. Ejecutar todas las promesas de eliminación.
  const results = await Promise.allSettled(deletePromises);
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.warn('No se pudo eliminar un archivo de evidencia:', result.reason);
    }
  });

  // 4. Una vez eliminada la evidencia, eliminar el documento de la orden en Firestore.
  if (db) {
    await deleteDoc(doc(db, 'orders', order.id));
    console.log(`Orden ${order.id} y su evidencia han sido eliminadas.`);
  } else {
    throw new Error("Firestore no está inicializado.");
  }
};
