// Respuesta en streaming del chat (NDJSON: un objeto JSON por línea). Código
// puro, sin Deno, para probarlo con Vitest.
//
//   {"type":"delta","text":"Tengo "}          texto mientras el modelo escribe
//   {"type":"done","reply":"…","request":…}   respuesta definitiva (reemplaza los deltas)
//   {"type":"error","status":503,"error":"…"} el turno falló; no hay "done"
//
// Siempre termina con exactamente un "done" o un "error".

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; reply: string; request: { status: string; reference: string } | null }
  | { type: "error"; status: number; error: string };

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export const ndjsonLine = (e: StreamEvent) => `${JSON.stringify(e)}\n`;

export interface StreamFailure {
  status: number;
  message: string;
}

/**
 * Ejecuta `run`, que va emitiendo deltas, y cierra con su resultado. Un error se
 * traduce con `toFailure` (los mensajes internos nunca salen al cliente). Los
 * deltas vacíos se descartan.
 */
export function createTurnStream(
  run: (emitDelta: (text: string) => void) => Promise<Extract<StreamEvent, { type: "done" }>>,
  toFailure: (error: unknown) => StreamFailure,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const push = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(ndjsonLine(e)));
        } catch {
          open = false; // el cliente cerró la conexión: el turno sigue y se guarda igual
        }
      };
      try {
        const done = await run((text) => {
          if (text) push({ type: "delta", text });
        });
        push(done);
      } catch (error) {
        const f = toFailure(error);
        push({ type: "error", status: f.status, error: f.message });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch { /* ya cerrado */ }
        }
      }
    },
  });
}
