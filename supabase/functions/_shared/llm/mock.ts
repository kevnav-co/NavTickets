// Proveedor simulado y determinista: permite probar el asistente de extremo a
// extremo sin clave ni costo. Solo se permite en empresas de prueba (index.ts).
//
// Comportamiento:
//  - Tras resultados de herramientas, resume lo que devolvieron.
//  - Si el mensaje del cliente pide disponibilidad («disponib», «horario»,
//    «cuándo», «cita») → llama a consultar_disponibilidad para los próximos 7 días.
//  - Si trae «nombre:» y «telefono:» (formato «clave: valor; …») → llama a
//    guardar_solicitud con esos datos; «lista» la deja pendiente.
//  - Si dice «verifiqu» → llama a identificar_cliente.
//  - En otro caso, responde con una guía breve.
import type { LlmBlock, LlmMessage, LlmProvider, LlmRequest, LlmResponse } from "./types.ts";
import { isTextBlock, isToolResultBlock } from "./types.ts";

const DATE_RE = /Hoy es (\d{4}-\d{2}-\d{2})/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastUserText(messages: LlmMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return "";
  if (typeof last.content === "string") return last.content;
  return last.content.filter(isTextBlock).map((b) => b.text).join(" ");
}

function parseFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) {
    const m = /^\s*([a-záéíóúñ_ ]+)\s*:\s*(.+)$/i.exec(part);
    if (m) out[m[1].trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_")] = m[2].trim();
  }
  return out;
}

let counter = 0;
const toolUse = (name: string, input: unknown): LlmBlock => ({ type: "tool_use", id: `mock_${Date.now()}_${++counter}`, name, input });
const reply = (content: LlmBlock[], stopReason: LlmResponse["stopReason"]): LlmResponse => ({
  content,
  stopReason,
  usage: { inputTokens: 0, outputTokens: 0 },
});

export function createMockProvider(): LlmProvider {
  return {
    name: "mock",
    model: "mock-1",
    complete(request: LlmRequest): Promise<LlmResponse> {
      const last = request.messages[request.messages.length - 1];
      // 1) Resultados de herramientas → resumen
      if (last && Array.isArray(last.content) && last.content.some(isToolResultBlock)) {
        const results = last.content.filter(isToolResultBlock);
        const summary = results.map((r) => {
          if (r.is_error) return `No pude completar la consulta: ${r.content}`;
          try {
            const data = JSON.parse(r.content);
            if (Array.isArray(data.huecos)) {
              return data.huecos.length
                ? `Tengo disponibilidad en: ${data.huecos.slice(0, 3).map((h: { fecha: string; hora: string }) => `${h.fecha} a las ${h.hora}`).join(", ")}.`
                : "No encontré huecos libres en esas fechas.";
            }
            if (data.guardada) return `Registré tu solicitud (referencia ${data.referencia}). Un administrador confirmará la fecha y el técnico.`;
            if ("verificado" in data) return data.verificado ? `Encontré tus datos como cliente${data.cliente ? ` (${data.cliente.nombre})` : ""}.` : "Tu correo aún no está verificado.";
          } catch { /* resultado no JSON */ }
          return r.content;
        }).join(" ");
        return Promise.resolve(reply([{ type: "text", text: summary }], "end_turn"));
      }

      const text = lastUserText(request.messages);
      const lower = text.toLowerCase();
      const today = DATE_RE.exec(request.system)?.[1] ?? new Date().toISOString().slice(0, 10);

      const fields = parseFields(text);
      if (fields.nombre && (fields.telefono || fields.correo)) {
        return Promise.resolve(reply([toolUse("guardar_solicitud", {
          nombre: fields.nombre,
          telefono: fields.telefono ?? null,
          correo: fields.correo ?? null,
          identificacion: fields.identificacion ?? null,
          direccion: fields.direccion ?? null,
          ciudad: fields.ciudad ?? null,
          tipo_servicio_id: fields.servicio ?? null,
          descripcion: fields.descripcion ?? text.slice(0, 200),
          equipos_ids: [],
          descripcion_equipo: fields.equipo ?? null,
          franjas_preferidas: [],
          propuesta_fecha: fields.fecha ?? null,
          propuesta_hora: fields.hora ?? null,
          lista: /\blista\b/.test(lower),
        })], "tool_use"));
      }
      if (/disponib|horario|cu[aá]ndo|cita/.test(lower)) {
        return Promise.resolve(reply([toolUse("consultar_disponibilidad", {
          tipo_servicio_id: null,
          desde: addDays(today, 1),
          hasta: addDays(today, 7),
        })], "tool_use"));
      }
      if (/verifiqu/.test(lower)) {
        return Promise.resolve(reply([toolUse("identificar_cliente", {})], "tool_use"));
      }
      return Promise.resolve(reply([{
        type: "text",
        text: "Soy el asistente de prueba. Puedo consultar la disponibilidad o registrar tu solicitud (escribe «nombre: …; telefono: …; descripcion: …»).",
      }], "end_turn"));
    },
  };
}
