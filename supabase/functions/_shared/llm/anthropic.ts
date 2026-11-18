// Proveedor Anthropic (por defecto). SDK oficial; modelo por defecto claude-haiku-5-5.
// - Herramientas con strict: true y tool_choice auto (forzar una herramienta hace
//   que el modelo la llame sin razonar antes).
// - Esfuerzo bajo (output_config.effort = "low"): conversar y llamar herramientas
//   sencillas no necesita más, y baja costo y latencia. El razonamiento es adaptativo.
// - Caché del prompt: un punto en el prompt de sistema (cubre herramientas + sistema)
//   y otro en el último bloque del último mensaje (reutiliza la conversación).
// - Haiku 5.5 no tiene respaldo automático ante un rechazo: stop_reason "refusal"
//   se devuelve tal cual y el motor responde con un mensaje propio.
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import type { LlmBlock, LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmStopReason } from "./types.ts";
import { LlmUnavailableError } from "./types.ts";

const STOP: Record<string, LlmStopReason> = {
  end_turn: "end_turn",
  stop_sequence: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
};

/** Copia los mensajes y marca el último bloque del último mensaje para la caché. */
function withCacheBreakpoint(messages: LlmMessage[]): unknown[] {
  return messages.map((m, i) => {
    const blocks: Record<string, unknown>[] = typeof m.content === "string"
      ? [{ type: "text", text: m.content }]
      : m.content.map((b) => ({ ...b }));
    if (i === messages.length - 1 && blocks.length > 0) {
      const last = blocks[blocks.length - 1];
      // Los bloques de razonamiento no admiten cache_control.
      if (last.type === "text" || last.type === "tool_result") {
        blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } };
      }
    }
    return { role: m.role, content: blocks };
  });
}

export function createAnthropicProvider(apiKey: string, model: string): LlmProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    name: "anthropic",
    model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      try {
        // deno-lint-ignore no-explicit-any
        const params: any = {
          model,
          max_tokens: request.maxTokens,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          tools: request.tools.map((t) => ({ ...t, strict: true })),
          tool_choice: { type: "auto" },
          output_config: { effort: "low" },
          messages: withCacheBreakpoint(request.messages),
        };
        // Con onText se usa el stream del SDK: los deltas de texto salen al
        // cliente mientras llegan y finalMessage() trae la respuesta completa
        // (bloques de razonamiento y llamadas a herramientas incluidos).
        let res;
        if (request.onText) {
          const stream = client.messages.stream(params);
          const onText = request.onText;
          stream.on("text", (delta: string) => onText(delta));
          res = await stream.finalMessage();
        } else {
          res = await client.messages.create(params);
        }
        const u = res.usage ?? {};
        return {
          content: res.content as unknown as LlmBlock[],
          stopReason: STOP[res.stop_reason ?? ""] ?? "other",
          usage: {
            inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
            outputTokens: u.output_tokens ?? 0,
          },
        };
      } catch (error) {
        const status = (error as { status?: number }).status;
        console.error("[llm/anthropic] Error de la API:", status, error instanceof Error ? error.message : error);
        throw new LlmUnavailableError(`Anthropic no respondió (${status ?? "sin estado"})`);
      }
    },
  };
}
