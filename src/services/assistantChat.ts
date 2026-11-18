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

/** Eventos del stream NDJSON de assistant-chat (supabase/functions/_shared/assistant/stream.ts). */
export type AssistantStreamEvent =
  | { type: 'delta'; text: string }
  | ({ type: 'done' } & AssistantReply)
  | { type: 'error'; status: number; error: string };

/** Parte el cuerpo NDJSON en eventos; tolera líneas cortadas entre trozos y líneas vacías o corruptas. */
export function createNdjsonParser(onEvent: (e: AssistantStreamEvent) => void) {
  let buffer = '';
  const flush = (line: string) => {
    const t = line.trim();
    if (!t) return;
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') onEvent(parsed as AssistantStreamEvent);
    } catch {
      /* línea corrupta: se ignora */
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        flush(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    end() {
      flush(buffer);
      buffer = '';
    },
  };
}

/**
 * Envía un mensaje y muestra la respuesta mientras se escribe. `onText` recibe el
 * texto acumulado; la promesa se resuelve con la respuesta definitiva (que puede
 * diferir de lo transmitido: manda siempre la definitiva). Si el navegador no
 * permite leer el cuerpo por partes, espera la respuesta completa.
 */
export async function sendAssistantMessageStream(
  slug: string,
  conversationId: string,
  message: string,
  onText: (textSoFar: string) => void,
): Promise<AssistantReply> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', slug, conversationId, message, stream: true }),
    });
  } catch {
    throw new AssistantApiError(0, 'No hay conexión. Revisa tu internet e intenta de nuevo.');
  }

  const isStream = (res.headers.get('Content-Type') ?? '').includes('application/x-ndjson');
  if (!res.ok || !isStream) {
    // Errores previos al turno (límites, no disponible…) llegan como JSON normal.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AssistantApiError(res.status, (data as { error?: string }).error || 'Ocurrió un error. Intenta de nuevo.');
    return data as AssistantReply;
  }

  let text = '';
  let result: AssistantReply | null = null;
  let failure: AssistantApiError | null = null;
  const parser = createNdjsonParser((e) => {
    if (e.type === 'delta') {
      text += e.text;
      onText(text);
    } else if (e.type === 'done') {
      result = { reply: e.reply, request: e.request };
    } else if (e.type === 'error') {
      failure = new AssistantApiError(e.status, e.error || 'Ocurrió un error. Intenta de nuevo.');
    }
  });

  try {
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
    } else {
      parser.push(await res.text());
    }
  } catch {
    throw new AssistantApiError(0, 'Se cortó la conexión. Revisa tu internet e intenta de nuevo.');
  }
  parser.end();

  // Asignadas dentro del callback: TypeScript no sigue ese flujo.
  const failed = failure as AssistantApiError | null;
  const final = result as AssistantReply | null;
  if (failed) throw failed;
  if (!final) throw new AssistantApiError(0, 'La respuesta quedó incompleta. Intenta de nuevo.');
  return final;
}

export const sendVerificationCode = (slug: string, conversationId: string, email: string) =>
  call<{ sent: boolean; minutes: number }>({ action: 'send_code', slug, conversationId, email });

export const verifyCode = (slug: string, conversationId: string, email: string, code: string) =>
  call<{ verified: boolean }>({ action: 'verify_code', slug, conversationId, email, code });

/** Lee el slug de la ruta pública /#/asistente/<slug>. */
export function assistantSlugFromHash(hash: string): string | null {
  const m = /^#\/asistente\/([a-z0-9][a-z0-9-]{0,79})\/?(?:[?#].*)?$/.exec(hash);
  return m ? m[1] : null;
}
