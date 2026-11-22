import { describe, expect, it } from 'vitest';
import { PUSH_PROMPT_SNOOZE_MS, pushPromptKind, type PushPromptInput } from './pushPrompt';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const base: PushPromptInput = { isSupported: true, permission: 'default', userAgent: ANDROID, isStandalone: false, dismissedUntil: null, now: 1_000 };

describe('pushPromptKind', () => {
  it('invita a activar cuando el permiso no se ha pedido', () => {
    expect(pushPromptKind(base)).toBe('enable');
  });
  it('no insiste si ya están activadas o bloqueadas', () => {
    expect(pushPromptKind({ ...base, permission: 'granted' })).toBeNull();
    expect(pushPromptKind({ ...base, permission: 'denied' })).toBeNull();
  });
  it('en iPhone sin instalar explica cómo instalar la app', () => {
    expect(pushPromptKind({ ...base, userAgent: IPHONE, isSupported: false })).toBe('ios-install');
  });
  it('en iPhone con la app instalada invita a activar', () => {
    expect(pushPromptKind({ ...base, userAgent: IPHONE, isStandalone: true })).toBe('enable');
  });
  it('respeta el «ahora no» durante 7 días', () => {
    expect(pushPromptKind({ ...base, dismissedUntil: base.now + PUSH_PROMPT_SNOOZE_MS })).toBeNull();
    expect(pushPromptKind({ ...base, dismissedUntil: base.now - 1 })).toBe('enable');
  });
  it('sin soporte y fuera de iOS no muestra nada', () => {
    expect(pushPromptKind({ ...base, isSupported: false })).toBeNull();
  });
});
