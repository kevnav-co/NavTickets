// Supabase Edge Function — Solicitar reseteo de contraseña (olvidé mi clave).
// Deploy: `supabase functions deploy request-password-reset`.
//
// Flujo "olvidé mi contraseña" (usuario NO autenticado):
//   POST { username }  →  si el usuario tiene `users.email`, se genera un token
//   de un solo uso (30 min), se guarda HÁSHED en `password_reset_tokens` y se
//   manda un link a su correo real. El link abre la PWA en /#/reset-password?token=…
//
// PÚBLICO: verify_jwt=false (config.toml). No hay credenciales que validar y el
// endpoint NO revela si el username existe: siempre devuelve {ok:true} (evita
// enumerar usuarios). La lógica de validación del token vive en
// `reset-password-with-token` (edge hermano).
//
// Los edges usan service_role (bypasa RLS) porque `users.email` y
// `password_reset_tokens` no son consultables por el cliente anónimo.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendRecoveryEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Vida del token en minutos.
const TOKEN_TTL_MINUTES = 30;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// SHA-256 hex del token (nunca guardamos el token en claro en la BD).
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const username = (body.username ?? "").trim();
  // Público y anti-enumeración: respuesta genérica aunque falte el username.
  if (!username) return json({ ok: true });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── Buscar al usuario por username (global único desde migración 019) ─────
  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, email, name")
    .ilike("username", username);

  if (uErr) {
    console.error("[RequestReset] Error buscando usuario:", uErr.message);
    return json({ ok: true }); // no revelar nada
  }
  const user = users && users.length > 0 ? users[0] : null;
  const userEmail = (user?.email || "").trim();
  if (!user || !userEmail) {
    // No existe o no tiene correo de recuperación → no enviar, misma respuesta.
    return json({ ok: true });
  }

  // ─── Token de un solo uso + invalidar tokens previos del usuario ────────────
  const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

  // Tomar el que ya esté usado/vencido y reusarlo es complejo; simplemente
  // invalidamos los anteriores e insertamos el nuevo (una fila por reset).
  await supabase
    .from("password_reset_tokens")
    .update({ used: true })
    .eq("user_id", user.id)
    .eq("used", false);

  const { error: insErr } = await supabase.from("password_reset_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
  });
  if (insErr) {
    console.error("[RequestReset] Error guardando token:", insErr.message);
    return json({ error: "No se pudo generar el reseteo. Inténtalo de nuevo." }, 500);
  }

  // ─── Origen del link: env APP_ORIGIN, o el Origin/Referer del navegador ─────
  const base = Deno.env.get("APP_ORIGIN")
    || req.headers.get("Origin")
    || req.headers.get("Referer")
    || "";
  const origin = base.replace(/\/+$/, "").replace(/\/$/, "").split(/[?#]/)[0];
  const resetLink = origin
    ? `${origin}/#/reset-password?token=${rawToken}`
    : `(URL no configurada — token en logs): ${rawToken}`;

  const sent = await sendRecoveryEmail(userEmail, user.username || user.name || "usuario", resetLink);

  console.log(
    `[RequestReset] Reset solicitado para "${user.username}" → ${user.email} (email ${sent.ok ? "ok" : "falló"}, stub=${sent.stub})`,
  );
  return json({ ok: true });
});