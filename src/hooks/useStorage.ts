import { useCallback, useState } from 'react';
import { useSupabaseStorage } from './useSupabaseStorage';
import { compressImage } from '../utils';

/**
 * Hook that provides a function to upload files to Supabase Storage.
 * Includes image compression before upload.
 */
export const useStorage = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use Supabase storage hook with the order-photos bucket
  const { uploadFile: uploadFileSupabase } = useSupabaseStorage({ bucket: 'order-photos' });

  const uploadFile = useCallback(async (file: File, path: string): Promise<string> => {
    setIsUploading(true);
    setError(null);

    try {
      // 1. Compress the image before uploading
      const compressedFile = await compressImage(file);

      // 2. Upload to Supabase Storage
      const result = await uploadFileSupabase(path, compressedFile);

      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.url) {
        throw new Error('No se obtuvo URL de descarga');
      }

      return result.url;
    } catch (err: any) {
      console.error('Error during file upload:', err);
      setError(err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [uploadFileSupabase]);

  return { uploadFile, isUploading, error };
};