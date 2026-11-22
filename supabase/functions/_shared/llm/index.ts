// Selección del proveedor de modelos.
//
//  - Proveedor por defecto de TODAS las empresas: LLM_PROVIDER.
//      anthropic (si falta): SDK oficial, modelo LLM_MODEL (por defecto
//        claude-haiku-5-5), clave ANTHROPIC_API_KEY.
//      openai-compatible: cualquier endpoint compatible con OpenAI (p. ej.
//        OpenRouter con Nemotron), con LLM_BASE_URL, LLM_MODEL y la clave
//        LLM_API_KEY (si falta, LLM_TEST_API_KEY: la misma clave de OpenRouter
//        que ya usaban las empresas de prueba).
//  - Empresas de prueba (ids en LLM_TEST_COMPANY_IDS): pueden usar otro
//    proveedor con LLM_TEST_PROVIDER = mock | openai-compatible | anthropic.
//
// Decisión del dueño (22/11/2026): todo el asistente usa Nemotron gratuito por
// OpenRouter mientras la app está en pruebas. Los modelos gratuitos pueden
// registrar o usar los mensajes para entrenar: con datos reales de clientes hay
// que revisar la Ley 1581 de 2012 o pasar a un proveedor de pago (manual §10.6).
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
    if (testProvider === "mock") return createMockProvider({ chunkDelayMs: 25 });
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

  const defaultProvider = (env("LLM_PROVIDER") ?? "").trim().toLowerCase() || "anthropic";
  if (defaultProvider === "openai-compatible") {
    const baseUrl = env("LLM_BASE_URL");
    const apiKey = env("LLM_API_KEY") || env("LLM_TEST_API_KEY");
    const model = env("LLM_MODEL");
    if (!baseUrl || !apiKey || !model) {
      throw new LlmUnavailableError("Faltan LLM_BASE_URL, LLM_MODEL o la clave (LLM_API_KEY / LLM_TEST_API_KEY)");
    }
    return createOpenAiCompatibleProvider(baseUrl, apiKey, model);
  }
  if (defaultProvider !== "anthropic") {
    throw new LlmNotAllowedError(`Proveedor desconocido: ${defaultProvider}`);
  }

  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new LlmUnavailableError("Falta el secreto ANTHROPIC_API_KEY");
  const model = env("LLM_MODEL") || DEFAULT_ANTHROPIC_MODEL;
  // Import dinámico: el SDK solo se carga cuando de verdad se usa Anthropic.
  const { createAnthropicProvider } = await import("./anthropic.ts");
  return createAnthropicProvider(apiKey, model);
}
