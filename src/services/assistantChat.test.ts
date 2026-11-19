import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantApiError, createNdjsonParser, sendAssistantMessageStream } from './assistantChat';

function streamResponse(chunks: string[], init: ResponseInit = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' }, ...init });
}

afterEach(() => vi.unstubAllGlobals());

describe('createNdjsonParser', () => {
  it('une líneas cortadas entre trozos e ignora vacías o corruptas', () => {
    const events: unknown[] = [];
    const p = createNdjsonParser((e) => events.push(e));
    p.push('{"type":"delta","te');
    p.push('xt":"Ho"}\n\n{basura}\n{"type":"delta","text":"la"}');
    p.end();
    expect(events).toEqual([{ type: 'delta', text: 'Ho' }, { type: 'delta', text: 'la' }]);
  });
});

describe('sendAssistantMessageStream', () => {
  it('pide stream y entrega el texto acumulado y la respuesta definitiva', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      '{"type":"delta","text":"Tengo "}\n{"type":"del',
      'ta","text":"hueco"}\n',
      '{"type":"done","reply":"Tengo hueco el jueves.","request":{"status":"pendiente","reference":"abcd1234"}}\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const res = await sendAssistantMessageStream('acme', 'c1', 'hola', (t) => seen.push(t));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: 'message', stream: true, message: 'hola' });
    expect(seen).toEqual(['Tengo ', 'Tengo hueco']);
    expect(res).toEqual({ reply: 'Tengo hueco el jueves.', request: { status: 'pendiente', reference: 'abcd1234' } });
  });

  it('un evento de error se convierte en AssistantApiError con su estado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      '{"type":"delta","text":"Déjame"}\n{"type":"error","status":503,"error":"No disponible"}\n',
    ])));
    await expect(sendAssistantMessageStream('acme', 'c1', 'hola', () => undefined))
      .rejects.toMatchObject({ status: 503, message: 'No disponible' });
  });

  it('los errores previos llegan como JSON con su código HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Límite alcanzado' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    })));
    const err = await sendAssistantMessageStream('acme', 'c1', 'hola', () => undefined).catch((e) => e);
    expect(err).toBeInstanceOf(AssistantApiError);
    expect(err).toMatchObject({ status: 429, message: 'Límite alcanzado' });
  });

  it('un stream que termina sin "done" es un error, no una respuesta vacía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(['{"type":"delta","text":"Ten"}\n'])));
    await expect(sendAssistantMessageStream('acme', 'c1', 'hola', () => undefined))
      .rejects.toMatchObject({ status: 0 });
  });

  it('sin red, avisa de la conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    await expect(sendAssistantMessageStream('acme', 'c1', 'hola', () => undefined))
      .rejects.toMatchObject({ status: 0 });
  });
});
