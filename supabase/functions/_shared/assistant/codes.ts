// Códigos de un solo uso para verificar el correo del cliente.
// Se guardan con hash SHA-256 y sal (nunca en claro) y vencen en minutos.
// Web Crypto: existe en Deno y en Node 20 (Vitest).

export function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashCode = (code: string, email: string, salt: string) => sha256Hex(`${salt}:${email}:${code}`);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;

/** Comparación de longitud fija para no filtrar información por tiempo. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
