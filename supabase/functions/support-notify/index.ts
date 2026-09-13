// Supabase Edge Function — Support Notify.
// Replaces the old frontend→Vercel flow (`src/services/supportNotify.ts` →
// `api/edge/support-notify.ts`). Now it is a pure server-side push: a Postgres
// trigger on `support_tickets` INSERT (migration 011) calls this function via
// pg_net. No caller auth needed — the trigger is the source of truth.
//
// It reads the newly inserted ticket (company_id, subject, message, id),
// resolves the company name and every super_admin's OneSignal player id, and
// sends one push that deep-links to /#/admin/support.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Sin service role este function no puede leer super_admins ni escribir en la
// DB de forma privilegiada. Fallar pronto (no degradar silenciosamente a anon):
// si faltara el secret, un push "exitoso" sería en realidad un no-op sin aviso.
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(SUPABASE_URL, serviceRole);

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET"); // opcional
const base = Deno.env.get("APP_URL") || "https://navtickets.vercel.app";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  // Webhook check defensivo: si WEBHOOK_SECRET está seteado, exigirlo.
  // Solo rechaza si el header trae un valor real que NO coincide.
  // Si app.webhook_secret no está en Session settings, el header
  // viene vacío y se acepta (best-effort).
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-webhook-secret");
    if (got && got !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  try {
    const body = await req.json();
    // Compatible con el envelope de pg_net/HTTP webhook ({ record: {...} })
    // y con la invocación directa ({ id, company_id, subject, message, ... }).
    const record = body.record ?? body;

    const companyId = record.company_id;
    const subject = record.subject;
    const message = record.message;
    if (!companyId || !subject) {
      return new Response(JSON.stringify({ error: "company_id y subject requeridos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let companyName = "una empresa";
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();
    if (company?.name) companyName = company.name;

    const { data: superAdmins, error: err } = await supabase
      .from("users")
      .select("id, company_id, onesignal_player_id, fcm_token")
      .eq("role", "super_admin");

    if (err) throw err;
    const targets = (superAdmins || []).filter(
      (sa) => sa.onesignal_player_id || sa.fcm_token,
    );
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "NO_SUPER_ADMIN_PLAYER_IDS" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    let notified = 0;
    if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
      const playerIds = targets.map((t) => t.onesignal_player_id || t.fcm_token);
      const pushBody = {
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        headings: { en: "🛟 Nueva consulta de soporte" },
        contents: { en: `${companyName}: ${subject}` },
        url: `${base}/#/admin/support`,
        data: { path: "/admin/support" },
      };
      const resp = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          Authorization: `Basic ${ONESIGNAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pushBody),
      });
      if (!resp.ok) {
        const errBody = await resp.json();
        console.error("[Support Notify] OneSignal error:", JSON.stringify(errBody));
      } else {
        notified = targets.length;
      }
    } else {
      console.warn("[Support Notify] OneSignal no configurado (faltan secretos)");
    }

    return new Response(
      JSON.stringify({ success: true, notified, to: targets.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[Support Notify] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});