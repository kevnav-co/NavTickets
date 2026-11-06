// src/utils/chat.ts
// Utilidades puras para chat tipo WhatsApp.

import { SupportMessage } from '../types';

export interface GroupedMessage {
  date: string;
  messages: SupportMessage[];
}

/**
 * Determina si un mensaje es del viewer (para alineación izquierda/derecha).
 * @param message Mensaje a evaluar
 * @param viewerId ID del usuario actual
 * @param viewerRole Rol del usuario actual ('admin' o 'empresa')
 */
export function isOwnMessage(
  message: SupportMessage,
  viewerId: string | undefined,
  viewerRole: 'admin' | 'empresa' | undefined
): boolean {
  if (!viewerId || !viewerRole) return false;
  return message.userId === viewerId && message.role === viewerRole;
}

/**
 * Agrupa mensajes por día (formato: "14 dic 2024").
 */
export function groupByDay(messages: SupportMessage[]): GroupedMessage[] {
  const groups: Record<string, SupportMessage[]> = {};

  messages.forEach(msg => {
    const date = new Date(msg.createdAt);
    if (isNaN(date.getTime())) return;

    const key = date.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  });

  return Object.entries(groups).map(([date, msgs]) => ({ date, messages: msgs }));
}

/**
 * Formatea una hora para el chat (ej: "14:32").
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formatea una fecha + hora completa (ej: "14 dic 2024 · 14:32").
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
