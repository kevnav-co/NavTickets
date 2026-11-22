// Textos del registro de auditoría del super_admin (tabla admin_audit_log, migración 054).

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  company_created: 'Empresa creada',
  company_suspended: 'Empresa suspendida',
  company_reactivated: 'Empresa reactivada',
  company_deleted: 'Empresa borrada',
  company_delete_cleanup: 'Limpieza tras el borrado',
  preview_started: 'Vista previa',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen en una línea de los detalles de una entrada; vacío si no hay nada que contar. */
export function auditDetailText(action: string, details: Record<string, unknown> | null | undefined): string {
  const d = details ?? {};
  switch (action) {
    case 'company_suspended':
      return str(d.reason) ? `Motivo: ${str(d.reason)}` : 'Sin motivo indicado';
    case 'company_created': {
      const parts = [str(d.slug) && `slug ${str(d.slug)}`, str(d.admin_username) && `admin ${str(d.admin_username)}`];
      return parts.filter(Boolean).join(' · ');
    }
    case 'company_deleted': {
      const users = num(d.users);
      const files = num(d.files);
      return [users !== null && plural(users, 'usuario', 'usuarios'), files !== null && plural(files, 'archivo', 'archivos')]
        .filter(Boolean)
        .join(' · ');
    }
    case 'company_delete_cleanup': {
      const failedFiles = Array.isArray(d.failed_files) ? d.failed_files.length : 0;
      const failedUsers = Array.isArray(d.failed_users) ? d.failed_users.length : 0;
      const done = [
        num(d.users_deleted) !== null && `${plural(num(d.users_deleted)!, 'cuenta borrada', 'cuentas borradas')}`,
        num(d.files_deleted) !== null && `${plural(num(d.files_deleted)!, 'archivo borrado', 'archivos borrados')}`,
      ].filter(Boolean).join(' · ');
      const pending = failedFiles + failedUsers > 0
        ? ` · pendiente a mano: ${[failedUsers && plural(failedUsers, 'cuenta', 'cuentas'), failedFiles && plural(failedFiles, 'archivo', 'archivos')].filter(Boolean).join(' y ')}`
        : '';
      return done + pending;
    }
    case 'preview_started':
      return str(d.role) ? `Como ${str(d.role)}` : '';
    default:
      return '';
  }
}

/** ¿El texto de confirmación coincide con el nombre de la empresa? (mismo criterio que la Edge Function). */
export function deleteConfirmationMatches(typed: string, companyName: string): boolean {
  return typed.trim() !== '' && typed.trim() === companyName.trim();
}
