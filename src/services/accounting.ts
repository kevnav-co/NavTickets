import { supabase } from './supabase';
import type { AccountType } from '../types/accounting';
import type { AnnulKind } from '../utils/accounting';

// Anulaciones y movimientos entre cuentas propias solo existen como RPC (migración 017):
// el servidor valida permisos y montos; requieren conexión.

export async function annulMovement(kind: AnnulKind, id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('accounting_annul', { p_kind: kind, p_id: id, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

export async function transferBetweenOwnAccounts(amount: number, from: AccountType, to: AccountType, createdAt: string): Promise<void> {
  const { error } = await supabase.rpc('accounting_self_transfer', {
    p_amount: amount, p_from: from, p_to: to, p_created_at: createdAt,
  });
  if (error) throw new Error(error.message);
}
