import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSISTANT_SETTINGS,
  assistantPublicUrl,
  serviceIdFromName,
  settingsFromRow,
  settingsToRow,
  summarizeWorkingHours,
  validateAssistantSettings,
  type AssistantSettingsForm,
} from './assistantSettings';

const base = (): AssistantSettingsForm => structuredClone(DEFAULT_ASSISTANT_SETTINGS);

describe('settingsFromRow', () => {
  it('sin fila devuelve una copia de los valores por defecto', () => {
    const s = settingsFromRow(null);
    expect(s).toEqual(DEFAULT_ASSISTANT_SETTINGS);
    s.serviceTypes.push({ id: 'x', name: 'X', orderType: 'Correctivo', durationMinutes: 60 });
    expect(DEFAULT_ASSISTANT_SETTINGS.serviceTypes).toHaveLength(2);
  });

  it('convierte una fila de PostgREST (snake_case) y ordena los días bloqueados', () => {
    const s = settingsFromRow({
      timezone: 'America/Lima',
      working_hours: { '1': [['07:00', '15:00']], '9': [['01:00', '02:00']] },
      service_types: [{ id: 'bomba', name: 'Bomba', orderType: 'Preventivo', durationMinutes: 90 }],
      blocked_dates: ['2026-12-25', '2026-12-08'],
      min_lead_hours: 4,
      slot_step_minutes: 60,
      max_days_ahead: 14,
      technician_ids: ['a'],
      welcome_message: 'Hola',
      retention_days: 90,
    });
    expect(s.timezone).toBe('America/Lima');
    expect(s.workingHours).toEqual({ '1': [['07:00', '15:00']] });
    expect(s.serviceTypes[0]).toEqual({ id: 'bomba', name: 'Bomba', orderType: 'Preventivo', durationMinutes: 90 });
    expect(s.blockedDates).toEqual(['2026-12-08', '2026-12-25']);
    expect(s.slotStepMinutes).toBe(60);
    expect(s.retentionDays).toBe(90);
  });

  it('acepta JSONB guardado como texto (filas antiguas)', () => {
    const s = settingsFromRow({ working_hours: '{"2":[["09:00","10:00"]]}', service_types: '[]' });
    expect(s.workingHours).toEqual({ '2': [['09:00', '10:00']] });
    expect(s.serviceTypes).toEqual([]);
  });

  it('un intervalo desconocido vuelve al valor por defecto', () => {
    expect(settingsFromRow({ slot_step_minutes: 45 }).slotStepMinutes).toBe(30);
  });
});

describe('settingsToRow', () => {
  it('quita días sin franjas, ordena franjas y deduplica fechas y técnicos', () => {
    const s = base();
    s.workingHours = { '1': [['13:00', '17:00'], ['08:00', '12:00']], '2': [] };
    s.blockedDates = ['2026-12-25', '2026-12-08', '2026-12-25'];
    s.technicianIds = ['t1', 't1', 't2'];
    s.welcomeMessage = '  Hola  ';
    const row = settingsToRow(s, 'c1', 'u1');
    expect(row.working_hours).toEqual({ '1': [['08:00', '12:00'], ['13:00', '17:00']] });
    expect(row.blocked_dates).toEqual(['2026-12-08', '2026-12-25']);
    expect(row.technician_ids).toEqual(['t1', 't2']);
    expect(row.welcome_message).toBe('Hola');
    expect(row.company_id).toBe('c1');
    expect(row.updated_by).toBe('u1');
  });
});

describe('serviceIdFromName', () => {
  it('quita tildes y signos', () => {
    expect(serviceIdFromName('Revisión de Bomba #2', [])).toBe('revision-de-bomba-2');
  });
  it('evita repetidos', () => {
    expect(serviceIdFromName('Reparación', ['reparacion', 'reparacion-2'])).toBe('reparacion-3');
  });
  it('usa "servicio" si el nombre no deja nada', () => {
    expect(serviceIdFromName('¡¿?!', [])).toBe('servicio');
  });
  it('cumple el patrón de la base', () => {
    const id = serviceIdFromName('x'.repeat(200), []);
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,59}$/);
  });
});

describe('validateAssistantSettings', () => {
  it('los valores por defecto son válidos', () => {
    expect(validateAssistantSettings(base())).toEqual({ errors: [], warnings: [] });
  });

  it('rechaza franjas invertidas, cruzadas o con horas no válidas', () => {
    const s = base();
    s.workingHours = {
      '1': [['12:00', '08:00']],
      '2': [['08:00', '12:00'], ['11:00', '14:00']],
      '3': [['8:00', '12:00']],
    };
    const { errors } = validateAssistantSettings(s);
    expect(errors.some(e => e.startsWith('Lunes'))).toBe(true);
    expect(errors.some(e => e.startsWith('Martes') && e.includes('cruzan'))).toBe(true);
    expect(errors.some(e => e.startsWith('Miércoles'))).toBe(true);
  });

  it('admite 24:00 como fin de franja', () => {
    const s = base();
    s.workingHours = { '1': [['20:00', '24:00']] };
    s.serviceTypes = [{ id: 'a', name: 'A', orderType: 'Correctivo', durationMinutes: 60 }];
    expect(validateAssistantSettings(s).errors).toEqual([]);
  });

  it('exige al menos un día y un servicio', () => {
    const s = base();
    s.workingHours = {};
    s.serviceTypes = [];
    const { errors } = validateAssistantSettings(s);
    expect(errors).toContain('Define al menos un día de atención: sin horario el asistente no ofrece citas.');
    expect(errors).toContain('Añade al menos un servicio.');
  });

  it('valida servicios: nombre, duración, ids y nombres repetidos', () => {
    const s = base();
    s.serviceTypes = [
      { id: 'a', name: 'Bomba', orderType: 'Correctivo', durationMinutes: 10 },
      { id: 'a', name: 'bomba', orderType: 'Correctivo', durationMinutes: 60 },
      { id: 'B!', name: '', orderType: 'Preventivo', durationMinutes: 60.5 },
    ];
    const { errors } = validateAssistantSettings(s);
    expect(errors.some(e => e.includes('entre 15 y 720'))).toBe(true);
    expect(errors.some(e => e.includes('identificador interno repetido'))).toBe(true);
    expect(errors.some(e => e.includes('mismo nombre'))).toBe(true);
    expect(errors.some(e => e.includes('identificador interno no válido'))).toBe(true);
    expect(errors.some(e => e.startsWith('Servicio 3: el nombre'))).toBe(true);
  });

  it('avisa si un servicio no cabe en ninguna franja', () => {
    const s = base();
    s.serviceTypes = [{ id: 'largo', name: 'Overhaul', orderType: 'Correctivo', durationMinutes: 480 }];
    const { errors, warnings } = validateAssistantSettings(s);
    expect(errors).toEqual([]);
    expect(warnings[0]).toContain('Overhaul');
  });

  it('valida números y textos con los límites de la base', () => {
    const s = base();
    s.minLeadHours = 721;
    s.maxDaysAhead = 0;
    s.retentionDays = 5;
    s.welcomeMessage = '   ';
    s.timezone = '';
    s.blockedDates = ['2026-13-45x'];
    const { errors } = validateAssistantSettings(s);
    expect(errors).toEqual(expect.arrayContaining([
      'La antelación mínima debe estar entre 0 y 720 horas.',
      'Los días hacia adelante deben estar entre 1 y 180.',
      'La retención debe estar entre 7 y 730 días.',
      'Escribe el mensaje de bienvenida.',
      'Indica la zona horaria.',
      'Fecha bloqueada no válida: 2026-13-45x.',
    ]));
  });

  it('avisa si la antelación deja sin huecos', () => {
    const s = base();
    s.minLeadHours = 72;
    s.maxDaysAhead = 2;
    expect(validateAssistantSettings(s).warnings).toContain(
      'La antelación mínima cubre todos los días hacia adelante: el asistente no ofrecerá huecos.',
    );
  });
});

describe('assistantPublicUrl', () => {
  it('arma el enlace del chat', () => {
    expect(assistantPublicUrl('https://navtickets.vercel.app/', 'plasticos-del-sur'))
      .toBe('https://navtickets.vercel.app/#/asistente/plasticos-del-sur');
  });
  it('rechaza slugs que la ruta pública no acepta', () => {
    expect(assistantPublicUrl('https://x.app', 'Mi Empresa')).toBeNull();
    expect(assistantPublicUrl('https://x.app', null)).toBeNull();
  });
});

describe('summarizeWorkingHours', () => {
  it('agrupa días consecutivos iguales', () => {
    expect(summarizeWorkingHours(DEFAULT_ASSISTANT_SETTINGS.workingHours))
      .toBe('Lun–Vie 08:00–12:00, 13:00–17:00 · Sáb 08:00–12:00');
  });
  it('sin horario', () => {
    expect(summarizeWorkingHours({})).toBe('Sin horario de atención');
  });
});
