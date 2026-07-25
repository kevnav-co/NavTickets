
import { useMemo, useCallback } from 'react';
import { where, orderBy, QueryConstraint } from 'firebase/firestore';
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

  // Base companyId constraint for multi-tenant isolation
  const companyConstraint = useMemo((): QueryConstraint[] => {
    return [where('companyId', '==', companyId)];
  }, [companyId]);

  // Determina si las colecciones deben ser fetcheadas.
  const canFetch = isAuthReady && !!currentUser;

  // --- Lógica de Constraints para las Colecciones ---

  const orderConstraints = useMemo((): QueryConstraint[] => {
    if (!currentUser) return []; // Si no hay usuario, no hay constraints.

    const constraints: QueryConstraint[] = [where('companyId', '==', companyId)];

    // Si el usuario tiene permiso para ver todas las órdenes, no se aplica filtro de técnico.
    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      return constraints;
    }

    // Por defecto, un usuario (ej. técnico) solo ve sus órdenes asignadas.
    // Se incluye '' y null para casos donde la asignación puede no estar definida.
    constraints.push(where('technicianId', 'in', [currentUser.id, '', null]));
    return constraints;
  }, [currentUser, companyId]);

  const notificationConstraints = useMemo((): QueryConstraint[] => {
    if (!currentUser) return [];
    // Notificaciones filtradas por empresa y usuario actual, ordenadas por fecha.
    return [
      where('companyId', '==', companyId),
      where('userId', '==', currentUser.id),
      orderBy('timestamp', 'desc')
    ];
  }, [currentUser, companyId]);

  // --- Obtención de Datos con el Hook `useCollection` Refactorizado ---

  const { data: clients, loading: loadingClients, isRefreshing: isRefreshingClients, forceRefresh: forceRefreshClients, error: errorClients } = useCollection<Client>(canFetch ? 'clients' : '', { constraints: companyConstraint });
  const { data: equipment, loading: loadingEquipment, isRefreshing: isRefreshingEquipment, forceRefresh: forceRefreshEquipment, error: errorEquipment } = useCollection<Equipment>(canFetch ? 'equipment' : '', { constraints: companyConstraint });
  const { data: users, loading: loadingUsers, isRefreshing: isRefreshingUsers, forceRefresh: forceRefreshUsers, error: errorUsers } = useCollection<User>(canFetch ? 'users' : '', { constraints: companyConstraint });
  const { data: orders, loading: loadingOrders, isRefreshing: isRefreshingOrders, forceRefresh: forceRefreshOrders, error: errorOrders } = useCollection<ServiceOrder>(canFetch ? 'orders' : '', { constraints: orderConstraints });
  const { data: notifications, loading: loadingNotifications, isRefreshing: isRefreshingNotifications, forceRefresh: forceRefreshNotifications, error: errorNotifications } = useCollection<AppNotification>(canFetch ? 'notifications' : '', { constraints: notificationConstraints });

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
