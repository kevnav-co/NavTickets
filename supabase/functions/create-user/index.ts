// Supabase Edge Function — Crear usuario con cuenta de autenticación.
// Deploy: `supabase functions deploy create-user`.
//
// Crea un usuario dentro de una empresa con su perfil de Supabase Auth, para
// que SÍ pueda iniciar sesión (la app loguea contra auth.users:
// AuthContext → signInWithPassword({ email: username@navas.com, password })).
//
// Una fila en `users` sin `supabase_auth_id` NO es login-able. Este endpoint
// replica el patrón de `create-company`:
//   1. auth.admin.createUser({ email, password, email_confirm: true }) → authUid
//   2. INSERT INTO users(company_id, ..., supabase_auth_id)            → userId
//
// Autorización:
//   - super_admin → puede crear en CUALQUIER empresa y asignar cualquier rol.
//   - admin / developer → solo dentro de SU empresa (companyId = la suya) y
//     NO pueden asignar roles super_admin ni developer (anti escalada).
// El access_token de sesión llega en `Authorization: Bearer <token>`; la fila
// `users` se valida por `supabase_auth_id` (NO por `id`, que es el PK negocio).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Convención de login de la app (AuthContext): username@navas.com
const EMAIL_DOMAIN = "navas.com";
// Roles que pueden crear usuarios (tienen CREAR_USER en src/permissions.ts).
const CREATOR_ROLES = ["super_admin", "admin", "developer"];

interface CreateUserPayload {
  companyId?: string;
  name?: string;
  username?: string;
  password?: string;
  role?: string;
  identification?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string;
  signature?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ─── Autorización: token de sesión → quién crea ──────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  const callerClient = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessUser, error: sessErr } = await callerClient.auth.getUser(token);
  if (sessErr || !sessUser?.user) {
    return json({ error: "Credenciales inválidas" }, 401);
  }

  // Fila del llamante por supabase_auth_id.
  const { data: caller, error: callerErr } = await callerClient
    .from("users")
    .select("id, role, company_id")
    .eq("supabase_auth_id", sessUser.user.id)
    .single();
  if (callerErr || !caller) return json({ error: "Sin permiso" }, 403);
  if (!CREATOR_ROLES.includes(caller.role)) {
    return json({ error: "Se requiere rol admin o super_admin" }, 403);
  }

  // ─── Payload + validaciones ───────────────────────────────────────────────
  let body: CreateUserPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const companyId = body.companyId?.trim();
  const name = body.name?.trim();
  const username = body.username?.trim();
  const password = body.password ?? "";
  const role = body.role?.trim() || "technician";

  if (!companyId) return json({ error: "Falta companyId" }, 400);
  if (!name) return json({ error: "Falta name" }, 400);
  if (!username) return json({ error: "Falta username" }, 400);
  if (password.length < 6) {
    return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }

  // Aislamiento: un admin/developer solo puede crear en SU empresa.
  if (caller.role !== "super_admin" && caller.company_id !== companyId) {
    return json({ error: "No puedes crear usuarios para otra empresa" }, 403);
  }
  // Anti escalada: solo super_admin puede asignar super_admin / developer.
  if (caller.role !== "super_admin" && (role === "super_admin" || role === "developer")) {
    return json({ error: "No puedes asignar ese rol" }, 403);
  }

  const email = `${username}@${EMAIL_DOMAIN}`;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let authUid: string | null = null;

  try {
    // ─── Paso 1: perfil de Supabase Auth ───────────────────────────────────
    const { data: createdUser, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    authUid = createdUser.id;

    // ─── Paso 2: fila de negocio en users, vinculada al tenant ─────────────
    // La tabla `users` NO tiene columna email (el email vive en auth.users).
    // OJO: el INSERT puede no persistir supabase_auth_id (hay algo en la BD que
    // lo deja NULL en el INSERT). Por eso creamos la fila SIN esa columna y la
    // vinculamos con un UPDATE explícito (probado: el UPDATE SÍ lo persiste).
    const row: Record<string, unknown> = {
      company_id: companyId,
      name,
      role,
      username,
    };
    if (body.identification) row.identification = body.identification;
    if (body.address) row.address = body.address;
    if (typeof body.latitude === "number") row.latitude = body.latitude;
    if (typeof body.longitude === "number") row.longitude = body.longitude;
    if (body.locationUpdatedAt) row.location_updated_at = body.locationUpdatedAt;
    if (body.signature) row.signature = body.signature;

    const { data: userRow, error: userRowErr } = await supabase
      .from("users")
      .insert(row)
      .select("id")
      .single();
    if (userRowErr) throw userRowErr;

    // Vincular la cuenta Auth por supabase_auth_id (UPDATE, no el INSERT).
    const { error: linkErr } = await supabase
      .from("users")
      .update({ supabase_auth_id: authUid })
      .eq("id", userRow.id);
    if (linkErr) {
      console.error("[CreateUser] Link supabase_auth_id error:", linkErr.message);
    }

    return json({ ok: true, userId: userRow.id, authUid, email });
  } catch (err: any) {
    console.error("[CreateUser] Error:", err);
    // Rollback best-effort: si el insert de users falló, borrar el auth user.
    try {
      if (authUid) {
        await supabase.auth.admin.deleteUser(authUid);
      }
    } catch (rollbackErr) {
      console.error("[CreateUser] Rollback error:", rollbackErr);
    }
    return json({ error: `No se pudo crear el usuario: ${err.message}` }, 500);
  }
});