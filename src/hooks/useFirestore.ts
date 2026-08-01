
// @deprecated — No se usa. La subida de archivos se maneja via useSupabaseStorage.
// Se eliminará en Phase 6: Cleanup.

import { useCallback } from 'react';
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage } from '../services/firebase';
import { useOfflineStatus } from './useOfflineStatus';

export const useFirestore = () => {
    const { isOnline } = useOfflineStatus();

    const uploadEvidence = useCallback(async (evidence: string | Blob, path: string): Promise<string> => {
        if (!storage || !isOnline) return evidence as string;
        if (typeof evidence === 'string' && evidence.startsWith('https://')) return evidence;

        const storageRef = ref(storage, path);

        if (evidence instanceof Blob) {
            const snapshot = await uploadBytes(storageRef, evidence, { contentType: 'image/jpeg' });
            return getDownloadURL(snapshot.ref);
        }

        if (typeof evidence === 'string' && evidence.startsWith('data:')) {
            const snapshot = await uploadString(storageRef, evidence, 'data_url', { contentType: 'image/png' });
            return getDownloadURL(snapshot.ref);
        }

        return evidence as string;
    }, [isOnline]);

    const genericSave = useCallback(async (collectionName: string, item: any) => {
        if (!db || !isOnline) return item;

        try {
            const itemForDb = { ...item };

            if (collectionName === 'users' && itemForDb.signature && itemForDb.signature.startsWith('data:')) {
                itemForDb.signature = await uploadEvidence(itemForDb.signature, `users/${itemForDb.id}/signature_${Date.now()}.png`);
            }
            if (collectionName === 'equipment' && itemForDb.imageUrl && itemForDb.imageUrl.startsWith('data:')) {
                itemForDb.imageUrl = await uploadEvidence(itemForDb.imageUrl, `equipment/${itemForDb.id}/image_${Date.now()}.png`);
            }

            await setDoc(doc(db, collectionName, item.id), JSON.parse(JSON.stringify(itemForDb)));
            return itemForDb;
        } catch (e) {
            console.error("Generic save to Firebase failed:", e);
            throw e; // Re-throw the error to be caught by the caller
        }
    }, [isOnline, uploadEvidence]);

    return { genericSave, uploadEvidence };
};
