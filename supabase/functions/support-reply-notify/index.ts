// Supabase Edge Function — Support Reply Notify.
// Push Web Push API al AUTOR de un caso de soporte cuando el super_admin responde.
// Lo dispara el trigger `support_message_notify_author` (migración 027) vía
// pg_net cuando se inserta una fila en support_messages con role='admin'.
//
// El trigger 025 ya crea la notificación interna (bandeja de la app); esta función
// hace la parte OPORTUNA: notificación push en vivo al autor. Complementan, no
// se duplican: 025 = fila en `notifications`, 027/pg_net = Web Push al dispositivo.
//
// Sin JWT de sesión (verify_jwt=false, la llama pg_net). Acceso de control: cabecera
// x-webhook-secret (obligatoria: ver _shared/webhook-auth.ts).

import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";
import { sendPush } from "../_shared/push.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

  try {
    const body = await req.json();
    const record = body.record ?? body;

    const authorId = record.author_id ?? record.user_id;
    const message = record.message;
    if (!authorId) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "NO_AUTHOR" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const summary = (message || "").slice(0, 200);

    const ok = await sendPush({
      userId: authorId,
      title: "🔔 Nueva respuesta en tu caso de soporte",
      body: summary,
      data: { path: "/admin/support" },
    });

    if (!ok) {
      console.error("[Support Reply Notify] send-push failed for", authorId);
    }

    return new Response(
      JSON.stringify({ success: true, notified: ok ? 1 : 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[Support Reply Notify] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});