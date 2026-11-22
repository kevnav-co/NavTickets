import { describe, it, expect, beforeAll } from 'vitest';

const env: Record<string, string> = {
  APP_URL: 'https://navtickets.vercel.app/',
  APP_ALLOWED_ORIGINS: 'http://localhost:8080, https://otra.example.com',
};
beforeAll(() => {
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

const req = (method: string, origin?: string) =>
  new Request('https://x/functions/v1/create-user', { method, headers: origin ? { Origin: origin } : {} });

describe('withCors', () => {
  it('responde el preflight de un origen de la app', async () => {
    const { withCors } = await import('./cors');
    const res = await withCors(() => new Response('no debe llamarse', { status: 500 }))(req('OPTIONS', 'https://navtickets.vercel.app'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://navtickets.vercel.app');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
  });

  it('añade las cabeceras a la respuesta y conserva estado y cuerpo', async () => {
    const { withCors } = await import('./cors');
    const res = await withCors(() => new Response('{"ok":false}', { status: 403, headers: { 'Content-Type': 'application/json' } }))(
      req('POST', 'http://localhost:8080'),
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"ok":false}');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
  });

  it('no autoriza otros orígenes', async () => {
    const { withCors } = await import('./cors');
    const res = await withCors(() => new Response('x'))(req('OPTIONS', 'https://malicioso.example'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('appOriginFor', () => {
  it('usa el origen de la petición solo si es de la app', async () => {
    const { appOriginFor } = await import('./cors');
    expect(appOriginFor(req('POST', 'https://otra.example.com'))).toBe('https://otra.example.com');
    expect(appOriginFor(req('POST', 'https://malicioso.example'))).toBe('https://navtickets.vercel.app');
    expect(appOriginFor(req('POST'))).toBe('https://navtickets.vercel.app');
  });
});
