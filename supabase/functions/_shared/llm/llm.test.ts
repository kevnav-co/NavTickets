import { describe, it, expect, vi } from 'vitest';
import { createProvider, isTestCompany } from './index';
import { createMockProvider } from './mock';
import { createOpenAiCompatibleProvider, fromOpenAiResponse, toOpenAiMessages } from './openaiCompatible';
import { LlmNotAllowedError, LlmUnavailableError } from './types';

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];

describe('createProvider', () => {
  const demo = 'demo-company';
  it('usa el proveedor de pruebas solo en empresas de prueba', async () => {
    const env = envOf({ LLM_TEST_PROVIDER: 'mock', LLM_TEST_COMPANY_IDS: ` otra , ${demo} ` });
    expect(isTestCompany(env, demo)).toBe(true);
    expect((await createProvider(env, demo)).name).toBe('mock');
  });

  it('sin LLM_PROVIDER, una empresa real nunca usa el proveedor de pruebas: exige la clave de Anthropic', async () => {
    const env = envOf({ LLM_TEST_PROVIDER: 'mock', LLM_TEST_COMPANY_IDS: demo });
    await expect(createProvider(env, 'empresa-real')).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('rechaza un proveedor de pruebas desconocido', async () => {
    const env = envOf({ LLM_TEST_PROVIDER: 'otro', LLM_TEST_COMPANY_IDS: demo });
    await expect(createProvider(env, demo)).rejects.toBeInstanceOf(LlmNotAllowedError);
  });

  it('LLM_PROVIDER=openai-compatible atiende a todas las empresas con la clave de pruebas como respaldo', async () => {
    const env = envOf({
      LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'https://openrouter.ai/api/v1',
      LLM_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b:free', LLM_TEST_API_KEY: 'sk-or-x',
    });
    const p = await createProvider(env, 'empresa-real');
    expect(p.name).toBe('openai-compatible');
    expect(p.model).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
  });

  it('el proveedor por defecto compatible con OpenAI exige URL, modelo y clave', async () => {
    const env = envOf({ LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'https://x' });
    await expect(createProvider(env, 'empresa-real')).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('rechaza un proveedor por defecto desconocido', async () => {
    await expect(createProvider(envOf({ LLM_PROVIDER: 'gratis' }), 'empresa-real')).rejects.toBeInstanceOf(LlmNotAllowedError);
  });

  it('las empresas de prueba conservan su proveedor aunque haya uno por defecto', async () => {
    const env = envOf({ LLM_PROVIDER: 'openai-compatible', LLM_TEST_PROVIDER: 'mock', LLM_TEST_COMPANY_IDS: demo });
    expect((await createProvider(env, demo)).name).toBe('mock');
  });

  it('openai-compatible exige su configuración completa', async () => {
    const env = envOf({ LLM_TEST_PROVIDER: 'openai-compatible', LLM_TEST_COMPANY_IDS: demo, LLM_TEST_BASE_URL: 'https://x' });
    await expect(createProvider(env, demo)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe('proveedor compatible con OpenAI', () => {
  it('traduce llamadas y resultados de herramientas, y omite bloques de razonamiento', () => {
    const out = toOpenAiMessages('sistema', [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: 'Consulto' },
        { type: 'tool_use', id: 't1', name: 'consultar_disponibilidad', input: { desde: '2026-11-20' } },
      ] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"huecos":[]}' }] },
    ]);
    expect(out.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(out[2].tool_calls?.[0].function).toEqual({ name: 'consultar_disponibilidad', arguments: '{"desde":"2026-11-20"}' });
    expect(out[3]).toMatchObject({ tool_call_id: 't1', content: '{"huecos":[]}' });
  });

  it('marca como inválidos los argumentos que no son JSON', () => {
    const res = fromOpenAiResponse({
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'guardar_solicitud', arguments: '{roto' } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.content[0]).toMatchObject({ type: 'tool_use', name: 'guardar_solicitud', input: { __invalid: '{roto' } });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('un error HTTP del proveedor es «no disponible»', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('cuota agotada', { status: 429 }));
    const p = createOpenAiCompatibleProvider('https://x/v1', 'k', 'm', fetchImpl as unknown as typeof fetch);
    await expect(p.complete({ system: 's', messages: [{ role: 'user', content: 'hola' }], tools: [], maxTokens: 10 }))
      .rejects.toBeInstanceOf(LlmUnavailableError);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x/v1/chat/completions');
  });
});

describe('proveedor simulado', () => {
  const system = 'Hoy es 2026-11-18 (zona horaria America/Bogota).';
  it('pide disponibilidad para los próximos 7 días', async () => {
    const res = await createMockProvider().complete({ system, messages: [{ role: 'user', content: '¿Qué disponibilidad tienen?' }], tools: [], maxTokens: 10 });
    expect(res.content[0]).toMatchObject({ type: 'tool_use', name: 'consultar_disponibilidad', input: { desde: '2026-11-19', hasta: '2026-11-25' } });
  });
  it('arma la solicitud desde «clave: valor»', async () => {
    const res = await createMockProvider().complete({ system, messages: [{ role: 'user', content: 'nombre: Ana; telefono: 3001234567; descripcion: la nevera no enfría; lista' }], tools: [], maxTokens: 10 });
    expect(res.content[0]).toMatchObject({ name: 'guardar_solicitud', input: { nombre: 'Ana', telefono: '3001234567', descripcion: 'la nevera no enfría', lista: true } });
  });
});
