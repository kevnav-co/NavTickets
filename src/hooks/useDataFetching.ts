
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

  // Determina si las colecciones deben ser fetcheadas.
  const canFetch = isAuthReady && !!currentUser;

  // --- Lógica de Constraints para las Colecciones ---

  const orderConstraints = useMemo((): QueryConstraint[] => {
    if (!currentUser) return []; // Si no hay usuario, no hay constraints.
    
    // Si el usuario tiene permiso para ver todas las órdenes, no se aplica ningún filtro.
    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      return [];
    }

    // Por defecto, un usuario (ej. técnico) solo ve sus órdenes asignadas.
    // Se incluye '' y null para casos donde la asignación puede no estar definida.
    return [where('technicianId', 'in', [currentUser.id, '', null])];
  }, [currentUser]);

  const notificationConstraints = useMemo((): QueryConstraint[] => {
    if (!currentUser) return [];
    // Solo se buscan notificaciones para el usuario actual, ordenadas por fecha.
    return [
      where('userId', '==', currentUser.id),
      orderBy('timestamp', 'desc')
    ];
  }, [currentUser]);

  // --- Obtención de Datos con el Hook `useCollection` Refactorizado ---

  const { data: clients, loading: loadingClients, isRefreshing: isRefreshingClients, forceRefresh: forceRefreshClients, error: errorClients } = useCollection<Client>(canFetch ? 'clients' : '');
  const { data: equipment, loading: loadingEquipment, isRefreshing: isRefreshingEquipment, forceRefresh: forceRefreshEquipment, error: errorEquipment } = useCollection<Equipment>(canFetch ? 'equipment' : '');
  const { data: users, loading: loadingUsers, isRefreshing: isRefreshingUsers, forceRefresh: forceRefreshUsers, error: errorUsers } = useCollection<User>(canFetch ? 'users' : '');
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
