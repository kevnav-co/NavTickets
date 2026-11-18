// Selección del proveedor de modelos.
//
//  - Empresas reales: siempre Anthropic (SDK oficial). Modelo por LLM_MODEL
//    (por defecto claude-haiku-5-5). Clave en el secreto ANTHROPIC_API_KEY.
//  - Empresas de prueba (ids en LLM_TEST_COMPANY_IDS, separados por comas):
//    pueden usar LLM_TEST_PROVIDER = mock | openai-compatible | anthropic.
//    openai-compatible usa LLM_TEST_BASE_URL, LLM_TEST_API_KEY y LLM_TEST_MODEL.
//
// Un proveedor de pruebas nunca atiende a una empresa real: los modelos gratuitos
// pueden registrar los mensajes (Ley 1581 de 2012) y su uso de herramientas es irregular.
import type { LlmProvider } from "./types.ts";
import { LlmNotAllowedError, LlmUnavailableError } from "./types.ts";
import { createMockProvider } from "./mock.ts";
import { createOpenAiCompatibleProvider } from "./openaiCompatible.ts";

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

export type EnvGetter = (key: string) => string | undefined;

export function isTestCompany(env: EnvGetter, companyId: string): boolean {
  return (env("LLM_TEST_COMPANY_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(companyId);
}

export async function createProvider(env: EnvGetter, companyId: string): Promise<LlmProvider> {
  const testProvider = (env("LLM_TEST_PROVIDER") ?? "").trim().toLowerCase();
  const useTest = testProvider !== "" && testProvider !== "anthropic" && isTestCompany(env, companyId);

  if (useTest) {
    if (testProvider === "mock") return createMockProvider();
    if (testProvider === "openai-compatible") {
      const baseUrl = env("LLM_TEST_BASE_URL");
      const apiKey = env("LLM_TEST_API_KEY");
      const model = env("LLM_TEST_MODEL");
      if (!baseUrl || !apiKey || !model) {
        throw new LlmUnavailableError("Faltan LLM_TEST_BASE_URL, LLM_TEST_API_KEY o LLM_TEST_MODEL");
      }
      return createOpenAiCompatibleProvider(baseUrl, apiKey, model);
    }
    throw new LlmNotAllowedError(`Proveedor de pruebas desconocido: ${testProvider}`);
  }

  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new LlmUnavailableError("Falta el secreto ANTHROPIC_API_KEY");
  const model = env("LLM_MODEL") || DEFAULT_ANTHROPIC_MODEL;
  // Import dinámico: el SDK solo se carga cuando de verdad se usa Anthropic.
  const { createAnthropicProvider } = await import("./anthropic.ts");
  return createAnthropicProvider(apiKey, model);
}
