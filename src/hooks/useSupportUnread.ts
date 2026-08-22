// NavTicket - contador de soportes "sin atender" (no-leídos) para el super_admin.
// Cuenta los `support_tickets` cuyo estado NO es 'cerrado' (abierto/en_progreso).
// Sin filtro de empresa: el super_admin (RLS de 006) lee todas las empresas, y la
// suscripción realtime actualiza el conteo en vivo cuando llega una consulta nueva.

import { useMemo } from 'react';
import { useCollection } from './useCollection';
import { SupportTicket, SupportTicketStatus } from '../types';

export function useSupportUnread(): number {
  const { data } = useCollection<SupportTicket>('support_tickets', {
    realtime: true,
  });

  return useMemo(
    () => (data || []).filter(t => t.status !== SupportTicketStatus.CLOSED).length,
    [data],
  );
}