
import { useCallback } from 'react';
import { ServiceOrder, OrderStatus } from '../types';
import { useValidatedActions } from './useValidatedActions';
import { ServiceOrderSchema } from '../schemas/order.schema';
import { EquipmentSchema } from '../schemas/equipment.schema';

/**
 * Hook que centraliza las acciones complejas o transaccionales relacionadas con las órdenes de servicio.
 */
export const useOrderActions = () => {
  const { updateValidated } = useValidatedActions();

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
    await updateValidated('orders', order.id, finalOrderData, ServiceOrderSchema);

    // Si hay equipos asociados, actualizar su fecha de último mantenimiento
    if (order.equipmentIds && order.equipmentIds.length > 0) {
        const equipmentUpdatePromises = order.equipmentIds.map(equipmentId => {
            return updateValidated('equipment', equipmentId, {
                lastMaintenanceDate: endTime.split('T')[0]
            }, EquipmentSchema);
        });
        await Promise.all(equipmentUpdatePromises);
    }

  }, [updateValidated]);

  return { completeOrderAndUpdateEquipment };
};
