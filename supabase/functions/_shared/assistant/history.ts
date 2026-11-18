// Conversión entre los mensajes guardados en assistant_messages y el formato del
// adaptador de modelos.
//
// Formato guardado (columna content, jsonb):
//   user       → "texto del cliente" (string)
//   assistant  → { text: "texto visible", blocks: [...bloques tal cual del proveedor] }
//   tool       → { tool_results: [...bloques tool_result] }
// La bandeja (fase 2) muestra solo los textos; los bloques se conservan porque los de
// razonamiento deben volver intactos al modelo en los turnos siguientes.
import type { LlmBlock, LlmMessage } from "../llm/types.ts";
import { isToolResultBlock, isToolUseBlock, textOf } from "../llm/types.ts";

export type StoredRole = "user" | "assistant" | "tool";

export interface StoredMessage {
  role: StoredRole;
  content: unknown;
}

export function storeUser(text: string): StoredMessage {
  return { role: "user", content: text };
}

export function storeAssistant(blocks: LlmBlock[]): StoredMessage {
  return { role: "assistant", content: { text: textOf(blocks), blocks } };
}

export function storeToolResults(blocks: LlmBlock[]): StoredMessage {
  return { role: "tool", content: { tool_results: blocks } };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reconstruye el historial para el modelo. Se queda con los últimos `max` mensajes
 * y empieza siempre en un mensaje de texto del cliente, para no enviar resultados
 * de herramientas sin su llamada. Si el último intercambio quedó incompleto (una
 * llamada sin su resultado), lo descarta.
 */
export function toLlmHistory(rows: StoredMessage[], max: number): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const row of rows) {
    if (row.role === "user" && typeof row.content === "string") {
      out.push({ role: "user", content: row.content });
    } else if (row.role === "assistant" && isObj(row.content) && Array.isArray(row.content.blocks)) {
      out.push({ role: "assistant", content: row.content.blocks as LlmBlock[] });
    } else if (row.role === "tool" && isObj(row.content) && Array.isArray(row.content.tool_results)) {
      out.push({ role: "user", content: row.content.tool_results as LlmBlock[] });
    }
  }

  let trimmed = out.slice(-max);
  const firstUserText = trimmed.findIndex((m) => m.role === "user" && typeof m.content === "string");
  trimmed = firstUserText === -1 ? [] : trimmed.slice(firstUserText);

  // Una llamada a herramienta al final sin su resultado rompería la petición.
  const last = trimmed[trimmed.length - 1];
  if (last && last.role === "assistant" && Array.isArray(last.content) && last.content.some(isToolUseBlock)) {
    trimmed = trimmed.slice(0, -1);
  }
  // Y unos resultados sin llamada previa tampoco son válidos.
  return trimmed.filter((m, i) => {
    if (m.role !== "user" || typeof m.content === "string" || !m.content.some(isToolResultBlock)) return true;
    const prev = trimmed[i - 1];
    return prev?.role === "assistant" && Array.isArray(prev.content) && prev.content.some(isToolUseBlock);
  });
}

/** Mensajes visibles para el chat público (sin herramientas). */
export function visibleTranscript(rows: StoredMessage[]): { role: "user" | "assistant"; text: string }[] {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (const row of rows) {
    if (row.role === "user" && typeof row.content === "string") out.push({ role: "user", text: row.content });
    else if (row.role === "assistant" && isObj(row.content) && typeof row.content.text === "string" && row.content.text) {
      out.push({ role: "assistant", text: row.content.text });
    }
  }
  return out;
}
