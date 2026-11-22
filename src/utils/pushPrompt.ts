// Cuándo invitar a activar las notificaciones push (aviso bajo el encabezado).
// Lógica pura para poder probarla sin navegador.

export type PushPromptKind = 'enable' | 'ios-install' | null;

export interface PushPromptInput {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported' | boolean;
  userAgent: string;
  /** La app corre instalada (pantalla de inicio): display-mode standalone o navigator.standalone. */
  isStandalone: boolean;
  /** Marca de tiempo hasta la que el usuario pidió no volver a ver el aviso. */
  dismissedUntil: number | null;
  now: number;
}

export const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const isIOSDevice = (ua: string) =>
  /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));

/**
 * - 'enable': el navegador admite push y el permiso aún no se ha pedido.
 * - 'ios-install': iPhone o iPad desde Safari sin instalar; allí el push solo
 *   funciona con la app añadida a la pantalla de inicio.
 * - null: ya activadas, bloqueadas (se gestionan en los ajustes del navegador),
 *   pospuestas o sin soporte.
 */
export function pushPromptKind(i: PushPromptInput): PushPromptKind {
  if (i.dismissedUntil !== null && i.now < i.dismissedUntil) return null;
  if (isIOSDevice(i.userAgent) && !i.isStandalone) return 'ios-install';
  if (i.isSupported && i.permission === 'default') return 'enable';
  return null;
}
