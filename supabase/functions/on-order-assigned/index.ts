// Supabase Edge Function — On Order Assigned
// Notifica al técnico cuando se le asigna o reasigna una orden de servicio.
// Disparado por el trigger `trg_order_assigned_webhook` (PostgreSQL) vía pg_net.
//
// 1) Inserta una fila en la tabla `notifications` (bandeja interna de la app).
// 2) Envía una notificación push en tiempo real vía OneSignal REST API al técnico asignado.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}

const supabase = createClient(SUPABASE_URL, serviceRole);

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const base = Deno.env.get("APP_URL") || "https://navtickets.vercel.app";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validación de seguridad defensiva si WEBHOOK_SECRET está configurado
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.get("authorization");
    const customHeader = req.headers.get("x-webhook-secret");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const provided = customHeader || bearer;

    if (provided !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

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

    // Si no hay técnico asignado, no notificar
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

    // 1) Crear notificación en la bandeja interna (tabla `notifications`)
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

    // 2) Enviar Push OneSignal si está configurado y el técnico tiene player ID
    let pushSent = false;
    if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
      const { data: techUsers } = await supabase
        .from("users")
        .select("onesignal_player_id, fcm_token, name")
        .eq("id", technicianId);

      const playerId =
        (techUsers || [])[0]?.onesignal_player_id || (techUsers || [])[0]?.fcm_token;

      if (playerId) {
        // Obtener datos de la empresa para personalizar el push con branding
        let companyName = "NavTicket";
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

        const pushPayload: Record<string, unknown> = {
          app_id: ONESIGNAL_APP_ID,
          include_player_ids: [playerId],
          headings: { en: `📋 ${notifTitle}` },
          contents: { en: `${companyName}: ${orderMsg}` },
          url: `${base}/#${targetPath}`,
          data: { path: targetPath, url: `${base}/#${targetPath}` },
        };

        if (companyLogo) {
          pushPayload.chrome_web_icon = companyLogo;
          pushPayload.chrome_web_badge = companyLogo;
        }

        const pushResp = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            Authorization: `Basic ${ONESIGNAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pushPayload),
        });

        if (!pushResp.ok) {
          const errText = await pushResp.text();
          console.error("[OnOrderAssigned] Error OneSignal:", errText);
        } else {
          pushSent = true;
        }
      }
    } else {
      console.warn("[OnOrderAssigned] OneSignal no configurado (faltan secretos)");
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        technicianId,
        pushSent,
      }),
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
