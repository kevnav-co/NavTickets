// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const api = vi.hoisted(() => ({
  initAssistant: vi.fn(),
  sendAssistantMessage: vi.fn(),
  sendVerificationCode: vi.fn(),
  verifyCode: vi.fn(),
}));
vi.mock('../../services/assistantChat', async (orig) => ({ ...(await orig<object>()), ...api }));

import PublicAssistantChat from './PublicAssistantChat';
import { AssistantApiError, assistantSlugFromHash } from '../../services/assistantChat';

const initData = {
  conversationId: 'c1',
  company: { name: 'Plásticos del Sur', logoUrl: 'javascript:alert(1)', primaryColor: '#123456' },
  welcome: 'Hola, ¿en qué te ayudo?',
  privacyNotice: 'Aviso de datos conforme a la Ley 1581.',
  verified: false,
  messages: [],
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
  act(() => { el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<PublicAssistantChat slug="plasticos-del-sur" />); });
  await flush();
}

beforeEach(() => {
  sessionStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.initAssistant.mockResolvedValue(initData);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('PublicAssistantChat', () => {
  it('pide aceptar el aviso de datos antes de chatear', async () => {
    await render();
    expect(host.textContent).toContain('Aviso de datos conforme a la Ley 1581.');
    expect(host.querySelector('textarea')).toBeNull();
    act(() => button('Acepto').click());
    expect(host.textContent).toContain('Hola, ¿en qué te ayudo?');
    expect(sessionStorage.getItem('nt_asistente_conv_plasticos-del-sur')).toBe('c1');
  });

  it('no usa una URL de logo que no sea https', async () => {
    await render();
    expect(host.querySelector('img')).toBeNull();
  });

  it('envía el mensaje y muestra la respuesta y la solicitud registrada', async () => {
    sessionStorage.setItem('nt_asistente_consent_plasticos-del-sur', '1');
    api.sendAssistantMessage.mockResolvedValue({ reply: 'Registré tu solicitud.', request: { status: 'pendiente', reference: 'abcd1234' } });
    await render();
    setValue(host.querySelector('textarea')!, 'La nevera no enfría');
    await act(async () => { button('').closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(api.sendAssistantMessage).toHaveBeenCalledWith('plasticos-del-sur', 'c1', 'La nevera no enfría');
    expect(host.textContent).toContain('La nevera no enfría');
    expect(host.textContent).toContain('Registré tu solicitud.');
    expect(host.textContent).toContain('Solicitud registrada (ref. abcd1234)');
  });

  it('muestra el motivo cuando se alcanza un límite', async () => {
    sessionStorage.setItem('nt_asistente_consent_plasticos-del-sur', '1');
    api.sendAssistantMessage.mockRejectedValue(new AssistantApiError(429, 'Esta conversación llegó a su límite.'));
    await render();
    setValue(host.querySelector('textarea')!, 'hola');
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(host.textContent).toContain('Esta conversación llegó a su límite.');
  });

  it('informa cuando el asistente no está disponible para la empresa', async () => {
    api.initAssistant.mockRejectedValue(new AssistantApiError(404, 'El asistente no está disponible'));
    await render();
    expect(host.textContent).toContain('Asistente no disponible');
    expect(host.textContent).toContain('El asistente no está disponible');
  });

  it('verifica el correo con el código de un solo uso', async () => {
    sessionStorage.setItem('nt_asistente_consent_plasticos-del-sur', '1');
    api.sendVerificationCode.mockResolvedValue({ sent: true, minutes: 10 });
    api.verifyCode.mockResolvedValue({ verified: true });
    await render();
    act(() => button('Verificar mi correo').click());
    setValue(host.querySelector('#verif-email') as HTMLInputElement, 'cliente@empresa.co');
    await act(async () => { host.querySelector('#verif-email')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(api.sendVerificationCode).toHaveBeenCalledWith('plasticos-del-sur', 'c1', 'cliente@empresa.co');
    setValue(host.querySelector('#verif-code') as HTMLInputElement, '123456');
    await act(async () => { host.querySelector('#verif-code')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(api.verifyCode).toHaveBeenCalledWith('plasticos-del-sur', 'c1', 'cliente@empresa.co', '123456');
    expect(host.textContent).toContain('Correo verificado');
  });
});

describe('assistantSlugFromHash', () => {
  it('reconoce solo la ruta pública con un slug válido', () => {
    expect(assistantSlugFromHash('#/asistente/plasticos-del-sur')).toBe('plasticos-del-sur');
    expect(assistantSlugFromHash('#/asistente/plasticos-del-sur/')).toBe('plasticos-del-sur');
    expect(assistantSlugFromHash('#/asistente/../admin')).toBeNull();
    expect(assistantSlugFromHash('#/orders/1')).toBeNull();
    expect(assistantSlugFromHash('')).toBeNull();
  });
});
