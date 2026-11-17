// Supabase Edge Function — Service Request Notify (Web Push).
// La dispara el trigger trg_service_request_notify_webhook (migración 046) vía
// pg_net cuando una solicitud del asistente queda en 'pendiente'. Envía un push a
// los gestores de la empresa (admin, supervisor, aux_admin), salvo a quien la
// registró a mano. La notificación de la campana ya la crea la migración 042.
//
// Seguridad: verify_jwt = false (pg_net no tiene sesión); el acceso lo controla
// el secreto compartido WEBHOOK_SECRET (_shared/webhook-auth.ts, fail-closed).
// El webhook solo trae el id: la solicitud se relee con la service role y no se
// confía en el contenido de la petición.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";
import { sendPushToMany } from "../_shared/push.ts";

const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = ["admin", "supervisor", "aux_admin"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

  try {
    const body = await req.json();
    const requestId = body?.record?.id;
    if (typeof requestId !== "string" || !UUID_RE.test(requestId)) {
      return json({ error: "record.id requerido" }, 400);
    }

    const { data: request, error: requestError } = await supabase
      .from("service_requests")
      .select("id, company_id, status, contact_name, service_name, order_type, created_by")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      console.error("[Service Request Notify] Error leyendo la solicitud:", requestError);
      return json({ error: "No se pudo leer la solicitud" }, 500);
    }
    if (!request) return json({ error: "Solicitud no encontrada" }, 404);
    // Entre el trigger y esta llamada pudo cambiar de estado: solo se avisa si sigue pendiente.
    if (request.status !== "pendiente") return json({ success: true, skipped: "no pendiente" });

    const { data: managers, error: managersError } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", request.company_id)
      .in("role", MANAGER_ROLES);

    if (managersError) {
      console.error("[Service Request Notify] Error leyendo los gestores:", managersError);
      return json({ error: "No se pudieron leer los gestores" }, 500);
    }

    const recipients = (managers ?? [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => id !== request.created_by);

    const who = clip((request.contact_name ?? "").trim() || "Un cliente", 60);
    const what = clip((request.service_name ?? "").trim() || request.order_type || "servicio", 80);

    const result = await sendPushToMany(
      recipients,
      {
        title: "Nueva solicitud de servicio",
        body: `${who} pide: ${what}`,
        data: { path: `/requests/${request.id}` },
      },
      "Service Request Notify",
    );

    return json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("[Service Request Notify] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
