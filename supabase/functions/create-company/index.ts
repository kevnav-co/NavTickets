// Supabase Edge Function — Create Company (bootstrap multi-tenant).
// Deploy: `supabase functions deploy create-company`.
//
// Crea una empresa completa (tenant) con su primer usuario administrador, en
// un solo flujo, usando la service-role key (bypasa RLS):
//   1. INSERT companies(name)                 → companyId
//   2. auth.admin.createUser({...})           → authUid  (perfil Supabase Auth)
//   3. INSERT users(company_id, ..., supabase_auth_id) → userId
//
// Autorización: solo un `super_admin` autenticado puede crear empresas. El
// access_token de sesión llega en `Authorization: Bearer <token>`; se valida la
// fila `users` por `supabase_auth_id` (NO por `id`, que es el PK de negocio).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Convención de login de la app (AuthContext): username@<EMAIL_DOMAIN>.
// Configurable por env (edge secret EMAIL_DOMAIN); fallback histórico "navas.com".
const EMAIL_DOMAIN = Deno.env.get("EMAIL_DOMAIN") ?? "navas.com";

interface BootstrapPayload {
  companyName?: string;
  username?: string;
  password?: string;
  displayName?: string;
  role?: string;
  slug?: string;
}

// Mismo formato que valida el chat público del asistente (/#/asistente/<slug>).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ─── Autorización: token de sesión → super_admin ─────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  const admin = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user?.user) {
    return json({ error: "Credenciales inválidas" }, 401);
  }

  // Validar que el llamante es super_admin (por supabase_auth_id).
  const { data: caller, error: callerErr } = await admin
    .from("users")
    .select("id, role")
    .eq("supabase_auth_id", user.user.id)
    .single();
  if (callerErr || caller?.role !== "super_admin") {
    return json({ error: "Se requiere rol super_admin" }, 403);
  }

  // ─── Payload + validaciones ───────────────────────────────────────────────
  let body: BootstrapPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const companyName = body.companyName?.trim();
  const username = body.username?.trim();
  const password = body.password ?? "";

  if (!companyName) return json({ error: "Falta companyName" }, 400);
  if (!username) return json({ error: "Falta username" }, 400);
  if (password.length < 6) {
    return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }

  const slug = body.slug?.trim().toLowerCase() || null;
  if (slug && !SLUG_RE.test(slug)) {
    return json({ error: "El slug solo admite minúsculas, números y guiones" }, 400);
  }

  const displayName = body.displayName?.trim() || "Administrador";
  const role = body.role?.trim() || "admin";
  const email = `${username}@${EMAIL_DOMAIN}`;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let companyId: string | null = null;
  let authUid: string | null = null;

  try {
    // ─── Paso 1: empresa ──────────────────────────────────────────────────────
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .insert({ name: companyName, slug })
      .select("id")
      .single();
    if (companyErr) throw companyErr;
    companyId = company.id;

    // ─── Paso 2: perfil de Supabase Auth ──────────────────────────────────────
    const { data: createdUser, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    authUid = createdUser.user.id;

    // ─── Paso 3: fila de negocio en users, vinculada al tenant ───────────────
    const { data: userRow, error: userRowErr } = await supabase
      .from("users")
      .insert({
        company_id: companyId,
        name: displayName,
        role,
        username,
        supabase_auth_id: authUid,
      })
      .select("id")
      .single();
    if (userRowErr) throw userRowErr;

    const { error: logErr } = await supabase.rpc("admin_log_action", {
      p_actor_auth_id: user.user.id,
      p_action: "company_created",
      p_company: companyId,
      p_details: { slug, admin_username: username },
    });
    if (logErr) console.error("[CreateCompany] No se pudo registrar en auditoría:", logErr.message);

    return json({
      ok: true,
      companyId,
      authUid,
      userId: userRow.id,
      email,
    });
  } catch (err: any) {
    console.error("[CreateCompany] Error:", err);
    // Rollback best-effort por pasos.
    try {
      if (authUid) {
        await supabase.auth.admin.deleteUser(authUid);
      }
      if (companyId) {
        await supabase.from("companies").delete().eq("id", companyId);
      }
    } catch (rollbackErr) {
      console.error("[CreateCompany] Rollback error:", rollbackErr);
    }
    return json({ error: `No se pudo crear la empresa: ${err.message}` }, 500);
  }
}));
