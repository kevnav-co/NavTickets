// Supabase Edge Function — On Order Assigned
// Notifica al técnico cuando se le asigna o reasigna una orden de servicio.
// Disparado por el trigger `trg_order_assigned_webhook` (PostgreSQL) vía pg_net.
//
// 1) Inserta una fila en la tabla `notifications` (bandeja interna de la app).
// 2) Envía una notificación push en tiempo real vía send-push.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";
import { sendPush } from "../_shared/push.ts";

const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

  try {
    const body = await req.json();
    const eventType = body.type || "INSERT";
    const record = body.record ?? body;
    const oldRecord = body.old_record ?? null;

    if (!record) {
      return new Response(JSON.stringify({ error: "Cuerpo inválido: se requiere record" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const orderId = record.id;
    const technicianId = record.technician_id;
    const companyId = record.company_id;
    const orderNumber = record.order_number || record.orderNumber || "";
    const orderName = record.name || (orderNumber ? `Orden #${orderNumber}` : "Orden de servicio");
    const previousTechnicianId = oldRecord?.technician_id;

    if (!technicianId) {
      return new Response(
        JSON.stringify({ message: "Sin técnico asignado, no se notifica" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const isNewAssignment = eventType === "INSERT" || technicianId !== previousTechnicianId;

    if (!isNewAssignment) {
      return new Response(
        JSON.stringify({ message: "No hubo cambio en el técnico asignado" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const notifTitle = eventType === "INSERT" ? "Nueva orden asignada" : "Orden reasignada";
    const orderMsg = `Te han asignado la orden: ${orderName}`;
    const targetPath = `/orders/${orderId}`;

    const { error: notifError } = await supabase.from("notifications").insert({
      company_id: companyId,
      user_id: technicianId,
      title: notifTitle,
      body: orderMsg,
      text: orderMsg,
      type: "info",
      path: targetPath,
      read: false,
      created_at: new Date().toISOString(),
    });

    if (notifError) {
      console.error("[OnOrderAssigned] Error al insertar notificación interna:", notifError);
    }

    const pushSent = await sendPush({
      userId: technicianId,
      title: `📋 ${notifTitle}`,
      body: orderMsg,
      data: { path: targetPath },
    });

    if (!pushSent) {
      console.error("[OnOrderAssigned] Error send-push para", technicianId);
    }

    return new Response(
      JSON.stringify({ success: true, orderId, technicianId, pushSent }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[OnOrderAssigned] Error inesperado:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
