import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import * as webpush from "npm:web-push@3.6.7";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@navtickets.app";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error("VAPID keys not configured");
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface PushPayload {
  userId?: string; // Si se proporciona, enviar solo a ese usuario
  companyId?: string; // Enviar a todos los usuarios de la empresa
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string; // Para agrupar notificaciones
  data?: Record<string, string>; // Datos adicionales (path, etc.)
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verificar autorización (service role o webhook secret)
  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

  try {
    const payload: PushPayload = await req.json();

    if (!payload.title || !payload.body) {
      return new Response("Missing title or body", { status: 400 });
    }

    // Construir la notificación
    const notification = {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/assets/icon-app.png",
      badge: payload.badge || "/assets/badge-72x72.png",
      tag: payload.tag || "default",
      data: payload.data || {},
    };

    // Obtener suscripciones según el filtro
    let query = "select * from push_subscriptions";
    const params: unknown[] = [];

    if (payload.userId) {
      query += " where user_id = $1";
      params.push(payload.userId);
    } else if (payload.companyId) {
      query += " where company_id = $1";
      params.push(payload.companyId);
    } else {
      return new Response("Must specify userId or companyId", { status: 400 });
    }

    // Query a Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase config missing");
    }

    const subscriptionsRes = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?${new URLSearchParams({
        select: "*",
        ...(payload.userId && { user_id: `eq.${payload.userId}` }),
        ...(payload.companyId && { company_id: `eq.${payload.companyId}` }),
      })}`,
      {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!subscriptionsRes.ok) {
      console.error("Failed to fetch subscriptions:", await subscriptionsRes.text());
      return new Response("Failed to fetch subscriptions", { status: 500 });
    }

    const subscriptions = await subscriptionsRes.json();

    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Enviar push a cada suscripción
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(notification)
        );

        sent++;
      } catch (error: any) {
        console.error(`Failed to send push to ${sub.endpoint}:`, error.message);

        // Si la suscripción es inválida (410), eliminarla
        if (error.statusCode === 410 || error.statusCode === 401) {
          try {
            await fetch(
              `${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
              {
                method: "DELETE",
                headers: {
                  "Authorization": `Bearer ${serviceRoleKey}`,
                  "apikey": serviceRoleKey,
                },
              }
            );
          } catch (delError) {
            console.error("Failed to delete invalid subscription:", delError);
          }
        }

        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: subscriptions.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
