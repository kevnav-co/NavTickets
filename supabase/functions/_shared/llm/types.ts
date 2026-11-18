// Adaptador de proveedor de modelos para el asistente (plan, fase 3).
// Formato interno común, con forma de bloques como la Messages API de Anthropic.
// Los bloques que el adaptador no interpreta (p. ej. `thinking`) se guardan y se
// devuelven tal cual en los turnos siguientes, como exige la API.
//
// Código puro: sin Deno ni npm, para que Vitest lo pruebe directamente.

export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface LlmToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Cualquier otro bloque del proveedor (thinking, redacted_thinking…): se conserva intacto. */
export interface LlmOpaqueBlock {
  type: string;
  [key: string]: unknown;
}

export type LlmBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock | LlmOpaqueBlock;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | LlmBlock[];
}

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema con additionalProperties: false y todas las propiedades en required (modo estricto). */
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens: number;
  /**
   * Recibe el texto visible a medida que el modelo lo escribe (streaming). Es
   * opcional: un proveedor que no transmite simplemente no lo llama, y la
   * respuesta completa sigue llegando en LlmResponse.
   */
  onText?: (delta: string) => void;
}

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  content: LlmBlock[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export const isTextBlock = (b: LlmBlock): b is LlmTextBlock =>
  b.type === "text" && typeof (b as LlmTextBlock).text === "string";

export const isToolUseBlock = (b: LlmBlock): b is LlmToolUseBlock =>
  b.type === "tool_use" && typeof (b as LlmToolUseBlock).id === "string" && typeof (b as LlmToolUseBlock).name === "string";

export const isToolResultBlock = (b: LlmBlock): b is LlmToolResultBlock =>
  b.type === "tool_result" && typeof (b as LlmToolResultBlock).tool_use_id === "string";

/** Texto visible de una lista de bloques. */
export function textOf(blocks: LlmBlock[]): string {
  return blocks.filter(isTextBlock).map((b) => b.text).join("").trim();
}

/** El proveedor no está disponible (falta la clave, error de red o del servicio). */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** Configuración que no se permite (p. ej. un proveedor de pruebas en una empresa real). */
export class LlmNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotAllowedError";
  }
}
