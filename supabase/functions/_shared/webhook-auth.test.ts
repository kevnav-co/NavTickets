import { describe, it, expect, beforeEach, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
beforeEach(() => {
  env.WEBHOOK_SECRET = 'webhook-secret';
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const call = (headers: Record<string, string>) =>
  new Request('https://x/functions/v1/on-order-assigned', { method: 'POST', headers });

describe('isAuthorizedWebhook', () => {
  it('acepta el secreto en x-webhook-secret o en Authorization: Bearer', async () => {
    const { isAuthorizedWebhook } = await import('./webhook-auth');
    expect(isAuthorizedWebhook(call({ 'x-webhook-secret': 'webhook-secret' }))).toBe(true);
    expect(isAuthorizedWebhook(call({ Authorization: 'Bearer webhook-secret' }))).toBe(true);
  });

  it('rechaza llamadas sin secreto o con un secreto distinto', async () => {
    const { isAuthorizedWebhook } = await import('./webhook-auth');
    expect(isAuthorizedWebhook(call({}))).toBe(false);
    expect(isAuthorizedWebhook(call({ 'x-webhook-secret': '' }))).toBe(false);
    expect(isAuthorizedWebhook(call({ 'x-webhook-secret': 'otro' }))).toBe(false);
    expect(isAuthorizedWebhook(call({ Authorization: 'Bearer anon-key' }))).toBe(false);
  });

  it('rechaza todo si WEBHOOK_SECRET no está configurado (fail-closed)', async () => {
    env.WEBHOOK_SECRET = undefined;
    const { isAuthorizedWebhook } = await import('./webhook-auth');
    expect(isAuthorizedWebhook(call({ 'x-webhook-secret': 'undefined' }))).toBe(false);
    expect(isAuthorizedWebhook(call({ Authorization: 'Bearer ' }))).toBe(false);
  });
});
