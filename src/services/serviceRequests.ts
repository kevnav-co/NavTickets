import { supabase } from './supabase';
import type { ManualServiceRequestInput, ServiceRequestProposal } from '../types/serviceRequest';

// Confirmar y rechazar solo existen como RPC (migración 043): el servidor
// comprueba rol y empresa, vuelve a verificar que el técnico esté libre y crea la
// orden en una transacción. Requieren conexión: no entran a la cola offline.

export async function confirmServiceRequest(requestId: string, p: ServiceRequestProposal): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_service_request', {
    p_request: requestId,
    p_date: p.date,
    p_time: p.time,
    p_duration_minutes: p.durationMinutes,
    p_technician: p.technicianId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function rejectServiceRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_service_request', { p_request: requestId, p_reason: reason });
  if (error) throw new Error(error.message);
}

const clean = (v?: string) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * Registra una solicitud recibida por teléfono. La RLS (042) solo admite el canal
 * 'manual', el estado 'pendiente' y created_by = el propio usuario.
 */
export async function createManualServiceRequest(
  input: ManualServiceRequestInput,
  companyId: string,
  createdBy: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('service_requests')
    .insert({
      company_id: companyId,
      created_by: createdBy,
      channel: 'manual',
      status: 'pendiente',
      client_id: input.clientId || null,
      contact_name: clean(input.contactName),
      contact_phone: clean(input.contactPhone),
      contact_email: clean(input.contactEmail)?.toLowerCase() ?? null,
      contact_identification: clean(input.contactIdentification),
      address: clean(input.address),
      city: clean(input.city),
      service_name: clean(input.serviceName),
      order_type: input.orderType,
      suggested_priority: input.suggestedPriority,
      description: input.description.trim(),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
