import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWarrantyInfo } from './warranty';
import { OrderStatus } from '../types';

describe('warrantyUtils', () => {
  beforeEach(() => {
    // Congelar tiempo para pruebas deterministas (2024-05-23)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debe retornar null si la orden no está cerrada', () => {
    expect(getWarrantyInfo({ status: OrderStatus.PENDING })).toBeNull();
  });

  it('debe calcular correctamente usando warrantyExpiration', () => {
    const order = {
      status: OrderStatus.CLOSED,
      warrantyExpiration: '2024-05-24'
    };
    const info = getWarrantyInfo(order);
    expect(info?.text).toBe('Vence Mañana');
    expect(info?.expired).toBe(false);
  });

  it('debe indicar vencido si la fecha ya pasó', () => {
    const order = {
      status: OrderStatus.CLOSED,
      warrantyExpiration: '2024-05-22'
    };
    const info = getWarrantyInfo(order);
    expect(info?.text).toBe('Vencida');
    expect(info?.expired).toBe(true);
  });

  it('debe manejar el fallback de period + endTime', () => {
    const order = {
      status: OrderStatus.CLOSED,
      endTime: '2024-05-20T10:00:00Z',
      warrantyPeriod: 5 // 20 + 5 = 25
    };
    const info = getWarrantyInfo(order);
    expect(info?.text).toBe('2 días'); // 25 - 23 = 2
  });

  it('debe indicar que vence hoy si la fecha coincide', () => {
    const order = {
      status: OrderStatus.CLOSED,
      warrantyExpiration: '2024-05-23'
    };
    const info = getWarrantyInfo(order);
    expect(info?.text).toBe('Vence Hoy');
  });

  it('debe manejar casos donde el cierre UTC es del día siguiente al cierre en Colombia', () => {
    // 24 de Mayo a las 02:00 UTC es 23 de Mayo a las 21:00 en Colombia
    const order = {
      status: OrderStatus.CLOSED,
      endTime: '2024-05-24T02:00:00Z', 
      warrantyPeriod: 1 
    };
    
    // Hoy es 23 de Mayo en Bogota (mockeado a las 12:00 UTC)
    const info = getWarrantyInfo(order);
    // 23 Mayo + 1 dia = 24 Mayo. Respecto a Hoy (23), vence mañana.
    expect(info?.text).toBe('Vence Mañana');
  });

  it('debe ser consistente con "Hoy" si el tiempo actual es tarde en la noche UTC', () => {
    // Si en UTC ya es 24 de Mayo (ej: 01:00 AM) pero en Colombia aún es 23 de Mayo (08:00 PM)
    vi.setSystemTime(new Date('2024-05-24T01:00:00Z'));
    
    const order = {
      status: OrderStatus.CLOSED,
      warrantyExpiration: '2024-05-23'
    };
    
    const info = getWarrantyInfo(order);
    // En Colombia aún es 23, por lo que vence hoy.
    expect(info?.text).toBe('Vence Hoy');
  });
});
