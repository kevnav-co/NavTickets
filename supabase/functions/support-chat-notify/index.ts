// Supabase Edge Function — Support Chat Notify.
// Push OneSignal a los super_admins cuando un usuario de EMPRESA escribe un
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
// cabecera x-webhook-secret si se define el secret WEBHOOK_SECRET en la función.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-webhook-secret");
    if (got !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

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

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
      console.warn("[Support Chat Notify] OneSignal no configurado");
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "ONESIGNAL_NOT_CONFIGURED" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Contexto del ticket (empresa + asunto) para un body más claro.
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("subject, company_id")
      .eq("id", ticketId)
      .single();
    let companyName = "una empresa";
    if (ticket?.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", ticket.company_id)
        .single();
      if (company?.name) companyName = company.name;
    }
    const subject = ticket?.subject || "";

    // Destinatarios: todos los super_admins con player id (patrón de support-notify).
    const { data: superAdmins } = await supabase
      .from("users")
      .select("id, onesignal_player_id, fcm_token")
      .eq("role", "super_admin");
    const targets = (superAdmins || []).filter(
      (sa) => sa.onesignal_player_id || sa.fcm_token,
    );
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "NO_SUPER_ADMIN_PLAYER_IDS" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const playerIds = targets.map((t) => t.onesignal_player_id || t.fcm_token);
    const summary = `Empresa: ${companyName}${subject ? ` · ${subject}` : ""}\n${message}`.slice(0, 300);
    const pushBody: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: "💬 Nuevo mensaje del chat de soporte" },
      contents: { en: summary },
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
      console.error("[Support Chat Notify] OneSignal error:", JSON.stringify(errBody));
      return new Response(
        JSON.stringify({ success: false, notified: 0, error: JSON.stringify(errBody) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, notified: targets.length, to: targets.length }),
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