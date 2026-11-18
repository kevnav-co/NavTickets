// Supabase Edge Function — Service Request Customer Notify (correo al cliente).
// La dispara el trigger trg_service_request_customer_notify_webhook (migración
// 051) vía pg_net cuando una solicitud pasa a 'confirmada' o 'rechazada'. Envía
// al cliente un correo con la cita (fecha, hora, técnico, número de orden) o con
// el motivo del rechazo.
//
// Seguridad: verify_jwt = false (pg_net no tiene sesión); el acceso lo controla
// el secreto compartido WEBHOOK_SECRET (_shared/webhook-auth.ts, fail-closed).
// El webhook solo trae el id: la solicitud se relee con la service role y no se
// confía en el contenido de la petición. Sin correo del cliente no envía nada;
// sin GMAIL_USER/GMAIL_APP_PASSWORD queda en modo simulado (solo log). En esos
// casos, y si el envío falla, deja una notificación en la campana a quien revisó
// la solicitud para que avise al cliente por teléfono.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";
import { maskEmail, sendCustomerNoticeEmail } from "../_shared/email.ts";
import { buildCustomerNotice, pickCustomerEmail, type CustomerNoticeStatus } from "../_shared/assistant/customerEmail.ts";
import { isValidEmail } from "../_shared/assistant/codes.ts";

const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TAG = "[Service Request Customer Notify]";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type NotSentReason = "sin_correo" | "sin_configurar" | "fallo";
const NOT_SENT_TEXT: Record<NotSentReason, string> = {
  sin_correo: "no dejó correo",
  sin_configurar: "no recibió correo porque el correo de la empresa no está configurado",
  fallo: "no recibió el correo por un error al enviarlo",
};

/**
 * Si el cliente no recibió el aviso, se lo dice en la campana a quien revisó la
 * solicitud, para que lo llame. La app nunca afirma que el correo salió.
 */
async function notifyReviewerNotSent(
  request: { id: string; company_id: string; status: string; reviewed_by: string | null; contact_name: string | null },
  reason: NotSentReason,
) {
  if (!request.reviewed_by) return;
  const who = (request.contact_name ?? "").trim().slice(0, 60) || "El cliente";
  const what = request.status === "confirmada" ? "de la cita" : "del rechazo";
  const { error } = await supabase.from("notifications").insert({
    company_id: request.company_id,
    user_id: request.reviewed_by,
    title: `Avisa al cliente ${what}`,
    body: `${who} ${NOT_SENT_TEXT[reason]}. Avísale por teléfono.`,
    text: `${who}: avísale por teléfono`,
    type: "alert",
    path: `/requests/${request.id}`,
  });
  if (error) console.error(TAG, "No se pudo crear el aviso para el gestor:", error);
}

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
      .select("id, company_id, status, client_id, contact_name, contact_email, service_name, order_type, proposed_date, proposed_time, proposed_duration_minutes, proposed_technician_id, order_id, rejection_reason, reviewed_by")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      console.error(TAG, "Error leyendo la solicitud:", requestError);
      return json({ error: "No se pudo leer la solicitud" }, 500);
    }
    if (!request) return json({ error: "Solicitud no encontrada" }, 404);

    const status = request.status as string;
    if (status !== "confirmada" && status !== "rechazada") {
      return json({ success: true, skipped: "estado sin aviso al cliente" });
    }

    // Correo: el de la solicitud o, si no lo dejó (o no es válido), el del cliente registrado.
    let clientEmail: string | null = null;
    const requestEmailOk = typeof request.contact_email === "string" && isValidEmail(request.contact_email.trim().toLowerCase());
    if (!requestEmailOk && request.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("email")
        .eq("id", request.client_id)
        .eq("company_id", request.company_id)
        .maybeSingle();
      clientEmail = (client?.email as string | null) ?? null;
    }
    const to = pickCustomerEmail(request.contact_email, clientEmail, isValidEmail);
    if (!to) {
      await notifyReviewerNotSent(request, "sin_correo");
      return json({ success: true, skipped: "sin correo del cliente" });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, slug, theme")
      .eq("id", request.company_id)
      .maybeSingle();
    if (companyError || !company) {
      console.error(TAG, "Error leyendo la empresa:", companyError);
      return json({ error: "No se pudo leer la empresa" }, 500);
    }

    let technicianName: string | null = null;
    let orderNumber: number | string | null = null;
    if (status === "confirmada") {
      if (request.proposed_technician_id) {
        const { data: tech } = await supabase
          .from("users")
          .select("name")
          .eq("id", request.proposed_technician_id)
          .eq("company_id", request.company_id)
          .maybeSingle();
        technicianName = (tech?.name as string | null) ?? null;
      }
      if (request.order_id) {
        const { data: order } = await supabase
          .from("orders")
          .select("order_number")
          .eq("id", request.order_id)
          .eq("company_id", request.company_id)
          .maybeSingle();
        orderNumber = (order?.order_number as number | string | null) ?? null;
      }
    }

    const theme = (company.theme ?? {}) as { primaryColor?: unknown; logoUrl?: unknown };
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
    const slug = typeof company.slug === "string" ? company.slug : "";
    const chatUrl = appUrl.startsWith("https://") && SLUG_RE.test(slug) ? `${appUrl}/#/asistente/${slug}` : null;

    const notice = buildCustomerNotice({
      status: status as CustomerNoticeStatus,
      companyName: String(company.name ?? ""),
      primaryColor: typeof theme.primaryColor === "string" ? theme.primaryColor : null,
      logoUrl: typeof theme.logoUrl === "string" ? theme.logoUrl : null,
      contactName: request.contact_name,
      serviceName: request.service_name,
      orderType: request.order_type,
      reference: String(request.id).slice(0, 8),
      date: request.proposed_date,
      time: request.proposed_time,
      durationMinutes: request.proposed_duration_minutes,
      technicianName,
      orderNumber,
      rejectionReason: request.rejection_reason,
      chatUrl,
    });

    const result = await sendCustomerNoticeEmail(to, notice, String(company.name ?? ""));
    if (!result.ok) {
      console.error(TAG, `No se pudo enviar el aviso (${status}) a ${maskEmail(to)}`);
      await notifyReviewerNotSent(request, "fallo");
      return json({ success: false, status, error: "No se pudo enviar el correo" }, 502);
    }
    if (result.stub) await notifyReviewerNotSent(request, "sin_configurar");
    return json({ success: true, status, sent: !result.stub, stub: result.stub });
  } catch (error: unknown) {
    console.error(TAG, "Error:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
