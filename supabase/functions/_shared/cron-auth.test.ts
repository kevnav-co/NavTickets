import { describe, it, expect, beforeAll } from 'vitest';

const env: Record<string, string> = { SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'cron-secret' };
beforeAll(() => {
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

const call = (headers: Record<string, string>) => new Request('https://x/functions/v1/task-scheduler', { method: 'POST', headers });

describe('isAuthorizedCronCall', () => {
  it('acepta la service_role key o el secreto del cron', async () => {
    const { isAuthorizedCronCall } = await import('./cron-auth');
    expect(isAuthorizedCronCall(call({ Authorization: 'Bearer service-key' }))).toBe(true);
    expect(isAuthorizedCronCall(call({ 'x-cron-secret': 'cron-secret' }))).toBe(true);
  });

  it('rechaza la anon key, un JWT cualquiera o ninguna credencial', async () => {
    const { isAuthorizedCronCall } = await import('./cron-auth');
    expect(isAuthorizedCronCall(call({ Authorization: 'Bearer anon-key' }))).toBe(false);
    expect(isAuthorizedCronCall(call({ 'x-cron-secret': 'otro' }))).toBe(false);
    expect(isAuthorizedCronCall(call({}))).toBe(false);
  });
});
