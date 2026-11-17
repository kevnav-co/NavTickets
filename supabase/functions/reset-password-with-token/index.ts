// Supabase Edge Function — Aplicar nueva contraseña desde un token de recuperación.
// Deploy: `supabase functions deploy reset-password-with-token`.
//
// Flujo "olvidé mi contraseña" (usuario NO autenticado), segunda mitad:
//   POST { token, newPassword }  →  valida el token (hash + vigencia + un solo
//   uso), marca usado y actualiza la clave en Supabase Auth vía
//   `auth.admin.updateUserById` (service_role, nunca anon key).
//
// PÚBLICO: verify_jwt=false. El token ES la credencial; por eso es de un solo
// uso, expira en 30 min y solo lo genera `request-password-reset` tras confirmar
// que el username tiene `users.email`.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { token?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const token = (body.token ?? "").trim();
  const newPassword = body.newPassword ?? "";
  if (!token) return json({ error: "Falta el token de recuperación" }, 400);
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);

  try {
    // ─── Buscar token válido: hash, no usado, sin expirar ────────────────────
    const { data: rows, error: selErr } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at")
      .eq("token_hash", tokenHash)
      .eq("used", false)
      .limit(1);
    if (selErr) throw selErr;

    const tRow = rows && rows.length > 0 ? rows[0] : null;
    if (!tRow) return json({ error: "Enlace inválido o ya utilizado" }, 400);
    if (new Date(tRow.expires_at).getTime() < Date.now()) {
      return json({ error: "El enlace ha expirado. Solicita un nuevo reseteo." }, 410);
    }

    // ─── Marcar usado (un solo uso) ANTES de aplicar, para no reusar ─────────
    const { error: usedErr } = await supabase
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("id", tRow.id);
    if (usedErr) throw usedErr;

    // ─── Resolver el auth user destino y aplicar la nueva clave ──────────────
    const { data: userRow, error: uErr } = await supabase
      .from("users")
      .select("supabase_auth_id, username")
      .eq("id", tRow.user_id)
      .single();
    if (uErr || !userRow?.supabase_auth_id) {
      return json({ error: "El usuario ya no está vinculado a una cuenta de acceso" }, 409);
    }

    const { error: updErr } = await supabase.auth.admin.updateUserById(
      userRow.supabase_auth_id,
      { password: newPassword },
    );
    if (updErr) {
      console.error("[ResetToken] Auth update error:", updErr.message);
      return json({ error: `No se pudo actualizar la contraseña: ${updErr.message}` }, 500);
    }

    // Quitar el "forzar cambio en el próximo login" si lo hubiera: este flujo ya
    // cambió la clave de forma voluntaria y autenticada.
    await supabase.from("users").update({ must_reset_password: false }).eq("id", tRow.user_id);

    console.log(`[ResetToken] Contraseña restablecida para "${userRow.username ?? tRow.user_id}"`);
    return json({ ok: true });
  } catch (err: any) {
    console.error("[ResetToken] Error:", err?.message ?? err);
    return json({ error: "No se pudo restablecer la contraseña. Inténtalo de nuevo." }, 500);
  }
});