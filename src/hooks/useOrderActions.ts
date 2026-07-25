
import { useCallback } from 'react';
import { ServiceOrder, OrderStatus } from '../types';
import { useFirestoreActions } from './useFirestoreActions';

/**
 * Hook que centraliza las acciones complejas o transaccionales relacionadas con las órdenes de servicio.
 */
export const useOrderActions = () => {
  const { updateItem } = useFirestoreActions();

  /**
   * Completa una orden de servicio y actualiza la fecha de último mantenimiento de los equipos asociados.
   * @param order La orden de servicio a completar.
   * @param closingData Un objeto con los datos de cierre de la orden.
   */
  const completeOrderAndUpdateEquipment = useCallback(async (order: ServiceOrder, closingData: Partial<ServiceOrder>) => {
    if (!order || !order.id) {
        throw new Error("La orden proporcionada no es válida.");
    }

    const endTime = new Date().toISOString();
    const finalOrderData = {
        ...closingData,
        status: OrderStatus.CLOSED,
        endTime: endTime,
    };

    // Actualizar la orden a estado CERRADA
    await updateItem('orders', order.id, finalOrderData);

    // Si hay equipos asociados, actualizar su fecha de último mantenimiento
    if (order.equipmentIds && order.equipmentIds.length > 0) {
        const equipmentUpdatePromises = order.equipmentIds.map(equipmentId => {
            return updateItem('equipment', equipmentId, {
                lastMaintenanceDate: endTime.split('T')[0]
            });
        });
        await Promise.all(equipmentUpdatePromises);
    }

  }, [updateItem]);

  return { completeOrderAndUpdateEquipment };
};
