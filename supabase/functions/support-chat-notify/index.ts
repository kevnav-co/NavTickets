// Supabase Edge Function — Support Chat Notify.
// Push Web Push API a los super_admins cuando un usuario de EMPRESA escribe un
// mensaje en el chat de soporte (support_messages con role <> 'admin').
// Lo dispara el trigger `support_message_notify_staff` (migración 028) vía pg_net.

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

    const ticketId = record.ticket_id;
    const message = record.message;
    if (!ticketId || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "ticket_id y message requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("subject, company_id")
      .eq("id", ticketId)
      .single();

    if (!ticket?.company_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Ticket o empresa no encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: superAdmins, error: queryError } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", ticket.company_id)
      .eq("role", "super_admin");

    if (queryError) {
      console.error("[Support Chat Notify] Error querying super_admins:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query super_admins" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const superAdminIds = (superAdmins || []).map((sa: { id: string }) => sa.id);
    if (superAdminIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, message: "No super_admins found" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const summary = message.slice(0, 200);

    const result = await sendPushToMany(
      superAdminIds,
      {
        title: "💬 Nuevo mensaje del chat de soporte",
        body: summary,
        data: { path: "/admin/support" },
      },
      "Support Chat Notify",
    );

    return new Response(
      JSON.stringify({ success: true, notified: result.sent, failed: result.failed, total: result.total }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[Support Chat Notify] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
