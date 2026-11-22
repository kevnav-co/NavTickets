// Supabase Edge Function — Borrar una empresa por completo (solo super_admin).
// Deploy: `supabase functions deploy delete-company`.
//
// body { companyId, confirmName }
//
// Un DELETE de `companies` borra en cascada las filas, pero deja huérfanas las
// cuentas de Supabase Auth de sus usuarios y los archivos de Storage. Esta
// función hace el borrado completo con la service role:
//   1. Comprueba que quien llama es super_admin real (por su fila en `users`) y
//      que `confirmName` coincide con el nombre de la empresa.
//   2. `admin_company_purge_plan` (migración 054): cuentas de Auth y archivos de
//      la empresa (carpeta `{company_id}/…`, logos y rutas antiguas de sus
//      órdenes y equipos). Se calcula antes de borrar las filas, porque las rutas
//      antiguas se reconocen por la orden o el equipo.
//   3. `admin_delete_company_rows`: borra las filas y deja el registro
//      `company_deleted` en `admin_audit_log`.
//   4. Borra los archivos y las cuentas de Auth, y deja un registro
//      `company_delete_cleanup` con lo que no se pudo borrar (si algo falla, la
//      empresa ya no existe y el registro dice qué limpiar a mano).
// Nunca borra una empresa que tenga un super_admin.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_BATCH = 100;

interface PurgePlan {
  company_name: string;
  has_super_admin: boolean;
  auth_ids: string[];
  objects: { bucket: string; name: string }[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sess, error: sessErr } = await admin.auth.getUser(token);
  if (sessErr || !sess?.user) return json({ error: "Sesión inválida o expirada" }, 401);
  const callerAuthId = sess.user.id;

  const { data: caller } = await admin
    .from("users")
    .select("role, company_id")
    .eq("supabase_auth_id", callerAuthId)
    .maybeSingle();
  if (caller?.role !== "super_admin") return json({ error: "Se requiere rol super_admin" }, 403);

  let body: { companyId?: unknown; confirmName?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  if (!UUID_RE.test(companyId)) return json({ error: "companyId no válido" }, 400);
  if (companyId === caller.company_id) return json({ error: "No puedes borrar tu propia empresa" }, 400);

  const { data: planData, error: planErr } = await admin.rpc("admin_company_purge_plan", { p_company: companyId });
  if (planErr) {
    console.error("[DeleteCompany] Plan:", planErr.message);
    return json({ error: "No se pudo preparar el borrado" }, 500);
  }
  const plan = planData as PurgePlan | null;
  if (!plan) return json({ error: "La empresa no existe" }, 404);
  if (plan.has_super_admin) return json({ error: "No se puede borrar una empresa con un super_admin" }, 400);
  if (confirmName !== plan.company_name.trim()) {
    return json({ error: "El nombre de confirmación no coincide con el de la empresa" }, 400);
  }

  const { error: delErr } = await admin.rpc("admin_delete_company_rows", {
    p_company: companyId,
    p_actor: callerAuthId,
    p_details: { users: plan.auth_ids.length, files: plan.objects.length },
  });
  if (delErr) {
    console.error("[DeleteCompany] Filas:", delErr.message);
    return json({ error: `No se pudo borrar la empresa: ${delErr.message}` }, 500);
  }

  // ─── Limpieza fuera de la base ──────────────────────────────────────────────
  const failedFiles: string[] = [];
  const byBucket = new Map<string, string[]>();
  for (const o of plan.objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += STORAGE_BATCH) {
      const batch = names.slice(i, i + STORAGE_BATCH);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) {
        console.error(`[DeleteCompany] Storage ${bucket}:`, error.message);
        failedFiles.push(...batch.map((n) => `${bucket}/${n}`));
      }
    }
  }

  const failedUsers: string[] = [];
  for (const authId of plan.auth_ids) {
    if (authId === callerAuthId) continue;
    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error && !/not.?found/i.test(error.message)) {
      console.error("[DeleteCompany] Auth:", authId, error.message);
      failedUsers.push(authId);
    }
  }

  await admin.rpc("admin_log_action", {
    p_actor_auth_id: callerAuthId,
    p_action: "company_delete_cleanup",
    p_company: companyId,
    p_details: {
      company_name: plan.company_name,
      files_deleted: plan.objects.length - failedFiles.length,
      users_deleted: plan.auth_ids.length - failedUsers.length,
      failed_files: failedFiles.slice(0, 50),
      failed_users: failedUsers,
    },
  });

  return json({
    ok: true,
    filesDeleted: plan.objects.length - failedFiles.length,
    usersDeleted: plan.auth_ids.length - failedUsers.length,
    failedFiles: failedFiles.length,
    failedUsers: failedUsers.length,
  });
}));
