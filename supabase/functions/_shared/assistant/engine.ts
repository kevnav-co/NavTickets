// Motor de un turno del asistente: llama al modelo, ejecuta las herramientas que
// pida (validadas por el ejecutor) y repite hasta obtener una respuesta de texto o
// agotar las iteraciones. Devuelve lo que hay que guardar; no toca la base de datos.
import type { LlmBlock, LlmMessage, LlmProvider, LlmTool, LlmUsage } from "../llm/types.ts";
import { isToolUseBlock, textOf } from "../llm/types.ts";
import type { StoredMessage } from "./history.ts";
import { storeAssistant, storeToolResults, storeUser } from "./history.ts";

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export type ToolExecutor = (name: string, input: unknown) => Promise<ToolOutcome>;

export interface TurnOptions {
  provider: LlmProvider;
  system: string;
  tools: LlmTool[];
  history: LlmMessage[];
  userText: string;
  executeTool: ToolExecutor;
  maxIterations: number;
  maxTokens: number;
  /**
   * Texto que el modelo va escribiendo, para mostrarlo mientras llega. Es solo
   * una vista previa: la respuesta definitiva es `reply` del resultado, que
   * reemplaza lo transmitido (un rechazo o una respuesta cortada la cambian).
   */
  onText?: (delta: string) => void;
}

export type TurnEnd = "ok" | "refusal" | "max_tokens" | "iterations";

export interface TurnResult {
  reply: string;
  end: TurnEnd;
  toStore: StoredMessage[];
  usage: LlmUsage;
  toolsUsed: string[];
}

export const REFUSAL_REPLY =
  "Lo siento, no puedo ayudarte con eso por este medio. Si quieres, deja tu nombre y un teléfono y la empresa te contactará.";
export const ITERATIONS_REPLY =
  "Necesito un momento más para completar eso. ¿Puedes repetirme en un mensaje lo que necesitas?";
export const TRUNCATED_REPLY = "Mi respuesta quedó incompleta. ¿Puedes repetirme la pregunta de forma más breve?";

export async function runTurn(opts: TurnOptions): Promise<TurnResult> {
  const messages: LlmMessage[] = [...opts.history, { role: "user", content: opts.userText }];
  const toStore: StoredMessage[] = [storeUser(opts.userText)];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  const toolsUsed: string[] = [];

  for (let i = 0; i < opts.maxIterations; i++) {
    const res = await opts.provider.complete({
      system: opts.system,
      messages,
      tools: opts.tools,
      maxTokens: opts.maxTokens,
      onText: opts.onText,
    });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;

    // Un rechazo puede cortar una llamada a herramienta a medias: nunca se ejecuta.
    if (res.stopReason === "refusal") {
      const blocks: LlmBlock[] = [{ type: "text", text: REFUSAL_REPLY }];
      toStore.push(storeAssistant(blocks));
      return { reply: REFUSAL_REPLY, end: "refusal", toStore, usage, toolsUsed };
    }

    // Con max_tokens una llamada a herramienta puede venir cortada: no se ejecuta.
    if (res.stopReason === "max_tokens") {
      const text = textOf(res.content);
      const reply = text || TRUNCATED_REPLY;
      toStore.push(storeAssistant([{ type: "text", text: reply }]));
      return { reply, end: "max_tokens", toStore, usage, toolsUsed };
    }

    const calls = res.content.filter(isToolUseBlock);

    if (calls.length === 0) {
      const reply = textOf(res.content);
      toStore.push(storeAssistant(res.content));
      return { reply: reply || ITERATIONS_REPLY, end: "ok", toStore, usage, toolsUsed };
    }

    messages.push({ role: "assistant", content: res.content });
    toStore.push(storeAssistant(res.content));

    const results: LlmBlock[] = [];
    for (const call of calls) {
      toolsUsed.push(call.name);
      let outcome: ToolOutcome;
      try {
        outcome = await opts.executeTool(call.name, call.input);
      } catch (error) {
        console.error(`[assistant] Error en la herramienta ${call.name}:`, error);
        outcome = { content: "No se pudo completar la operación. Intenta de nuevo más tarde.", isError: true };
      }
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
    toStore.push(storeToolResults(results));
  }

  toStore.push(storeAssistant([{ type: "text", text: ITERATIONS_REPLY }]));
  return { reply: ITERATIONS_REPLY, end: "iterations", toStore, usage, toolsUsed };
}
