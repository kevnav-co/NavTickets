// src/config.ts
//
// Configuración de la app única. Espeja / .env.frontend.
// El dominio de login se resuelve como `{username}@{EMAIL_DOMAIN}`, configurable
// vía VITE_EMAIL_DOMAIN (admitiendo con o sin el "@"). Fallback histórico:
// "navas.com".

function normalizeDomain(value: string | undefined, fallback: string): string {
  const d = value?.trim().replace(/^@/, '');
  return (d && d.length > 0) ? d : fallback;
}

export const EMAIL_DOMAIN = normalizeDomain(
  import.meta.env.VITE_EMAIL_DOMAIN,
  'navas.com'
);