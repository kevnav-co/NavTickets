// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ServiceRequest } from '../../types/serviceRequest';

// ─── Dobles de los contextos y servicios ─────────────────────────────────────
const confirmMock = vi.fn();
const rejectMock = vi.fn();
vi.mock('../../services/serviceRequests', () => ({
  confirmServiceRequest: (...a: unknown[]) => confirmMock(...a),
  rejectServiceRequest: (...a: unknown[]) => rejectMock(...a),
}));
vi.mock('../../hooks/useConnectivityStatus', () => ({ useConnectivityStatus: () => ({ isOnline: true }) }));
vi.mock('../../hooks/useCollection', () => ({
  useCollection: () => ({ data: [
    { id: '1', conversationId: 'conv', role: 'user', content: 'Hola, la nevera no enfría', createdAt: '2026-11-17T10:00:00Z' },
    { id: '2', conversationId: 'conv', role: 'tool', content: { tool: 'consultar_disponibilidad' }, createdAt: '2026-11-17T10:00:01Z' },
    { id: '3', conversationId: 'conv', role: 'assistant', content: 'Tengo el lunes a las 10:00', createdAt: '2026-11-17T10:00:02Z' },
  ], loading: false, error: null }),
}));
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    users: [
      { id: 't1', name: 'Tec Uno', role: 'technician' },
      { id: 't2', name: 'Tec Dos', role: 'technician' },
      { id: 'd1', name: 'Dev', role: 'developer' },
    ],
    orders: [
      { id: 'o1', orderNumber: 7, technicianId: 't1', scheduledDate: '2026-11-24', timeSlot: '08:00', scheduledEndTime: '10:00', status: 'Pendiente' },
    ],
    clients: [{ id: 'cl1', name: 'Cliente Existente', email: 'existente@cliente.co' }],
    equipment: [],
    isEquipmentLoaded: true,
    loadEquipment: vi.fn(),
  }),
}));

import ServiceRequestDetail from './ServiceRequestDetail';

const base: ServiceRequest = {
  id: 'r1', companyId: 'c1', status: 'pendiente', channel: 'web', conversationId: 'conv',
  contactName: 'Nuevo Cliente', contactPhone: '3001112222', contactEmail: 'existente@cliente.co',
  orderType: 'Correctivo', description: 'No enfría', suggestedPriority: 'Alta',
  proposedDate: '2026-11-24', proposedTime: '09:00:00', proposedDurationMinutes: 60, proposedTechnicianId: 't1',
  createdAt: '2026-11-17T10:00:00Z',
};

let host: HTMLDivElement;
let root: Root;

function render(request: ServiceRequest) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/requests/${request.id}`]}>
        <Routes>
          <Route path="/requests/:id" element={<ServiceRequestDetail request={request} onBack={() => undefined} />} />
          <Route path="/orders/:id" element={<p>Pantalla de la orden</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const byText = (text: string) =>
  Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  act(() => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 17, 9, 0));
  confirmMock.mockReset();
  rejectMock.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('ServiceRequestDetail', () => {
  it('muestra la conversación sin los mensajes de herramientas', () => {
    render(base);
    expect(host.textContent).toContain('Hola, la nevera no enfría');
    expect(host.textContent).toContain('Tengo el lunes a las 10:00');
    expect(host.textContent).not.toContain('consultar_disponibilidad');
    expect(host.textContent).toContain('2 mensajes');
  });

  it('anticipa que usará el cliente registrado con el mismo correo', () => {
    render(base);
    expect(host.textContent).toContain('Se usará el cliente registrado');
    expect(host.textContent).toContain('Cliente Existente');
  });

  it('solo ofrece técnicos asignables', () => {
    render(base);
    const options = Array.from(host.querySelectorAll('select')[0].querySelectorAll('option')).map(o => o.textContent);
    expect(options).toEqual(['Elige un técnico…', 'Tec Dos', 'Tec Uno']);
  });

  it('avisa del choque con otra orden y no deja confirmar', () => {
    render(base);
    expect(host.textContent).toContain('ya tiene una orden en ese horario');
    expect(byText('Confirmar y crear la orden')!.disabled).toBe(true);
  });

  it('confirma con la propuesta corregida y abre la orden creada', async () => {
    confirmMock.mockResolvedValue('orden-nueva');
    render(base);
    setValue(host.querySelector('input[type="time"]') as HTMLInputElement, '10:00');
    const btn = byText('Confirmar y crear la orden')!;
    expect(btn.disabled).toBe(false);
    await act(async () => { btn.click(); });
    expect(confirmMock).toHaveBeenCalledWith('r1', { date: '2026-11-24', time: '10:00', durationMinutes: 60, technicianId: 't1' });
    expect(host.textContent).toContain('Pantalla de la orden');
  });

  it('muestra el error del servidor si la confirmación falla', async () => {
    confirmMock.mockRejectedValue(new Error('El técnico ya tiene una orden en ese horario'));
    render(base);
    setValue(host.querySelector('select') as HTMLSelectElement, 't2');
    await act(async () => { byText('Confirmar y crear la orden')!.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('El técnico ya tiene una orden en ese horario');
  });

  it('rechaza solo con motivo', async () => {
    rejectMock.mockResolvedValue(undefined);
    render(base);
    act(() => { byText('Rechazar')!.click(); });
    const send = byText('Rechazar solicitud')!;
    expect(send.disabled).toBe(true);
    setValue(host.querySelector('textarea') as HTMLTextAreaElement, 'Fuera de cobertura');
    await act(async () => { byText('Rechazar solicitud')!.click(); });
    expect(rejectMock).toHaveBeenCalledWith('r1', 'Fuera de cobertura');
  });

  it('una solicitud confirmada enlaza su orden y no ofrece acciones', () => {
    render({ ...base, status: 'confirmada', orderId: 'o9', reviewedBy: 't2', reviewedAt: '2026-11-17T11:00:00Z' });
    expect(host.querySelector('a[href="/orders/o9"]')).not.toBeNull();
    expect(byText('Confirmar y crear la orden')).toBeUndefined();
    expect(host.textContent).toContain('Confirmada por Tec Dos');
  });
});
