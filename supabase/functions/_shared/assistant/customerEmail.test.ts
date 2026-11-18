import { describe, expect, it } from 'vitest';
import { buildCustomerNotice, formatServiceDate, formatServiceTime, pickCustomerEmail } from './customerEmail';
import { isValidEmail } from './codes';

const confirmed = {
  status: 'confirmada' as const,
  companyName: 'Plásticos del Sur',
  primaryColor: '#16A34A',
  logoUrl: 'https://cdn.example.com/logo.png',
  contactName: 'Ana Gómez',
  serviceName: 'Mantenimiento preventivo',
  orderType: 'Preventivo',
  reference: '56c8b94e',
  date: '2026-11-19',
  time: '08:00:00',
  durationMinutes: 90,
  technicianName: 'Carlos Ruiz',
  orderNumber: 47,
  chatUrl: 'https://navtickets.vercel.app/#/asistente/plasticos-del-sur',
};

describe('buildCustomerNotice — confirmada', () => {
  const n = buildCustomerNotice(confirmed);

  it('el asunto lleva empresa, fecha y hora', () => {
    expect(n.subject).toBe('Servicio agendado con Plásticos del Sur: jueves, 19 de noviembre de 2026, 08:00');
  });

  it('incluye los datos de la cita en HTML y en texto', () => {
    for (const s of ['Mantenimiento preventivo', 'jueves, 19 de noviembre de 2026', '08:00', '1 h 30 min', 'Carlos Ruiz', '#47', '56c8b94e']) {
      expect(n.html).toContain(s);
      expect(n.text).toContain(s);
    }
    expect(n.html).toContain('background:#16A34A');
    expect(n.html).toContain('src="https://cdn.example.com/logo.png"');
    expect(n.html).toContain('href="https://navtickets.vercel.app/#/asistente/plasticos-del-sur"');
    expect(n.text.startsWith('Hola, Ana Gómez:')).toBe(true);
  });

  it('sin fecha usa un asunto genérico y omite las filas vacías', () => {
    const m = buildCustomerNotice({ ...confirmed, date: null, time: 'nada', technicianName: null, orderNumber: null, durationMinutes: null });
    expect(m.subject).toBe('Tu solicitud de servicio a Plásticos del Sur está confirmada');
    expect(m.text).not.toContain('Fecha:');
    expect(m.text).not.toContain('Técnico:');
    expect(m.text).not.toContain('Orden:');
  });
});

describe('buildCustomerNotice — rechazada', () => {
  it('incluye el motivo y no la cita', () => {
    const n = buildCustomerNotice({ ...confirmed, status: 'rechazada', rejectionReason: 'No atendemos esa zona.' });
    expect(n.subject).toBe('Sobre tu solicitud de servicio a Plásticos del Sur');
    expect(n.text).toContain('Motivo: No atendemos esa zona.');
    expect(n.text).not.toContain('Carlos Ruiz');
    expect(n.text).not.toContain('Fecha:');
  });
});

describe('buildCustomerNotice — datos no confiables', () => {
  it('escapa el HTML de nombre, servicio y motivo', () => {
    const n = buildCustomerNotice({
      ...confirmed,
      status: 'rechazada',
      contactName: '<img src=x onerror=alert(1)>',
      serviceName: '"><script>alert(1)</script>',
      rejectionReason: '<b>no</b> & más',
    });
    expect(n.html).not.toContain('<script>');
    expect(n.html).not.toContain('<img src=x');
    expect(n.html).toContain('&lt;b&gt;no&lt;/b&gt; &amp; más');
  });

  it('el asunto no admite saltos de línea (inyección de cabeceras)', () => {
    const n = buildCustomerNotice({ ...confirmed, companyName: 'ACME\r\nBcc: victima@x.co' });
    expect(n.subject).not.toMatch(/[\r\n]/);
  });

  it('ignora colores, logos y enlaces que no son seguros', () => {
    const n = buildCustomerNotice({
      ...confirmed,
      primaryColor: 'red;background:url(x)',
      logoUrl: 'javascript:alert(1)',
      chatUrl: 'http://inseguro.example',
    });
    expect(n.html).toContain('background:#1f2937');
    expect(n.html).not.toContain('javascript:');
    expect(n.html).not.toContain('inseguro.example');
    expect(n.html).not.toContain('<img');
  });
});

describe('utilidades', () => {
  it('formatea fecha y hora', () => {
    expect(formatServiceDate('2026-12-25')).toBe('viernes, 25 de diciembre de 2026');
    expect(formatServiceDate('25/12/2026')).toBeNull();
    expect(formatServiceTime('13:30:00')).toBe('13:30');
    expect(formatServiceTime('25:00')).toBeNull();
  });

  it('elige el correo de la solicitud y, si falta, el del cliente', () => {
    expect(pickCustomerEmail(' Ana@Correo.CO ', 'otro@x.co', isValidEmail)).toBe('ana@correo.co');
    expect(pickCustomerEmail(null, 'cliente@x.co', isValidEmail)).toBe('cliente@x.co');
    expect(pickCustomerEmail('no-es-correo', null, isValidEmail)).toBeNull();
  });
});
