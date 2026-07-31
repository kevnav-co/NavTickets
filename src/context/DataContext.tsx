
import React, { createContext, useContext, useMemo, useCallback, useEffect, useState } from 'react';
import { Client, ServiceOrder, Equipment, User, AppNotification, OrderStatus } from '../types';
import { useSupabaseQuery, snakeToCamel } from '../hooks/useSupabaseQuery';
import { useSupabaseActions } from '../hooks/useSupabaseActions';
import { useSupabaseStorage } from '../hooks/useSupabaseStorage';
import { useSyncManager } from '../hooks/useSyncManager';
import { useAuth } from './AuthContext';

interface DataContextType {
  clients: Client[];
  orders: ServiceOrder[];
  equipment: Equipment[];
  users: User[];
  notifications: AppNotification[];
  loading: boolean;
  error: Error | null;
  isUploading: boolean;
  isRefreshing: boolean;
  getClientById: (id: string) => Client | undefined;
  getOrderById: (id: string) => ServiceOrder | undefined;
  getEquipmentById: (id: string) => Equipment | undefined;
  addItem: (collectionName: string, data: any) => Promise<string>;
  updateItem: (collectionName: string, id: string, data: any) => Promise<void>;
  deleteItem: (collectionName: string, item: any) => Promise<void>;
  uploadFile: (file: File, path: string) => Promise<string>;
  forceRefresh: () => void;
  completeOrderAndUpdateEquipment: (order: ServiceOrder, closingData: Partial<ServiceOrder>) => Promise<void>;
  pendingWrites: number;
  isSyncing: boolean;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;

  // ─── Queries reactivas con Supabase + offline cache ────────────────────
  const hasSession = !!currentUser;
  const companiesQuery = useSupabaseQuery<any>('companies', {
    table: 'companies',
    realtime: false,
    forceOffline: !hasSession,
  });
  const clientsQuery = useSupabaseQuery<Client>('clients', {
    table: 'clients',
    filters: companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [],
    realtime: true,
    forceOffline: !hasSession,
  });
  const ordersQuery = useSupabaseQuery<ServiceOrder>('orders', {
    table: 'orders',
    filters: companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [],
    realtime: true,
    forceOffline: !hasSession,
  });
  const equipmentQuery = useSupabaseQuery<Equipment>('equipment', {
    table: 'equipment',
    filters: companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [],
    realtime: true,
    forceOffline: !hasSession,
  });
  const usersQuery = useSupabaseQuery<User>('users', {
    table: 'users',
    filters: companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [],
    realtime: true,
    forceOffline: !hasSession,
  });
  const notificationsQuery = useSupabaseQuery<AppNotification>('notifications', {
    table: 'notifications',
    filters: [{ column: 'user_id', operator: 'eq', value: companyId }], // filtered server-side
    realtime: true,
    forceOffline: !hasSession,
  });

  // ─── CRUD con cola offline ─────────────────────────────────────────────
  const { addItem: addItemRaw, updateItem: updateItemRaw, deleteItem: deleteItemRaw } = useSupabaseActions();
  const { uploadFile: uploadFileRaw, isUploading } = useSupabaseStorage({ bucket: 'order-photos' });
  const { pendingWrites, isSyncing } = useSyncManager();

  // ─── Loading combinado ──────────────────────────────────────────────────
  const loading = !hasSession ? false : (
    clientsQuery.loading || ordersQuery.loading || equipmentQuery.loading || usersQuery.loading
  );
  const error = clientsQuery.error || ordersQuery.error || equipmentQuery.error || usersQuery.error;

  // ─── Helpers ────────────────────────────────────────────────────────────
  const getClientById = useCallback((id: string) => clientsQuery.data.find(c => c.id === id), [clientsQuery.data]);
  const getOrderById = useCallback((id: string) => ordersQuery.data.find(o => o.id === id), [ordersQuery.data]);
  const getEquipmentById = useCallback((id: string) => equipmentQuery.data.find(e => e.id === id), [equipmentQuery.data]);

  // ─── Wrappers de CRUD ──────────────────────────────────────────────────
  const addItem = useCallback(async (collectionName: string, data: any): Promise<string> => {
    const result = await addItemRaw(collectionName, data);
    if (result.data?.id) return result.data.id;
    throw new Error(result.error || 'Error al crear');
  }, [addItemRaw]);

  const updateItem = useCallback(async (collectionName: string, id: string, data: any): Promise<void> => {
    const result = await updateItemRaw(collectionName, id, data);
    if (result.error) throw new Error(result.error);
  }, [updateItemRaw]);

  const deleteItem = useCallback(async (collectionName: string, item: any): Promise<void> => {
    const id = typeof item === 'string' ? item : item.id;
    const result = await deleteItemRaw(collectionName, id);
    if (result.error) throw new Error(result.error);
  }, [deleteItemRaw]);

  // ─── Upload ────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, path: string): Promise<string> => {
    const result = await uploadFileRaw(path, file);
    if (result.url) return result.url;
    throw new Error(result.error || 'Error al subir archivo');
  }, [uploadFileRaw]);

  // ─── Complete order + update equipment maintenance ─────────────────────
  const completeOrderAndUpdateEquipment = useCallback(async (order: ServiceOrder, closingData: Partial<ServiceOrder>) => {
    if (!order || !order.id) {
      throw new Error("Invalid order data provided.");
    }

    const endTime = new Date().toISOString();
    const finalOrderData = {
      ...closingData,
      status: OrderStatus.CLOSED,
      endTime: endTime,
    };

    await updateItemRaw('orders', order.id, finalOrderData);

    if (order.equipmentIds && order.equipmentIds.length > 0) {
      const equipmentUpdatePromises = order.equipmentIds.map(equipmentId => {
        return updateItemRaw('equipment', equipmentId, {
          lastMaintenanceDate: endTime.split('T')[0]
        });
      });
      await Promise.all(equipmentUpdatePromises);
    }
  }, [updateItemRaw]);

  // ─── Force refresh ────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const value = useMemo(() => ({
    clients: clientsQuery.data,
    orders: ordersQuery.data,
    equipment: equipmentQuery.data,
    users: usersQuery.data,
    notifications: notificationsQuery.data,
    loading,
    error: error ? new Error(error) : null,
    isUploading,
    isRefreshing: isSyncing,
    getClientById,
    getOrderById,
    getEquipmentById,
    addItem,
    updateItem,
    deleteItem,
    uploadFile,
    forceRefresh,
    completeOrderAndUpdateEquipment,
    pendingWrites,
    isSyncing,
  }), [
    clientsQuery.data, ordersQuery.data, equipmentQuery.data, usersQuery.data, notificationsQuery.data,
    loading, error, isUploading, isSyncing,
    getClientById, getOrderById, getEquipmentById,
    addItem, updateItem, deleteItem, uploadFile, forceRefresh, completeOrderAndUpdateEquipment,
    pendingWrites, refreshKey,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
