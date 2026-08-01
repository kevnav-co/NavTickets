
// @deprecated — No se usa. DataContext + useSupabaseQuery manejan la carga de datos.
// Se eliminará en Phase 6: Cleanup.

import { useMemo, useCallback } from 'react';
import type { QueryFilter } from './useSupabaseQuery';
import { useCollection } from './useCollection';
import { Client, ServiceOrder, Equipment, User, AppNotification } from '../types';
import PERMISSIONS, { hasPermission } from '../permissions';
import { useAuth } from '../context/AuthContext';

/**
 * Hook centralizado para obtener los datos fundamentales de la aplicación.
 * Utiliza la versión refactorizada de `useCollection` para un rendimiento y legibilidad mejorados.
 */
export const useDataFetching = (isAuthReady: boolean) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || 'default';

  // Determina si las colecciones deben ser fetcheadas.
  const canFetch = isAuthReady && !!currentUser;

  // --- Filtros para colecciones ---

  const companyFilters = useMemo((): QueryFilter[] => {
    return [{ column: 'company_id', operator: 'eq', value: companyId }];
  }, [companyId]);

  const orderFilters = useMemo((): QueryFilter[] => {
    if (!currentUser) return [];
    const filters: QueryFilter[] = [{ column: 'company_id', operator: 'eq', value: companyId }];
    if (!hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      filters.push({ column: 'technician_id', operator: 'eq', value: currentUser.id });
    }
    return filters;
  }, [currentUser, companyId]);

  const notificationFilters = useMemo((): QueryFilter[] => {
    if (!currentUser) return [];
    return [
      { column: 'company_id', operator: 'eq', value: companyId },
      { column: 'user_id', operator: 'eq', value: currentUser.id },
    ];
  }, [currentUser, companyId]);

  // --- Obtención de Datos con el Hook `useCollection` Refactorizado ---

  const { data: clients, loading: loadingClients, isRefreshing: isRefreshingClients, forceRefresh: forceRefreshClients, error: errorClients } = useCollection<Client>(canFetch ? 'clients' : '', { filters: companyFilters });
  const { data: equipment, loading: loadingEquipment, isRefreshing: isRefreshingEquipment, forceRefresh: forceRefreshEquipment, error: errorEquipment } = useCollection<Equipment>(canFetch ? 'equipment' : '', { filters: companyFilters });
  const { data: users, loading: loadingUsers, isRefreshing: isRefreshingUsers, forceRefresh: forceRefreshUsers, error: errorUsers } = useCollection<User>(canFetch ? 'users' : '', { filters: companyFilters });
  const { data: orders, loading: loadingOrders, isRefreshing: isRefreshingOrders, forceRefresh: forceRefreshOrders, error: errorOrders } = useCollection<ServiceOrder>(canFetch ? 'orders' : '', { filters: orderFilters });
  const { data: notifications, loading: loadingNotifications, isRefreshing: isRefreshingNotifications, forceRefresh: forceRefreshNotifications, error: errorNotifications } = useCollection<AppNotification>(canFetch ? 'notifications' : '', { filters: notificationFilters });

  // --- Combinación de Estados Agregados ---

  const loading = canFetch && (loadingOrders || loadingClients || loadingEquipment || loadingUsers || loadingNotifications);
  const isRefreshing = canFetch && (isRefreshingOrders || isRefreshingClients || isRefreshingEquipment || isRefreshingUsers || isRefreshingNotifications);
  const error = errorOrders || errorClients || errorEquipment || errorUsers || errorNotifications;

  const forceRefresh = useCallback(() => {
    forceRefreshOrders?.();
    forceRefreshClients?.();
    forceRefreshEquipment?.();
    forceRefreshUsers?.();
    forceRefreshNotifications?.();
  }, [forceRefreshOrders, forceRefreshClients, forceRefreshEquipment, forceRefreshUsers, forceRefreshNotifications]);

  return {
    clients: clients || [],
    orders: orders || [],
    equipment: equipment || [],
    users: users || [],
    notifications: notifications || [],
    loading,
    error,
    isRefreshing,
    forceRefresh,
  };
};
