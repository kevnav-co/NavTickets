
import { useMemo, useCallback } from 'react';
import { useCollection } from './useCollection';
import { QueryFilter } from './useSupabaseQuery';
import { Client, ServiceOrder, Equipment, User, AppNotification } from '../types';
import PERMISSIONS, { hasPermission } from '../permissions';
import { useAuth } from '../context/AuthContext';

/**
 * Hook centralizado para obtener los datos fundamentales de la aplicación.
 * Utiliza Supabase con QueryFilters para consultas reactivas.
 */
export const useDataFetching = (isAuthReady: boolean) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || 'default';

  // Base companyId filter for multi-tenant isolation
  const companyFilter = useMemo((): QueryFilter => ({
    column: 'company_id',
    operator: 'eq',
    value: companyId,
  }), [companyId]);

  // Determina si las colecciones deben ser fetcheadas.
  const canFetch = isAuthReady && !!currentUser;

  // --- Lógica de Filtros para las Colecciones ---

  const orderFilters = useMemo((): QueryFilter[] => {
    if (!currentUser) return [];

    const filters: QueryFilter[] = [companyFilter];

    // Si el usuario tiene permiso para ver todas las órdenes, no se aplica filtro de técnico.
    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      return filters;
    }

    // Por defecto, un usuario (ej. técnico) solo ve sus órdenes asignadas.
    // Se incluye '' y null para casos donde la asignación puede no estar definida.
    filters.push({ column: 'technician_id', operator: 'in', value: [currentUser.id, '', null] });
    return filters;
  }, [currentUser, companyFilter]);

  const notificationFilters = useMemo((): QueryFilter[] => {
    if (!currentUser) return [];
    // Notificaciones filtradas por empresa y usuario actual, ordenadas por fecha.
    return [
      companyFilter,
      { column: 'user_id', operator: 'eq', value: currentUser.id },
    ];
  }, [currentUser, companyFilter]);

  // --- Obtención de Datos con el Hook `useCollection` Refactorizado ---

  const { data: clients, loading: loadingClients, isRefreshing: isRefreshingClients, forceRefresh: forceRefreshClients, error: errorClients } = useCollection<Client>(canFetch ? 'clients' : '', { filters: [companyFilter] });
  const { data: equipment, loading: loadingEquipment, isRefreshing: isRefreshingEquipment, forceRefresh: forceRefreshEquipment, error: errorEquipment } = useCollection<Equipment>(canFetch ? 'equipment' : '', { filters: [companyFilter] });
  const { data: users, loading: loadingUsers, isRefreshing: isRefreshingUsers, forceRefresh: forceRefreshUsers, error: errorUsers } = useCollection<User>(canFetch ? 'users' : '', { filters: [companyFilter] });
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
