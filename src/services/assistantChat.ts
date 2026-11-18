// Cliente del asistente público (Edge Function assistant-chat, fase 3).
// No usa la sesión de la app: el chat lo usan clientes sin cuenta. La función es
// pública (verify_jwt = false) y fija la empresa a partir del slug.

export interface AssistantCompany {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface AssistantInit {
  conversationId: string;
  company: AssistantCompany;
  welcome: string;
  privacyNotice: string;
  verified: boolean;
  messages: { role: 'user' | 'assistant'; text: string }[];
}

export interface AssistantReply {
  reply: string;
  request: { status: string; reference: string } | null;
}

export class AssistantApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AssistantApiError';
  }
}

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-chat`;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AssistantApiError(0, 'No hay conexión. Revisa tu internet e intenta de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AssistantApiError(res.status, (data as { error?: string }).error || 'Ocurrió un error. Intenta de nuevo.');
  return data as T;
}

export const initAssistant = (slug: string, conversationId: string | null) =>
  call<AssistantInit>({ action: 'init', slug, conversationId });

export const sendAssistantMessage = (slug: string, conversationId: string, message: string) =>
  call<AssistantReply>({ action: 'message', slug, conversationId, message });

export const sendVerificationCode = (slug: string, conversationId: string, email: string) =>
  call<{ sent: boolean; minutes: number }>({ action: 'send_code', slug, conversationId, email });

export const verifyCode = (slug: string, conversationId: string, email: string, code: string) =>
  call<{ verified: boolean }>({ action: 'verify_code', slug, conversationId, email, code });

/** Lee el slug de la ruta pública /#/asistente/<slug>. */
export function assistantSlugFromHash(hash: string): string | null {
  const m = /^#\/asistente\/([a-z0-9][a-z0-9-]{0,79})\/?(?:[?#].*)?$/.exec(hash);
  return m ? m[1] : null;
}
