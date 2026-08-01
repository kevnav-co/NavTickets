import { useCallback } from 'react';
import { z } from 'zod';
import { useData } from '../context/DataContext';

/**
 * Hook que envuelve DataContext CRUD con validación Zod.
 * Garantiza que todos los datos escritos cumplan
 * con los schemas definidos en src/schemas/.
 *
 * Uso:
 *   const { addValidated, updateValidated, deleteItem } = useValidatedActions();
 *   await addValidated('orders', formData, ServiceOrderSchema);
 *   await updateValidated('orders', id, partialData, ServiceOrderSchema);
 */
export const useValidatedActions = () => {
  const { addItem, updateItem, deleteItem } = useData();

  /**
   * Agrega un documento validándolo contra un schema Zod.
   * Si la validación falla, lanza un error con los detalles.
   */
  const addValidated = useCallback(
    async <T extends Record<string, any>>(
      collectionName: string,
      data: T,
      schema: z.ZodSchema<T>
    ): Promise<string> => {
      const result = schema.safeParse(data);
      if (!result.success) {
        const issues = result.error.issues
          .map(i => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        console.error(`[Validation] Error al crear en "${collectionName}":\n${issues}`);
        throw new Error(
          `Datos inválidos para "${collectionName}":\n${issues}`
        );
      }
      return addItem(collectionName, result.data);
    },
    [addItem]
  );

  /**
   * Actualiza un documento validándolo parcialmente contra un schema Zod.
   * Usa .partial() para permitir actualizaciones con solo algunos campos.
   */
  const updateValidated = useCallback(
    async <T extends Record<string, any>>(
      collectionName: string,
      id: string,
      data: Partial<T>,
      schema: z.ZodSchema<T>
    ): Promise<void> => {
      const partialSchema = (schema as z.ZodObject<any>).partial() as unknown as z.ZodSchema<Partial<T>>;
      const result = partialSchema.safeParse(data);
      if (!result.success) {
        const issues = result.error.issues
          .map(i => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        console.error(`[Validation] Error al actualizar "${collectionName}/${id}":\n${issues}`);
        throw new Error(
          `Datos inválidos para "${collectionName}":\n${issues}`
        );
      }
      return updateItem(collectionName, id, result.data);
    },
    [updateItem]
  );

  /**
   * Agrega un documento con validación segura (no lanza error, devuelve el resultado).
   * Útil cuando quieres manejar el error tú mismo en lugar de un try/catch.
   */
  const addValidatedSafe = useCallback(
    async <T extends Record<string, any>>(
      collectionName: string,
      data: T,
      schema: z.ZodSchema<T>
    ): Promise<{ success: true; id: string } | { success: false; errors: z.ZodIssue[] }> => {
      const result = schema.safeParse(data);
      if (!result.success) {
        console.error(`[Validation] Error al crear en "${collectionName}":`, result.error.issues);
        return { success: false, errors: result.error.issues };
      }
      try {
        const id = await addItem(collectionName, result.data);
        return { success: true, id };
      } catch (err) {
        console.error(`[Validation] Error al guardar en "${collectionName}":`, err);
        return {
          success: false,
          errors: [{ path: ['db'], message: 'Error al guardar en la base de datos', code: 'db_error' }] as unknown as z.ZodIssue[],
        };
      }
    },
    [addItem]
  );

  return { addValidated, updateValidated, deleteItem, addValidatedSafe };
};