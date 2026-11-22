import { describe, it, expect } from 'vitest';
import { auditActionLabel, auditDetailText, deleteConfirmationMatches } from './adminAudit';

describe('auditActionLabel', () => {
  it('traduce las acciones conocidas y deja las demás tal cual', () => {
    expect(auditActionLabel('company_suspended')).toBe('Empresa suspendida');
    expect(auditActionLabel('otra_cosa')).toBe('otra_cosa');
  });
});

describe('auditDetailText', () => {
  it('suspensión con y sin motivo', () => {
    expect(auditDetailText('company_suspended', { reason: 'Falta de pago' })).toBe('Motivo: Falta de pago');
    expect(auditDetailText('company_suspended', {})).toBe('Sin motivo indicado');
  });

  it('alta con slug y admin', () => {
    expect(auditDetailText('company_created', { slug: 'acme', admin_username: 'acme_admin' })).toBe('slug acme · admin acme_admin');
    expect(auditDetailText('company_created', null)).toBe('');
  });

  it('borrado con singular y plural', () => {
    expect(auditDetailText('company_deleted', { users: 1, files: 3 })).toBe('1 usuario · 3 archivos');
  });

  it('limpieza: lo hecho y lo pendiente', () => {
    expect(auditDetailText('company_delete_cleanup', { users_deleted: 2, files_deleted: 0, failed_files: [], failed_users: [] }))
      .toBe('2 cuentas borradas · 0 archivos borrados');
    expect(auditDetailText('company_delete_cleanup', { users_deleted: 1, files_deleted: 4, failed_files: ['a', 'b'], failed_users: [] }))
      .toBe('1 cuenta borrada · 4 archivos borrados · pendiente a mano: 2 archivos');
  });

  it('vista previa', () => {
    expect(auditDetailText('preview_started', { role: 'admin' })).toBe('Como admin');
  });
});

describe('deleteConfirmationMatches', () => {
  it('exige el nombre exacto, sin contar espacios de los extremos', () => {
    expect(deleteConfirmationMatches(' Plásticos del Sur ', 'Plásticos del Sur')).toBe(true);
    expect(deleteConfirmationMatches('plásticos del sur', 'Plásticos del Sur')).toBe(false);
    expect(deleteConfirmationMatches('', '')).toBe(false);
  });
});
