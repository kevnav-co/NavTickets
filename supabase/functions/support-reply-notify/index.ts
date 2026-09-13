// Supabase Edge Function — Support Reply Notify.
// Push OneSignal al AUTOR de un caso de soporte cuando el super_admin responde.
// Lo dispara el trigger `support_message_notify_author` (migración 027) vía
// pg_net cuando se inserta una fila en support_messages con role='admin'.
//
// El trigger 025 ya crea la notificación interna (bandeja de la app); esta función
// hace la parte OPORTUNA: notificación push push en vivo al autor. Complementan, no
// se duplican: 025 = fila en `notifications`, 027/pg_net = OneSignal al dispositivo.
//
// Sin JWT de sesión (verify_jwt=false, la llama pg_net). Acceso de control: cabecera
// x-webhook-secret si se define el secret WEBHOOK_SECRET en la función.

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

  // Validación defensiva: solo rechaza si el header trae un valor real
  // que NO coincide. Si app.webhook_secret no está en Session settings,
  // el header viene vacío y se acepta (best-effort).
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-webhook-secret");
    if (got && got !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const record = body.record ?? body;

    const authorId = record.author_id ?? record.user_id;
    const companyId = record.company_id;
    const message = record.message;
    if (!authorId) {
      // Sin autor destino (respuesta a un ticket huérfano) -> no-op silencioso.
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "NO_AUTHOR" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
      console.warn("[Support Reply Notify] OneSignal no configurado (faltan secretos)");
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "ONESIGNAL_NOT_CONFIGURED" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Player id del autor + branding de su empresa (ícono del push).
    const { data: author } = await supabase
      .from("users")
      .select("onesignal_player_id, fcm_token, name")
      .eq("id", authorId)
      .single();
    const playerId = author?.onesignal_player_id || author?.fcm_token;
    if (!playerId) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "NO_PLAYER_ID" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    let companyName = "tu empresa";
    let companyLogo: string | undefined;
    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("name, theme")
        .eq("id", companyId)
        .single();
      if (company?.name) companyName = company.name;
      companyLogo = company?.theme?.logoUrl || undefined;
    }

    const summary = (message || "").slice(0, 200);
    const pushBody: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [playerId],
      headings: { en: "🔔 Nueva respuesta en tu caso de soporte" },
      contents: { en: `Soporte de ${companyName}: ${summary}` },
      url: `${base}/#/admin`,
      data: { path: "/admin" },
    };
    if (companyLogo) {
      pushBody.chrome_web_icon = companyLogo;
      pushBody.chrome_web_badge = companyLogo;
    }

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
      console.error("[Support Reply Notify] OneSignal error:", JSON.stringify(errBody));
      return new Response(
        JSON.stringify({ success: false, notified: 0, error: JSON.stringify(errBody) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, notified: 1, to: author?.name || authorId }),
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