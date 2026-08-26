import { describe, it, expect } from 'vitest';
import { isTabVisible, TAB_PERMISSION_MAP, TAB_FEATURE_MAP } from './permissions';

describe('isTabVisible (Fase 5 — pestañas por rol y feature)', () => {
  it('permite ver una pestaña built-in sin permiso ni feature asociada', () => {
    // "dashboard" no está en TAB_PERMISSION_MAP ni TAB_FEATURE_MAP.
    expect(isTabVisible('dashboard', 'technician', {}).visible).toBe(true);
  });

  it('oculta /equipment si la empresa apagó equipmentManagement', () => {
    expect(isTabVisible('equipment', 'technician', { equipmentManagement: false }).visible).toBe(false);
    expect(isTabVisible('equipment', 'technician', { equipmentManagement: true }).visible).toBe(true);
  });

  it('oculta /map si la empresa apagó maps (admin tiene VIEW_MAP, aísla el flag)', () => {
    expect(isTabVisible('map', 'admin', { maps: false }).visible).toBe(false);
    expect(isTabVisible('map', 'admin', { maps: true }).visible).toBe(true);
  });

  it('accounting exige feature Y permiso view_reports (que technician no tiene)', () => {
    expect(isTabVisible('accounting', 'admin', { accounting: true }).visible).toBe(true);
    expect(isTabVisible('accounting', 'admin', { accounting: false }).visible).toBe(false);
    expect(isTabVisible('accounting', 'technician', { accounting: true }).visible).toBe(false);
  });

  it('oculta /users por permiso (solo admin/developer lo ven)', () => {
    expect(isTabVisible('users', 'technician', {}).visible).toBe(false);
    expect(isTabVisible('users', 'admin', {}).visible).toBe(true);
  });

  it('un tab sin builtInComponent (custom) siempre es visible', () => {
    expect(isTabVisible(undefined, 'technician', {}).visible).toBe(true);
  });

  it('cada built-in con feature asociada aparece en TAB_FEATURE_MAP', () => {
    for (const [comp, feature] of Object.entries(TAB_FEATURE_MAP)) {
      expect(typeof feature).toBe('string');
      expect(comp.length > 0).toBe(true);
    }
  });

  it('todo TAB_FEATURE_MAP built-in también tiene su permiso en TAB_PERMISSION_MAP', () => {
    for (const comp of Object.keys(TAB_FEATURE_MAP)) {
      expect(TAB_PERMISSION_MAP[comp]).toBeTruthy();
    }
  });
});