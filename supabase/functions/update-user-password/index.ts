// Supabase Edge Function — Cambiar / resetear contraseña (Supabase Auth real).
// Deploy: `supabase functions deploy update-user-password`.
//
// Ambos flujos de la app usan esta función:
//
//   A) SELF-SERVICE (ChangePasswordModal / ForcePasswordChange):
//        body { newPassword, currentPassword? }
//      El destino se deriva del `Authorization: Bearer <access_token>` del
//      llamante (NUNCA del body). Si se envía currentPassword se re-autentica
//      para probar que conoce la actual. Máx. 6 intentos en 15 min (Auth).
//      Tras éxito: must_reset_password=false.
//
//   B) ADMIN RESET (UserForm, editar usuario con nueva clave):
//        body { userId: <id fila users destino>, newPassword }
//      Solo super_admin/admin/developer. Se valida aislamiento por tenant y que
//      no se resetee a un super_admin salvo super_admin. Tras éxito:
//      must_reset_password=true → el usuario cambia su clave en el próximo login.
//
// Autorización: el `users` se valida por `supabase_auth_id` (nunca por `id`).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_DOMAIN = Deno.env.get("EMAIL_DOMAIN") ?? "navas.com";
const MANAGER_ROLES = ["super_admin", "admin", "developer"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  // ─── Identidad del llamante por el access_token de sesión real ────────────
  const caller = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sess, error: sessErr } = await caller.auth.getUser(token);
  if (sessErr || !sess?.user) return json({ error: "Sesión inválida o expirada" }, 401);

  const callerUid = sess.user.id;
  const callerEmail = sess.user.email;

  const { data: callerRow, error: callerErr } = await caller
    .from("users")
    .select("id, role, company_id, username")
    .eq("supabase_auth_id", callerUid)
    .single();
  if (callerErr || !callerRow) return json({ error: "Sin perfil de app para la sesión" }, 403);

  // ─── Payload ───────────────────────────────────────────────────────────────
  let body: { userId?: string; newPassword?: string; currentPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }
  const newPassword = body.newPassword ?? "";
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── Determinar destino: reset-de-admin vs self-service ────────────────────
  let targetAuthUid: string;
  let targetRowId: string;
  let isAdminReset: boolean;

  if (body.userId && body.userId !== callerRow.id) {
    // ── B) ADMIN RESET ──────────────────────────────────────────────────────
    if (!MANAGER_ROLES.includes(callerRow.role)) {
      return json({ error: "Se requiere rol de administrador (admin)" }, 403);
    }

    const { data: targetRow, error: tErr } = await caller
      .from("users")
      .select("id, role, company_id, supabase_auth_id")
      .eq("id", body.userId)
      .single();
    if (tErr || !targetRow) return json({ error: "Usuario destino no encontrado" }, 404);
    if (!targetRow.supabase_auth_id) {
      return json({ error: "El usuario destino no tiene cuenta Auth vinculada (supabase_auth_id)" }, 409);
    }

    // Aislamiento por tenant.
    if (callerRow.role !== "super_admin" && targetRow.company_id !== callerRow.company_id) {
      return json({ error: "No puedes resetear contraseñas de otra empresa" }, 403);
    }
    // Anti escalada: solo super_admin resetea a otro super_admin.
    if (callerRow.role !== "super_admin" && targetRow.role === "super_admin") {
      return json({ error: "No puedes resetear a un super_admin" }, 403);
    }

    targetAuthUid = targetRow.supabase_auth_id;
    targetRowId = targetRow.id;
    isAdminReset = true;

    // El admin genera una clave temporal y fuerza el cambio en el próximo login.
  } else {
    // ── A) SELF-SERVICE ─────────────────────────────────────────────────────
    targetAuthUid = callerUid;
    targetRowId = callerRow.id;
    isAdminReset = false;

    // Verificar la contraseña actual SI se envía (cambio voluntario). Para el
    // reseteo forzado (must_reset_password) no se envía: el token de sesión ya
    // prueba identidad.
    const currentPassword = body.currentPassword ?? "";
    if (currentPassword.trim() !== "") {
      const email = callerEmail ?? `${callerRow.username}@${EMAIL_DOMAIN}`;
      const { error: reAuthErr } = await caller.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reAuthErr) {
        return json({ error: "La contraseña actual es incorrecta" }, 403);
      }
    }
  }

  // ─── Aplicar el cambio en Supabase Auth ────────────────────────────────────
  const { error: updErr } = await admin.auth.admin.updateUserById(targetAuthUid, {
    password: newPassword,
  });
  if (updErr) {
    console.error("[UpdatePassword] Auth update error:", updErr.message);
    return json({ error: `No se pudo actualizar la contraseña: ${updErr.message}` }, 500);
  }

  // Registrar estado de reset en la fila `users`.
  await admin
    .from("users")
    .update({ must_reset_password: isAdminReset })
    .eq("id", targetRowId);

  return json({ ok: true, forcedReset: isAdminReset });
});