// Supabase Edge Function — Daily Expiration Check.
// Ported from the Vercel cron (`api/edge/daily-expiration-check.ts`, 0 8 * * *)
// onto the single scheduler platform: native Supabase scheduling.
// Cron trigger: 0 8 * * * (set via `supabase functions deploy daily-expiration-check --schedule "0 8 * * *"`).
//
// Checks equipment maintenance and order warranty expirations, then:
//  1. Creates internal `notifications` rows for company admins of each tenant.
//  2. Stubs WhatsApp/Email to clients (TODO: wire the real channels, same as before).
//
// The scheduler invokes this function server-to-server, so we read the service_role
// key from secrets for full schema privileges (same pattern as `task-scheduler`).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Sin service role este cron no puede crear notificaciones para los admins de
// cada tenant. Fallar pronto en vez de degradar a anon (no-op silencioso).
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(SUPABASE_URL, serviceRole);

// Push OneSignal: opcional (mismo patrón que support-notify). Sin secrets, el
// cron degrada a solo-notificación-interna (sendPushNotification) sin romperse.
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
const base = Deno.env.get("APP_URL") || "https://navtickets.vercel.app";

// Envía un push OneSignal a un conjunto de user ids de la app (mantenimiento y
// garantías por vencer para los admins del tenant). Resuelve el player id desde
// users.onesignal_player_id (fallback fcm_token legado).
async function sendPushToUserIds(
  userIds: (string | null)[],
  title: string,
  body: string,
  path: string,
): Promise<number> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    console.warn("[Expiration Check] OneSignal no configurado (solo notificación interna)");
    return 0;
  }
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return 0;

  const { data: users, error } = await supabase
    .from("users")
    .select("onesignal_player_id, fcm_token")
    .in("id", unique);
  if (error) throw error;

  const playerIds = (users || [])
    .map((u) => u.onesignal_player_id || u.fcm_token)
    .filter(Boolean);
  if (playerIds.length === 0) return 0;

  const pushBody = {
    app_id: ONESIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings: { en: title },
    contents: { en: body },
    url: `${base}/#${path}`,
    data: { path },
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
    console.error("[Expiration Check] OneSignal error:", await resp.text());
    return 0;
  }
  return playerIds.length;
}

interface CompanyBranding {
  name: string;
  primaryColor: string;
  logoUrl: string;
  whatsappNumber: string;
}

async function loadAllCompanyBrandings(): Promise<Record<string, CompanyBranding>> {
  const brandings: Record<string, CompanyBranding> = {};
  try {
    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, name, theme, whatsapp_number");
    if (error) throw error;
    for (const company of companies || []) {
      brandings[company.id] = {
        name: company.name || "Empresa",
        primaryColor: company.theme?.primaryColor || "#7b1113",
        logoUrl: company.theme?.logoUrl || "/assets/logo-inicio.png",
        whatsappNumber: company.whatsapp_number || "573117142337",
      };
    }
  } catch (e) {
    console.warn("[Expiration Check] Error loading companies:", e);
  }
  return brandings;
}

function getMaintenanceEmailHtml(
  data: { clientName: string; machineName: string; serialNumber: string; location: string; dueDate: string },
  branding: CompanyBranding,
): string {
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${branding.primaryColor};color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
        ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${branding.name}" style="max-height:60px;margin-bottom:15px;">` : ""}
        <h1 style="margin:0;font-size:24px;">Recordatorio de Mantenimiento</h1>
      </div>
      <div style="background:#f9f9f9;padding:30px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <p style="font-size:16px;">Hola <strong>${data.clientName}</strong>,</p>
        <p style="font-size:16px;">Le recordamos que su equipo <strong>${data.machineName}</strong> tiene un mantenimiento programado para el <strong>${data.dueDate}</strong>. Por favor contáctenos para agendar.</p>
        <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid ${branding.primaryColor};">
          <p style="margin:5px 0;"><strong>Equipo:</strong> ${data.machineName}</p>
          <p style="margin:5px 0;"><strong>Número de serie:</strong> ${data.serialNumber}</p>
          <p style="margin:5px 0;"><strong>Ubicación:</strong> ${data.location}</p>
          <p style="margin:5px 0;"><strong>Fecha de vencimiento:</strong> ${data.dueDate}</p>
        </div>
        <p style="font-size:14px;color:#666;">Para agendar su mantenimiento, contáctenos al WhatsApp: ${branding.whatsappNumber}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#999;text-align:center;">${branding.name} - Sistema de Gestión de Mantenimiento</p>
      </div>
    </body></html>`;
}

function getWarrantyEmailHtml(
  data: { clientName: string; orderNumber: string; machineName: string; expirationDate: string },
  branding: CompanyBranding,
): string {
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${branding.primaryColor};color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
        ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${branding.name}" style="max-height:60px;margin-bottom:15px;">` : ""}
        <h1 style="margin:0;font-size:24px;">Aviso de Garantía</h1>
      </div>
      <div style="background:#f9f9f9;padding:30px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <p style="font-size:16px;">Hola <strong>${data.clientName}</strong>,</p>
        <p style="font-size:16px;">Te informamos que la garantía de tu servicio <strong>#${data.orderNumber}</strong> (${data.machineName}) vence el <strong>${data.expirationDate}</strong>.</p>
        <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid ${branding.primaryColor};">
          <p style="margin:5px 0;"><strong>Orden:</strong> #${data.orderNumber}</p>
          <p style="margin:5px 0;"><strong>Equipo:</strong> ${data.machineName}</p>
          <p style="margin:5px 0;"><strong>Fecha de vencimiento:</strong> ${data.expirationDate}</p>
        </div>
        <p style="font-size:14px;color:#666;">Si tienes alguna consulta, contáctenos al WhatsApp: ${branding.whatsappNumber}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#999;text-align:center;">${branding.name} - Sistema de Gestión de Mantenimiento</p>
      </div>
    </body></html>`;
}

async function sendPushNotification(userId: string, companyId: string, title: string, body: string, path: string) {
  try {
    await supabase.from("notifications").insert({
      company_id: companyId,
      user_id: userId,
      title,
      body,
      text: title,
      path,
      type: "expiration",
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Expiration Check] Error sending push:", error);
  }
}

async function sendEmail(_to: string, subject: string, _html: string): Promise<boolean> {
  // TODO: wire a real channel (Resend/SendGrid). Kept as a stub to preserve prior behavior.
  console.log(`[Expiration Check] Would send email "${subject}"`);
  return false;
}

async function sendWhatsApp(_to: string, message: string): Promise<boolean> {
  // TODO: wire Twilio. Kept as a stub to preserve prior behavior.
  console.log(`[Expiration Check] Would send WhatsApp: ${message}`);
  return false;
}

Deno.serve(async () => {
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);

  const warningBuffer = new Date(now);
  warningBuffer.setDate(now.getDate() + 5);

  const brandings = await loadAllCompanyBrandings();
  const results = { maintenance: 0, warranty: 0, errors: [] as string[] };

  try {
    console.log("[Expiration Check] Starting multi-tenant expiration scan...");

    // --- 1. CHECK EQUIPMENT MAINTENANCE ---
    const { data: equipment, error: eqError } = await supabase
      .from("equipment")
      .select(
        "id, name, brand, serial_number, location, last_maintenance_date, maintenance_frequency, client_id, company_id, next_maintenance_notification_sent",
      )
      .eq("status", "Activa")
      .eq("next_maintenance_notification_sent", false);

    if (eqError) throw eqError;

    for (const eq of equipment || []) {
      if (!eq.last_maintenance_date || !eq.maintenance_frequency) continue;

      const companyId = eq.company_id;
      const branding =
        brandings[companyId] ||
        ({ name: "Empresa", primaryColor: "#7b1113", logoUrl: "/assets/logo-inicio.png", whatsappNumber: "573117142337" } as CompanyBranding);

      const lastDate = new Date(eq.last_maintenance_date);
      const dueDate = new Date(lastDate);
      dueDate.setMonth(lastDate.getMonth() + eq.maintenance_frequency);

      if (dueDate <= nextWeek) {
        const title = "Mantenimiento Próximo";
        const body = `El equipo ${eq.name} (${eq.brand}) necesita mantenimiento el ${dueDate.toLocaleDateString()}.`;
        const path = `/equipment/${eq.id}`;

        const { data: admins, error: adminError } = await supabase
          .from("users")
          .select("id")
          .eq("role", "admin")
          .eq("company_id", companyId);
        if (adminError) throw adminError;
        for (const admin of admins || []) {
          await sendPushNotification(admin.id, companyId, title, body, path);
        }
        await sendPushToUserIds(
          (admins || []).map((a) => a.id),
          title,
          body,
          path,
        );

        if (eq.client_id) {
          const { data: client } = await supabase
            .from("clients")
            .select("name, contact, email")
            .eq("id", eq.client_id)
            .single();
          if (client) {
            const dueDateStr = dueDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
            const clientBody = `Hola ${client.name},\n\nLe recordamos que su equipo ${eq.name} tiene un mantenimiento programado para el ${dueDateStr}. Por favor contáctenos para agendar.`;
            const clientHtmlBody = getMaintenanceEmailHtml(
              { clientName: client.name, machineName: eq.name, serialNumber: eq.serial_number || "N/A", location: eq.location || "N/A", dueDate: dueDateStr },
              branding,
            );

            let notified = false;
            if (client.contact) notified = await sendWhatsApp(client.contact, clientBody);
            if (!notified && client.email) notified = await sendEmail(client.email, `Aviso: Mantenimiento Preventivo - ${eq.name}`, clientHtmlBody);
          }
        }

        await supabase.from("equipment").update({ next_maintenance_notification_sent: true }).eq("id", eq.id);
        results.maintenance++;
        console.log(`[Expiration Check] Maintenance alert sent for: ${eq.name} (company: ${companyId})`);
      }
    }

    // --- 2. CHECK WARRANTY EXPIRATIONS ---
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, warranty_expiration, client_id, company_id, equipment_name, warranty_notification_sent")
      .eq("status", "Cerrado")
      .eq("warranty_notification_sent", false);

    if (orderError) throw orderError;

    for (const order of orders || []) {
      if (!order.warranty_expiration) continue;

      const companyId = order.company_id;
      const branding =
        brandings[companyId] ||
        ({ name: "Empresa", primaryColor: "#7b1113", logoUrl: "/assets/logo-inicio.png", whatsappNumber: "573117142337" } as CompanyBranding);

      const expirationDate = new Date(order.warranty_expiration);

      if (expirationDate <= warningBuffer) {
        const title = "Garantía por Vencer";
        const body = `La garantía de la orden #${order.order_number} vence el ${expirationDate.toLocaleDateString()}.`;
        const path = `/orders/${order.id}`;

        const { data: admins, error: adminError } = await supabase
          .from("users")
          .select("id")
          .eq("role", "admin")
          .eq("company_id", companyId);
        if (adminError) throw adminError;
        for (const admin of admins || []) {
          await sendPushNotification(admin.id, companyId, title, body, path);
        }
        await sendPushToUserIds(
          (admins || []).map((a) => a.id),
          title,
          body,
          path,
        );

        if (order.client_id) {
          const { data: client } = await supabase
            .from("clients")
            .select("name, contact, email")
            .eq("id", order.client_id)
            .single();
          if (client) {
            const expDateStr = expirationDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
            const clientBody = `Hola ${client.name}, te informamos que la garantía de tu servicio #${order.order_number} vence el ${expDateStr}.`;
            const clientHtmlBody = getWarrantyEmailHtml(
              { clientName: client.name, orderNumber: order.order_number, machineName: order.equipment_name || "Equipo de Cocina", expirationDate: expDateStr },
              branding,
            );

            let notified = false;
            if (client.contact) notified = await sendWhatsApp(client.contact, clientBody);
            if (!notified && client.email) notified = await sendEmail(client.email, `Aviso de Garantía - Orden #${order.order_number}`, clientHtmlBody);
          }
        }

        await supabase.from("orders").update({ warranty_notification_sent: true }).eq("id", order.id);
        results.warranty++;
        console.log(`[Expiration Check] Warranty alert sent for order: ${order.order_number} (company: ${companyId})`);
      }
    }

    console.log("[Expiration Check] Scan completed:", results);
    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Expiration Check] Fatal error:", error);
    results.errors.push(error.message);
    return new Response(JSON.stringify({ success: false, ...results }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});