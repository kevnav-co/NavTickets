import { describe, it, expect } from 'vitest';
import type { Client, ServiceOrder } from '../types';
import type { ServiceRequest } from '../types/serviceRequest';
import {
  toHHMM, durationLabel, formatPreferredSlots, initialProposal, technicianConflicts,
  validateProposal, resolveClient, transcriptText, filterRequests,
} from './serviceRequests';

const req = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  companyId: 'c1',
  status: 'pendiente',
  channel: 'web',
  orderType: 'Correctivo',
  description: 'No enfría',
  suggestedPriority: 'Media',
  createdAt: '2026-11-17T10:00:00Z',
  ...over,
});

const order = (over: Partial<ServiceOrder>): ServiceOrder => ({
  id: 'o', companyId: 'c1', name: 'X', equipmentIds: [], technicianId: 't1',
  scheduledDate: '2026-11-24', timeSlot: '08:00', description: '', status: 'Pendiente' as ServiceOrder['status'],
  procedures: [], orderType: 'Correctivo', serviceName: '', priority: 'Media',
  ...over,
});

const client = (over: Partial<Client>): Client => ({ id: 'cl', companyId: 'c1', name: 'C', address: '', contact: '', ...over });

describe('toHHMM y durationLabel', () => {
  it('normaliza horas de Postgres y descarta textos inválidos', () => {
    expect(toHHMM('09:30:00')).toBe('09:30');
    expect(toHHMM('7:05')).toBe('07:05');
    expect(toHHMM('a las 3')).toBeNull();
    expect(toHHMM(null)).toBeNull();
  });
  it('etiqueta duraciones', () => {
    expect(durationLabel(30)).toBe('30 min');
    expect(durationLabel(120)).toBe('2 h');
    expect(durationLabel(90)).toBe('1 h 30 min');
  });
});

describe('formatPreferredSlots', () => {
  it('acepta array de franjas o texto libre', () => {
    expect(formatPreferredSlots([{ date: '2026-11-24', time: '08:00' }, { date: '2026-11-25' }])).toEqual(['2026-11-24 · 08:00', '2026-11-25']);
    expect(formatPreferredSlots('Martes en la mañana')).toEqual(['Martes en la mañana']);
    expect(formatPreferredSlots(null)).toEqual([]);
  });
});

describe('initialProposal', () => {
  const now = new Date(2026, 10, 17, 9, 0); // 17/11/2026 09:00 local
  it('usa la propuesta del asistente si existe', () => {
    const p = initialProposal(req({ proposedDate: '2026-11-24', proposedTime: '10:00:00', proposedDurationMinutes: 120, proposedTechnicianId: 't2' }), now);
    expect(p).toEqual({ date: '2026-11-24', time: '10:00', durationMinutes: 120, technicianId: 't2' });
  });
  it('si no, la primera franja preferida', () => {
    expect(initialProposal(req({ preferredSlots: [{ date: '2026-11-25', time: '14:00' }] }), now))
      .toEqual({ date: '2026-11-25', time: '14:00', durationMinutes: 60, technicianId: '' });
  });
  it('si no, mañana a las 08:00 durante una hora', () => {
    expect(initialProposal(req(), now)).toEqual({ date: '2026-11-18', time: '08:00', durationMinutes: 60, technicianId: '' });
  });
});

describe('technicianConflicts (mismo criterio que la base de datos)', () => {
  const orders = [
    order({ id: 'a', timeSlot: '08:00', scheduledEndTime: '10:00' }),
    order({ id: 'b', timeSlot: '11:00', scheduledEndTime: '12:00', status: 'Cerrado' as ServiceOrder['status'] }),
    order({ id: 'c', timeSlot: '13:00' }),                       // sin fin: una hora
    order({ id: 'd', technicianId: 't2', timeSlot: '10:00' }),   // otro técnico
    order({ id: 'e', scheduledDate: '2026-11-25', timeSlot: '10:00' }), // otro día
  ];
  const p = (time: string, durationMinutes: number) => ({ date: '2026-11-24', time, durationMinutes, technicianId: 't1' });

  it('detecta solapamientos y respeta los bordes', () => {
    expect(technicianConflicts(orders, p('09:00', 60)).map(o => o.id)).toEqual(['a']);
    expect(technicianConflicts(orders, p('10:00', 60))).toEqual([]);          // empieza justo al terminar
    expect(technicianConflicts(orders, p('13:30', 60)).map(o => o.id)).toEqual(['c']);
    expect(technicianConflicts(orders, p('14:00', 60))).toEqual([]);
  });
  it('ignora órdenes cerradas, de otro técnico o de otro día', () => {
    expect(technicianConflicts(orders, p('11:00', 60))).toEqual([]);
  });
  it('sin técnico no hay conflicto que mostrar', () => {
    expect(technicianConflicts(orders, { ...p('09:00', 60), technicianId: '' })).toEqual([]);
  });
});

describe('validateProposal', () => {
  const now = new Date(2026, 10, 17, 9, 0);
  const ok = { date: '2026-11-24', time: '10:00', durationMinutes: 60, technicianId: 't1' };
  it('acepta una propuesta completa', () => expect(validateProposal(ok, now)).toBeNull());
  it('exige técnico, fecha y hora', () => {
    expect(validateProposal({ ...ok, technicianId: '' }, now)).toMatch(/técnico/);
    expect(validateProposal({ ...ok, time: '' }, now)).toMatch(/fecha y hora/);
  });
  it('rechaza el pasado y pasar la medianoche', () => {
    expect(validateProposal({ ...ok, date: '2026-11-16' }, now)).toMatch(/pasado/);
    expect(validateProposal({ ...ok, date: '2026-11-17', time: '08:30' }, now)).toMatch(/pasado/);
    expect(validateProposal({ ...ok, time: '23:30' }, now)).toMatch(/mismo día/);
  });
  it('rechaza duraciones fuera de rango', () => {
    expect(validateProposal({ ...ok, durationMinutes: 10 }, now)).toMatch(/duración/);
  });
});

describe('resolveClient (anticipa confirm_service_request)', () => {
  const clients = [
    client({ id: 'x', name: 'Cliente Existente', email: 'existente@cliente.co', identification: '900' }),
    client({ id: 'y', name: 'Otro' }),
  ];
  it('usa el cliente enlazado', () => {
    expect(resolveClient(req({ clientId: 'y' }), clients)).toEqual({ kind: 'linked', client: clients[1] });
  });
  it('encuentra por correo sin distinguir mayúsculas o por identificación', () => {
    expect(resolveClient(req({ contactEmail: 'EXISTENTE@cliente.co' }), clients)).toMatchObject({ kind: 'match', client: { id: 'x' } });
    expect(resolveClient(req({ contactIdentification: '900' }), clients)).toMatchObject({ kind: 'match', client: { id: 'x' } });
  });
  it('crea uno nuevo, con sufijo si el nombre ya existe', () => {
    expect(resolveClient(req({ contactName: 'Nuevo' }), clients)).toEqual({ kind: 'new', name: 'Nuevo' });
    expect(resolveClient(req({ contactName: 'Cliente Existente', contactPhone: '300' }), clients)).toEqual({ kind: 'new', name: 'Cliente Existente (300)' });
  });
});

describe('transcriptText y filterRequests', () => {
  it('muestra texto y oculta herramientas', () => {
    expect(transcriptText('Hola')).toBe('Hola');
    expect(transcriptText({ text: 'Hola' })).toBe('Hola');
    expect(transcriptText({ tool: 'consultar_disponibilidad', input: {} })).toBeNull();
  });
  it('filtra por estado y texto', () => {
    const list = [req({ id: '1', contactName: 'Ana' }), req({ id: '2', status: 'confirmada', serviceName: 'Nevera' })];
    expect(filterRequests(list, 'pendiente', '').map(r => r.id)).toEqual(['1']);
    expect(filterRequests(list, 'todas', 'nevera').map(r => r.id)).toEqual(['2']);
  });
});
