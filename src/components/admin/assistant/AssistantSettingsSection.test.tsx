// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../../utils/assistantSettings';

// ─── Dobles de los contextos y servicios ─────────────────────────────────────
const fetchMock = vi.fn();
const saveMock = vi.fn();
const previewMock = vi.fn();
vi.mock('../../../services/assistantSettings', () => ({
  fetchAssistantSettings: (...a: unknown[]) => fetchMock(...a),
  saveAssistantSettings: (...a: unknown[]) => saveMock(...a),
  previewAvailableSlots: (...a: unknown[]) => previewMock(...a),
}));
vi.mock('../../../hooks/useConnectivityStatus', () => ({ useConnectivityStatus: () => ({ isOnline: true }) }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u-admin', companyId: 'c1', role: 'admin', name: 'Admin' } }),
}));
vi.mock('../../../context/CompanyContext', () => ({
  useCompany: () => ({ company: { id: 'c1', name: 'Plásticos del Sur', slug: 'plasticos-del-sur', features: { aiAssistant: true } } }),
}));
vi.mock('../../../context/DataContext', () => ({
  useData: () => ({
    users: [
      { id: 't1', companyId: 'c1', name: 'Tec Uno', role: 'technician' },
      { id: 't2', companyId: 'c1', name: 'Tec Dos', role: 'technician' },
      { id: 'x1', companyId: 'otra', name: 'Ajeno', role: 'technician' },
      { id: 'd1', companyId: 'c1', name: 'Dev', role: 'developer' },
    ],
  }),
}));
// El QR se prueba aparte; aquí basta con que no cargue la librería.
vi.mock('../../../utils/qr', () => ({
  makeQrMatrix: () => Promise.resolve([[true]]),
  qrSvgPath: () => 'M4 4h1v1h-1z',
  qrPngDataUrl: () => 'data:image/png;base64,',
}));

import AssistantSettingsSection from './AssistantSettingsSection';

let host: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AssistantSettingsSection onSaved={onSaved} />);
  });
}

const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  fetchMock.mockResolvedValue({ settings: structuredClone(DEFAULT_ASSISTANT_SETTINGS), exists: true, updatedAt: null });
  saveMock.mockImplementation(async (_c: string, _u: string, s: unknown) => ({ settings: s, exists: true, updatedAt: null }));
  previewMock.mockResolvedValue([]);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('AssistantSettingsSection', () => {
  it('muestra el enlace público de la empresa y solo los técnicos asignables de la empresa', async () => {
    await render();
    const link = host.querySelector('input[readonly]') as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/#/asistente/plasticos-del-sur`);
    expect(host.textContent).toContain('Tec Uno');
    expect(host.textContent).toContain('Tec Dos');
    expect(host.textContent).not.toContain('Ajeno');
    expect(host.textContent).not.toContain('Dev');
    expect(button('Guardar')!.disabled).toBe(true);
  });

  it('no guarda con errores y los muestra', async () => {
    await render();
    const welcome = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => setValue(welcome, '   '));
    await act(async () => button('Guardar')!.click());
    expect(saveMock).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Escribe el mensaje de bienvenida.');
  });

  it('guarda los cambios y avisa', async () => {
    await render();
    const welcome = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => setValue(welcome, 'Hola, ¿qué equipo falla?'));
    const tec = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.includes('Tec Dos'))!
      .querySelector('input') as HTMLInputElement;
    await act(async () => tec.click());
    await act(async () => button('Guardar')!.click());
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [companyId, userId, saved] = saveMock.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(userId).toBe('u-admin');
    expect(saved.welcomeMessage).toBe('Hola, ¿qué equipo falla?');
    expect(saved.technicianIds).toEqual(['t2']);
    expect(onSaved).toHaveBeenCalledWith('Configuración del asistente guardada. El chat ya usa los cambios.');
    expect(button('Guardar')!.disabled).toBe(true);
  });

  it('cerrar un día lo quita del horario', async () => {
    await render();
    const sabado = Array.from(host.querySelectorAll('label')).find(l => l.textContent === 'Sábado')!
      .querySelector('input') as HTMLInputElement;
    await act(async () => sabado.click());
    await act(async () => button('Guardar')!.click());
    expect(saveMock.mock.calls[0][2].workingHours['6']).toBeUndefined();
  });

  it('la vista previa pide huecos con la duración del servicio elegido', async () => {
    previewMock.mockResolvedValue([
      { date: '2026-11-19', time: '08:00', freeTechnicians: 2 },
      { date: '2026-11-19', time: '08:30', freeTechnicians: 1 },
    ]);
    await render();
    await act(async () => button('Ver huecos')!.click());
    expect(previewMock).toHaveBeenCalledWith('c1', expect.any(String), expect.any(String), 120);
    expect(host.textContent).toContain('08:00');
    expect(host.textContent).toContain('2 huecos en total');
  });

  it('si la carga falla, permite reintentar', async () => {
    fetchMock.mockRejectedValueOnce(new Error('sin red'));
    await render();
    expect(host.textContent).toContain('sin red');
    await act(async () => button('Reintentar')!.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Enlace para tus clientes');
  });
});
