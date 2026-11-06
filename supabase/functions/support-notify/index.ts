// Supabase Edge Function — Support Notify (Web Push API).
// Replaces OneSignal. A Postgres trigger on `support_tickets` INSERT (migration 011)
// calls this function via pg_net. It reads the newly inserted ticket and sends a
// Web Push notification to all super_admins via send-push.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(SUPABASE_URL, serviceRole);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

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

    // Enviar push a todos los super_admins de esta empresa via send-push
    const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        companyId,
        title: "🛟 Nueva consulta de soporte",
        body: subject,
        data: { path: "/admin/support" },
      }),
    });

    if (!pushResp.ok) {
      const err = await pushResp.text();
      console.error("[Support Notify] send-push error:", err);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send push" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const pushResult = await pushResp.json();
    return new Response(
      JSON.stringify({ success: true, ...pushResult }),
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