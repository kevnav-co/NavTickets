import { describe, it, expect } from 'vitest';
import { buildReminderEmail, daysUntil, decideRecipient, formatReminderDate } from './reminderEmail';

const now = new Date('2026-11-25T13:00:00Z'); // 08:00 en Colombia

describe('fechas en hora de Colombia', () => {
  it('formatea en español', () => {
    expect(formatReminderDate(new Date('2026-12-15T12:00:00Z'))).toBe('15 de diciembre de 2026');
  });

  it('cuenta días de calendario de Colombia, no de UTC', () => {
    // 26/11 a las 02:00 UTC sigue siendo 25/11 en Colombia: es hoy.
    expect(daysUntil(new Date('2026-11-26T02:00:00Z'), now)).toBe(0);
    expect(daysUntil(new Date('2026-11-26T12:00:00Z'), now)).toBe(1);
    expect(daysUntil(new Date('2026-12-02T12:00:00Z'), now)).toBe(7);
    expect(daysUntil(new Date('2026-11-20T12:00:00Z'), now)).toBe(-5);
  });
});

describe('buildReminderEmail', () => {
  const base = {
    companyName: 'Plásticos del Sur',
    primaryColor: '#16a34a',
    clientName: 'ACME Plásticos',
    now,
  };

  it('mantenimiento con los datos del equipo', () => {
    const r = buildReminderEmail({
      ...base, kind: 'maintenance', itemName: 'Inyectora 180T', serialNumber: 'EN-123', location: 'Planta 2',
      dueDate: new Date('2026-12-02T12:00:00Z'), companyPhone: '+57 300 000 0000',
    });
    expect(r.subject).toBe('Mantenimiento de Inyectora 180T — Plásticos del Sur');
    expect(r.text).toContain('Hola, ACME Plásticos:');
    expect(r.text).toContain('le corresponde el 2 de diciembre de 2026 (en 7 días)');
    expect(r.text).toContain('Número de serie: EN-123');
    expect(r.text).toContain('Contacto: +57 300 000 0000');
    expect(r.html).toContain('background:#16a34a');
  });

  it('garantía con número de orden, hoy y vencida', () => {
    const hoy = buildReminderEmail({ ...base, kind: 'warranty', itemName: 'Reparación de extrusora', orderNumber: 42, dueDate: new Date('2026-11-25T20:00:00Z') });
    expect(hoy.subject).toBe('Garantía de la orden #42 — Plásticos del Sur');
    expect(hoy.text).toContain('vence hoy, 25 de noviembre de 2026');
    const vencida = buildReminderEmail({ ...base, kind: 'warranty', itemName: 'x', dueDate: new Date('2026-11-20T12:00:00Z') });
    expect(vencida.text).toContain('venció el 20 de noviembre de 2026');
  });

  it('escapa el HTML y limpia el asunto', () => {
    const r = buildReminderEmail({
      ...base, kind: 'maintenance', clientName: '<script>alert(1)</script>', itemName: 'Equipo\r\nBcc: x@y.com',
      dueDate: new Date('2026-12-02T12:00:00Z'), primaryColor: 'red;background:url(x)', logoUrl: 'javascript:alert(1)',
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.subject).not.toMatch(/[\r\n]/);
    expect(r.html).toContain('background:#1f2937');
    expect(r.html).not.toContain('javascript:');
  });

  it('solo usa logos https absolutos', () => {
    const rel = buildReminderEmail({ ...base, kind: 'maintenance', logoUrl: '/assets/logo.png', dueDate: now });
    expect(rel.html).not.toContain('<img');
    const ok = buildReminderEmail({ ...base, kind: 'maintenance', logoUrl: 'https://x.supabase.co/logo.png', dueDate: now });
    expect(ok.html).toContain('<img src="https://x.supabase.co/logo.png"');
  });

  it('sin nombres usa textos genéricos', () => {
    const r = buildReminderEmail({ kind: 'maintenance', companyName: '', dueDate: now, now });
    expect(r.text).toContain('Hola:');
    expect(r.text).toContain('su equipo');
    expect(r.subject).toContain('Su proveedor de servicio');
  });
});

describe('decideRecipient', () => {
  it('no envía si la empresa no lo activó', () => {
    expect(decideRecipient({ enabled: false, clientEmail: 'a@b.co' })).toEqual({ send: false, reason: 'disabled' });
  });

  it('exige un correo válido', () => {
    expect(decideRecipient({ enabled: true, clientEmail: '' })).toEqual({ send: false, reason: 'no_email' });
    expect(decideRecipient({ enabled: true, clientEmail: 'no-es-correo' })).toEqual({ send: false, reason: 'invalid_email' });
    expect(decideRecipient({ enabled: true, clientEmail: 'a@b.co, c@d.co' })).toEqual({ send: false, reason: 'invalid_email' });
  });

  it('envía al cliente o, en modo prueba, a la dirección de prueba', () => {
    expect(decideRecipient({ enabled: true, clientEmail: ' cliente@acme.co ' })).toEqual({ send: true, to: 'cliente@acme.co', redirectedFrom: null });
    expect(decideRecipient({ enabled: true, clientEmail: 'cliente@acme.co', override: 'prueba@x.com' }))
      .toEqual({ send: true, to: 'prueba@x.com', redirectedFrom: 'cliente@acme.co' });
  });
});
