import { supabase } from './supabase';
import {
  settingsFromRow,
  settingsToRow,
  type AssistantSettingsForm,
} from '../utils/assistantSettings';

// Configuración del asistente (assistant_settings, migración 042). La RLS deja
// leer a los gestores de solicitudes y escribir solo a admin y developer de la
// empresa (o al super_admin en vista previa). Requiere conexión: no entra a la
// cola offline.

export interface LoadedAssistantSettings {
  settings: AssistantSettingsForm;
  /** false si la empresa aún no tiene fila: se muestran los valores por defecto. */
  exists: boolean;
  updatedAt: string | null;
}

export async function fetchAssistantSettings(companyId: string): Promise<LoadedAssistantSettings> {
  const { data, error } = await supabase
    .from('assistant_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  return {
    settings: settingsFromRow(row),
    exists: !!row,
    updatedAt: row && typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function saveAssistantSettings(
  companyId: string,
  updatedBy: string | null,
  settings: AssistantSettingsForm,
): Promise<LoadedAssistantSettings> {
  const { data, error } = await supabase
    .from('assistant_settings')
    .upsert(settingsToRow(settings, companyId, updatedBy), { onConflict: 'company_id' })
    .select('*')
    .single();
  if (error) throw new Error(friendlySettingsError(error.message));
  const row = data as Record<string, unknown>;
  return {
    settings: settingsFromRow(row),
    exists: true,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

function friendlySettingsError(message: string): string {
  if (/Zona horaria no válida/i.test(message)) return 'La zona horaria no existe. Usa un nombre como America/Bogota.';
  if (/row-level security|permission denied/i.test(message)) {
    return 'Solo un administrador de la empresa puede cambiar la configuración del asistente.';
  }
  if (/assistant_settings_\w+_chk/.test(message)) {
    return 'La base rechazó algún valor de la configuración. Revisa el horario, los servicios y los límites.';
  }
  return message;
}

export interface PreviewSlot {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  freeTechnicians: number;
}

/**
 * Huecos que ofrecería el asistente con la configuración GUARDADA (la misma RPC
 * que usa la Edge Function assistant-chat).
 */
export async function previewAvailableSlots(
  companyId: string,
  from: string,
  to: string,
  durationMinutes: number,
): Promise<PreviewSlot[]> {
  const { data, error } = await supabase.rpc('available_slots', {
    p_company: companyId,
    p_from: from,
    p_to: to,
    p_duration_minutes: durationMinutes,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { slot_date: string; slot_time: string; free_technicians: number }[]).map(r => ({
    date: r.slot_date,
    time: String(r.slot_time).slice(0, 5),
    freeTechnicians: r.free_technicians,
  }));
}
