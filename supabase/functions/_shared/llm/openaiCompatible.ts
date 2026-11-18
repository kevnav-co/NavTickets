// Proveedor compatible con la API de OpenAI (OpenRouter u otro endpoint).
// SOLO para pruebas internas con datos de la empresa demo: los modelos gratuitos
// pueden registrar o usar los mensajes y su uso de herramientas es irregular.
// index.ts lo rechaza para cualquier empresa que no esté en LLM_TEST_COMPANY_IDS.
import type { LlmBlock, LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmStopReason } from "./types.ts";
import { LlmUnavailableError, isTextBlock, isToolResultBlock, isToolUseBlock } from "./types.ts";

const STOP: Record<string, LlmStopReason> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
  content_filter: "refusal",
};

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** Traduce el formato interno al de chat/completions. Los bloques opacos (razonamiento) se omiten. */
export function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter(isTextBlock).map((b) => b.text).join("");
      const calls = m.content.filter(isToolUseBlock).map((b) => ({
        id: b.id,
        type: "function" as const,
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of m.content) {
        if (isToolResultBlock(b)) out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
        else if (isTextBlock(b)) out.push({ role: "user", content: b.text });
      }
    }
  }
  return out;
}

/** Traduce la respuesta al formato interno. Argumentos con JSON inválido llegan como { __invalid } y la validación los rechaza. */
// deno-lint-ignore no-explicit-any
export function fromOpenAiResponse(json: any): LlmResponse {
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const content: LlmBlock[] = [];
  if (typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const call of msg.tool_calls ?? []) {
    let input: unknown;
    try {
      input = JSON.parse(call?.function?.arguments ?? "{}");
    } catch {
      input = { __invalid: String(call?.function?.arguments ?? "") };
    }
    content.push({ type: "tool_use", id: String(call.id), name: String(call?.function?.name ?? ""), input });
  }
  const finish = String(choice?.finish_reason ?? "");
  const hasCalls = content.some(isToolUseBlock);
  return {
    content,
    stopReason: hasCalls ? "tool_use" : STOP[finish] ?? "other",
    usage: {
      inputTokens: Number(json?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(json?.usage?.completion_tokens ?? 0),
    },
  };
}

export function createOpenAiCompatibleProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  return {
    name: "openai-compatible",
    model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          messages: toOpenAiMessages(request.system, request.messages),
          tools: request.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: "auto",
        }),
      });
      if (!res.ok) {
        console.error("[llm/openai-compatible] HTTP", res.status, (await res.text()).slice(0, 200));
        throw new LlmUnavailableError(`El proveedor respondió ${res.status}`);
      }
      return fromOpenAiResponse(await res.json());
    },
  };
}
