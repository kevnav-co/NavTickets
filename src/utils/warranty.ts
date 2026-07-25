import { OrderStatus, ServiceOrder } from '../types';

/**
 * Calcula la información del estado de la garantía para una orden de servicio CERRADA.
 * Esta función es retrocompatible: 
 * 1. Usa `warrantyExpiration` si está disponible (método preferido).
 * 2. Si no, calcula la garantía "al vuelo" usando `endTime` y `warrantyPeriod`.
 * Todos los cálculos de fecha se manejan en UTC para evitar problemas de huso horario.
 * 
 * @param order La orden de servicio (puede ser parcial, pero debe incluir status, y los campos de garantía).
 * @returns Un objeto con el estado de la garantía { expired: boolean, text: string } o null si la orden no aplica.
 */
/**
 * Helper para obtener la fecha (YYYY-MM-DD) en la zona horaria de Bogotá.
 */
const getBogotaYMD = (date: Date): string => {
  // en-CA es un locale que devuelve consistentemente YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

/**
 * Convierte un YYYY-MM-DD en un objeto Date a medianoche UTC para comparaciones seguras.
 */
const parseYMDToUTCDate = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Calcula la información del estado de la garantía para una orden de servicio CERRADA.
 * Los cálculos se basan en la fecha de Colombia (UTC-5) para determinar "Hoy" y el día de cierre.
 * 
 * @param order La orden de servicio.
 * @returns Un objeto con el estado de la garantía { expired: boolean, text: string } o null si la orden no aplica.
 */
export const getWarrantyInfo = (order: Partial<ServiceOrder>): { expired: boolean; text: string } | null => {
  if (order.status !== OrderStatus.CLOSED) return null;

  // 1. Obtener "Hoy" en Colombia y normalizar a medianoche UTC ficticia.
  const todayYMD = getBogotaYMD(new Date());
  const todayNormalized = parseYMDToUTCDate(todayYMD);

  let warrantyEndDateNormalized: Date | null = null;

  // Método 1: Usar `warrantyExpiration` (ya viene en YYYY-MM-DD del calendario)
  if (order.warrantyExpiration) {
      try {
          warrantyEndDateNormalized = parseYMDToUTCDate(order.warrantyExpiration);
      } catch (e) {
          console.error("Error parsing warrantyExpiration:", e);
          return { expired: true, text: 'Fecha Inválida' };
      }
  } 
  // Método 2 (Fallback): Calcular desde `endTime` (UTC ISO) y `warrantyPeriod`.
  else if (order.endTime && order.warrantyPeriod && order.warrantyPeriod > 0) {
      // Extraer el día real en Colombia cuando ocurrió el cierre.
      const serviceEndColombiaYMD = getBogotaYMD(new Date(order.endTime));
      const startDateNormalized = parseYMDToUTCDate(serviceEndColombiaYMD);
      
      startDateNormalized.setUTCDate(startDateNormalized.getUTCDate() + order.warrantyPeriod);
      warrantyEndDateNormalized = startDateNormalized;
  }

  if (!warrantyEndDateNormalized) return null;

  // Calcular la diferencia de días.
  const diffTime = warrantyEndDateNormalized.getTime() - todayNormalized.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { expired: true, text: 'Vencida' };
  if (diffDays === 0) return { expired: false, text: 'Vence Hoy' };
  if (diffDays === 1) return { expired: false, text: 'Vence Mañana' };
  return { expired: false, text: `${diffDays} días` };
};
