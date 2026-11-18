import { describe, expect, it } from 'vitest';
import { createTurnStream, ndjsonLine } from './stream';
import { runTurn } from './engine';
import { ASSISTANT_TOOLS } from './tools';
import { createMockProvider, streamChunks } from '../llm/mock';

async function readAll(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const fail = () => ({ status: 500, message: 'Ocurrió un error.' });

describe('createTurnStream', () => {
  it('emite los deltas y termina con un solo "done"', async () => {
    const stream = createTurnStream(async (emit) => {
      emit('Hola ');
      emit('');
      emit('mundo');
      return { type: 'done', reply: 'Hola mundo.', request: null };
    }, fail);
    expect(await readAll(stream)).toEqual([
      { type: 'delta', text: 'Hola ' },
      { type: 'delta', text: 'mundo' },
      { type: 'done', reply: 'Hola mundo.', request: null },
    ]);
  });

  it('un error termina con un evento "error" traducido, sin "done" ni detalles internos', async () => {
    const stream = createTurnStream(async (emit) => {
      emit('Déjame ');
      throw new Error('clave de base de datos filtrada');
    }, fail);
    const events = await readAll(stream);
    expect(events).toEqual([{ type: 'delta', text: 'Déjame ' }, { type: 'error', status: 500, error: 'Ocurrió un error.' }]);
    expect(JSON.stringify(events)).not.toContain('filtrada');
  });

  it('si el cliente cierra la conexión, el turno termina igual (y se guarda)', async () => {
    let finished = false;
    const stream = createTurnStream(async (emit) => {
      emit('uno ');
      await new Promise((r) => setTimeout(r, 5));
      emit('dos');
      finished = true;
      return { type: 'done', reply: 'uno dos', request: null };
    }, fail);
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 20));
    expect(finished).toBe(true);
  });

  it('cada línea es JSON válido terminado en salto de línea', () => {
    expect(ndjsonLine({ type: 'delta', text: 'a\nb' })).toBe('{"type":"delta","text":"a\\nb"}\n');
  });
});

describe('streaming del proveedor simulado y del motor', () => {
  it('streamChunks conserva el texto exacto', () => {
    const t = 'Tengo disponibilidad en: 2026-11-19 a las 08:00,  y más.';
    expect(streamChunks(t).join('')).toBe(t);
  });

  it('el simulado emite por palabras el mismo texto que devuelve', async () => {
    const deltas: string[] = [];
    const res = await createMockProvider().complete({
      system: 'Hoy es 2026-11-18', tools: ASSISTANT_TOOLS, maxTokens: 100,
      messages: [{ role: 'user', content: 'hola' }],
      onText: (d) => deltas.push(d),
    });
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.join('')).toBe((res.content[0] as { text: string }).text);
  });

  it('el motor pasa onText a cada llamada y la respuesta final coincide con lo transmitido en la última', async () => {
    const deltas: string[] = [];
    const result = await runTurn({
      provider: createMockProvider(),
      system: 'Hoy es 2026-11-18',
      tools: ASSISTANT_TOOLS,
      history: [],
      userText: '¿Qué disponibilidad tienen?',
      executeTool: async () => ({ content: JSON.stringify({ huecos: [{ fecha: '2026-11-19', hora: '08:00' }] }) }),
      maxIterations: 4,
      maxTokens: 100,
      onText: (d) => deltas.push(d),
    });
    expect(result.toolsUsed).toEqual(['consultar_disponibilidad']);
    expect(deltas.join('')).toBe(result.reply);
    expect(result.reply).toBe('Tengo disponibilidad en: 2026-11-19 a las 08:00.');
  });
});
