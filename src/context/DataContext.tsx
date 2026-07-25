
import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { Client, ServiceOrder, Equipment, User, AppNotification, OrderStatus } from '../types';
import { useDataFetching } from '../hooks/useDataFetching';
import { useFirestoreActions } from '../hooks/useFirestoreActions';
import { useStorage } from '../hooks/useStorage';
import { DocumentData } from 'firebase/firestore';
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
  addItem: <T extends Omit<DocumentData, 'id'>>(collectionName: any, data: T) => Promise<string>;
  updateItem: <T extends DocumentData>(collectionName: any, id: string, data: Partial<T>) => Promise<void>;
  deleteItem: (collectionName: any, item: any) => Promise<void>;
  uploadFile: (file: File, path: string) => Promise<string>;
  forceRefresh: () => void;
  completeOrderAndUpdateEquipment: (order: ServiceOrder, closingData: Partial<ServiceOrder>) => Promise<void>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  
  const { clients, orders, equipment, users, notifications, loading, error, isRefreshing, forceRefresh } = useDataFetching(!!currentUser);
  
  const { addItem, updateItem, deleteItem } = useFirestoreActions();
  const { uploadFile, isUploading } = useStorage();

  const getClientById = useCallback((id: string) => clients.find(c => c.id === id), [clients]);
  const getOrderById = useCallback((id: string) => orders.find(o => o.id === id), [orders]);
  const getEquipmentById = useCallback((id: string) => equipment.find(e => e.id === id), [equipment]);

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

    await updateItem('orders', order.id, finalOrderData);

    if (order.equipmentIds && order.equipmentIds.length > 0) {
        const equipmentUpdatePromises = order.equipmentIds.map(equipmentId => {
            return updateItem('equipment', equipmentId, {
                lastMaintenanceDate: endTime.split('T')[0]
            });
        });
        await Promise.all(equipmentUpdatePromises);
    }
    
    forceRefresh();
  }, [updateItem, forceRefresh]);

  const value = useMemo(() => ({
    clients,
    orders,
    equipment,
    users,
    notifications,
    loading,
    error,
    isUploading,
    isRefreshing,
    getClientById,
    getOrderById,
    getEquipmentById,
    addItem,
    updateItem,
    deleteItem,
    uploadFile,
    forceRefresh,
    completeOrderAndUpdateEquipment
  }), [
    clients, orders, equipment, users, notifications, loading, error, isUploading, isRefreshing,
    getClientById, getOrderById, getEquipmentById,
    addItem, updateItem, deleteItem, uploadFile, forceRefresh, completeOrderAndUpdateEquipment
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
