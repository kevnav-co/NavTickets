const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para interpolarlo de forma segura en HTML (contenido o atributo entre comillas). */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

/** Crea un elemento con clases y texto plano (nunca HTML). */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Devuelve la URL solo si usa un esquema permitido (por defecto https/mailto); si no, null. */
export const safeUrl = (raw: string, allowed: string[] = ['https:', 'mailto:']): string | null => {
  try {
    const url = new URL(raw.trim());
    return allowed.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
