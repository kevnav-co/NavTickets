// Supabase Edge Function — Support Chat Notify.
// Push Web Push API a los super_admins cuando un usuario de EMPRESA escribe un
// mensaje en el chat de soporte (support_messages con role <> 'admin'). Es la
// direccion inversa a support-reply-notify (027), que avisa al AUTOR cuando el
// super_admin responde. Juntos cubren ambos lados del hilo de soporte.
//
// Lo dispara el trigger `support_message_notify_staff` (migración 028) vía
// pg_net cuando se inserta una fila con role='empresa' (o cualquier no-admin).
// Igual que support-notify (011): push solo, sin fila en `notifications` (para no
// inflar la bandeja del super_admin con cada mensaje del hilo).
//
// Sin JWT de sesión (verify_jwt=false, la llama pg_net). Acceso de control:
// cabecera x-webhook-secret (obligatoria: ver _shared/webhook-auth.ts).

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
    const record = body.record ?? body;

    const ticketId = record.ticket_id;
    const message = record.message;
    if (!ticketId || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "ticket_id y message requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Obtener ticket y empresa
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

    // Obtener super_admins de la empresa
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

    const superAdminIds = (superAdmins || []).map((sa) => sa.id);
    if (superAdminIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, message: "No super_admins found" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Enviar push a cada super_admin
    let sent = 0;
    let failed = 0;
    const summary = message.slice(0, 200);

    for (const userId of superAdminIds) {
      const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          "x-webhook-secret": Deno.env.get("WEBHOOK_SECRET") || "",
        },
        body: JSON.stringify({
          userId,
          title: "💬 Nuevo mensaje del chat de soporte",
          body: summary,
          data: { path: "/admin/support" },
        }),
      });

      if (pushResp.ok) {
        sent++;
      } else {
        console.error(`[Support Chat Notify] Failed to send push to ${userId}:`, await pushResp.text());
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: sent, failed, total: superAdminIds.length }),
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