
import { useCallback } from 'react';
import {
  doc, addDoc, updateDoc, deleteDoc, collection, DocumentData, WithFieldValue
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { deleteOrderWithEvidence } from '../services/data';

/**
 * Hook que proporciona funciones para realizar operaciones CRUD en Firestore.
 *
 * NOTA: Se ha rediseñado para simplificar el manejo de tipos y eliminar la complejidad
 * de los conversores genéricos que causaban errores persistentes en `updateDoc`.
 */
export const useFirestoreActions = () => {

  const addItem = useCallback(async <T extends DocumentData>(collectionName: string, data: WithFieldValue<T>): Promise<string> => {
    if (!db) throw new Error("Firestore no está inicializado.");
    
    const collectionRef = collection(db, collectionName);
    const docRef = await addDoc(collectionRef, data);
    return docRef.id;
  }, []);

  const updateItem = useCallback(async <T extends DocumentData>(collectionName: string, id: string, data: Partial<T>): Promise<void> => {
    if (!db) throw new Error("Firestore no está inicializado.");
    
    const itemRef = doc(db, collectionName, id);
    await updateDoc(itemRef, data as DocumentData);
  }, []);

  const deleteItem = useCallback(async (collectionName: string, id: string): Promise<void> => {
    if (!db) throw new Error("Firestore no está inicializado.");

    if (collectionName === 'orders') {
      // `deleteOrderWithEvidence` parece esperar un objeto con un ID.
      // Lo construimos para que coincida con lo que parece ser la intención original.
      await deleteOrderWithEvidence({ id } as any);
    } else {
      await deleteDoc(doc(db, collectionName, id));
    }
  }, []);

  return { addItem, updateItem, deleteItem };
};
