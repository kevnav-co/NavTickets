// Supabase Edge Function — Support Notify (Web Push API).
// A Postgres trigger on `support_tickets` INSERT (migration 011) calls this
// function via pg_net. It sends a Web Push notification to all super_admins
// of the ticket's company via the shared send-push helper.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";
import { sendPushToMany } from "../_shared/push.ts";

const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

  try {
    const body = await req.json();
    const record = body.record ?? body;

    const companyId = record.company_id;
    const subject = record.subject;
    if (!companyId || !subject) {
      return new Response(JSON.stringify({ error: "company_id y subject requeridos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: superAdmins, error: queryError } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", companyId)
      .eq("role", "super_admin");

    if (queryError) {
      console.error("[Support Notify] Error querying super_admins:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query super_admins" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const superAdminIds = (superAdmins || []).map((sa: { id: string }) => sa.id);

    const result = await sendPushToMany(
      superAdminIds,
      {
        title: "🛟 Nueva consulta de soporte",
        body: subject,
        data: { path: "/admin/support" },
      },
      "Support Notify",
    );

    return new Response(
      JSON.stringify({ success: true, ...result }),
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
