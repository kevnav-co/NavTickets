import { useSupabaseQuery } from './useSupabaseQuery';
import type { QueryFilter } from './useSupabaseQuery';

export interface UseCollectionOptions {
  filters?: QueryFilter[];
  realtime?: boolean;
}

/**
 * Hook genérico y reactivo para suscribirse a una tabla de Supabase.
 * Reemplaza la versión anterior que usaba Firestore onSnapshot.
 *
 * @param tableName El nombre de la tabla en Supabase.
 * @param options Configuración opcional: filtros y modo Realtime.
 * @returns Un objeto con los datos, estados de carga/error y función de refresco.
 */
export const useCollection = <T extends { id: string }>(
  tableName: string,
  options: UseCollectionOptions = {}
) => {
  const { filters = [], realtime = true } = options;

  const query = useSupabaseQuery<T>(tableName, {
    table: tableName,
    filters,
    realtime,
  });

  return {
    data: query.data,
    loading: query.loading,
    error: query.error ? new Error(query.error) : null,
    isRefreshing: false,
    forceRefresh: () => {},
  };
};