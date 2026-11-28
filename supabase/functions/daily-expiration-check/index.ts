// Supabase Edge Function — Daily Expiration Check.
// Ported from the Vercel cron (`api/edge/daily-expiration-check.ts`, 0 8 * * *)
// onto the single scheduler platform: native Supabase scheduling.
// Cron trigger: 0 8 * * * (set via `supabase functions deploy daily-expiration-check --schedule "0 8 * * *"`).
//
// Checks equipment maintenance and order warranty expirations, then:
//  1. Creates internal `notifications` rows for company admins of each tenant.
//  2. Emails the client a reminder (maintenance or warranty) when the company turned
//     on `features.clientReminderEmails` and the client has a valid email
//     (`_shared/reminders/reminderEmail.ts`, sent with Gmail through `_shared/email.ts`).
//     The secret REMINDER_EMAIL_OVERRIDE sends every reminder to one test address.
//     WhatsApp is not wired yet (needs a Twilio account).
//
// The scheduler invokes this function server-to-server, so we read the service_role
// key from secrets for full schema privileges (same pattern as `task-scheduler`).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedCronCall, unauthorizedCronResponse } from "../_shared/cron-auth.ts";
import { maskEmail, sendNoticeEmail } from "../_shared/email.ts";
import {
  buildReminderEmail,
  decideRecipient,
  formatReminderDate,
  type ReminderInput,
} from "../_shared/reminders/reminderEmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Sin service role este cron no puede crear notificaciones para los admins de
// cada tenant. Fallar pronto en vez de degradar a anon (no-op silencioso).
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(SUPABASE_URL, serviceRole);

// Envía un push Web Push API a un conjunto de user ids (vencimientos/mantenimiento).
async function sendPushToUserIds(
  userIds: (string | null)[],
  title: string,
  body: string,
  path: string,
): Promise<number> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return 0;

  let sent = 0;
  for (const userId of unique) {
    try {
      const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          "x-webhook-secret": Deno.env.get("WEBHOOK_SECRET") || "",
        },
        body: JSON.stringify({
          userId,
          title,
          body,
          data: { path },
        }),
      });

      if (pushResp.ok) {
        sent++;
      } else {
        console.error(`[Expiration Check] Failed to send push to ${userId}:`, await pushResp.text());
      }
    } catch (error) {
      console.error(`[Expiration Check] Error sending push to ${userId}:`, error);
    }
  }

  return sent;
}

interface CompanyBranding {
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
  phone: string | null;
  /** features.clientReminderEmails: la empresa pidió avisar a sus clientes por correo. */
  clientReminderEmails: boolean;
}

const DEFAULT_BRANDING: CompanyBranding = {
  name: "Empresa",
  primaryColor: null,
  logoUrl: null,
  phone: null,
  clientReminderEmails: false,
};

async function loadAllCompanyBrandings(): Promise<Record<string, CompanyBranding>> {
  const brandings: Record<string, CompanyBranding> = {};
  try {
    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, name, theme, features, status");
    if (error) throw error;
    for (const company of companies || []) {
      brandings[company.id] = {
        name: company.name || "Empresa",
        primaryColor: company.theme?.primaryColor ?? null,
        logoUrl: company.theme?.logoUrl ?? null,
        phone: company.theme?.whatsappNumber ?? company.theme?.phone ?? null,
        // Una empresa suspendida (migración 054) no escribe a sus clientes.
        clientReminderEmails: company.features?.clientReminderEmails === true && company.status !== "suspended",
      };
    }
  } catch (e) {
    console.warn("[Expiration Check] Error loading companies:", e);
  }
  return brandings;
}

type EmailOutcome = "sent" | "failed" | "stub" | "disabled" | "no_email" | "invalid_email";

/**
 * Recordatorio por correo al cliente, si la empresa lo activó y el cliente tiene
 * correo. Con el secreto REMINDER_EMAIL_OVERRIDE (pruebas) todo va a esa dirección.
 */
async function emailClient(
  branding: CompanyBranding,
  clientEmail: string | null | undefined,
  input: Omit<ReminderInput, "companyName" | "primaryColor" | "logoUrl" | "companyPhone" | "now">,
  now: Date,
): Promise<EmailOutcome> {
  const decision = decideRecipient({
    enabled: branding.clientReminderEmails,
    clientEmail,
    override: Deno.env.get("REMINDER_EMAIL_OVERRIDE"),
  });
  if (!decision.send) return decision.reason;

  const email = buildReminderEmail({
    ...input,
    companyName: branding.name,
    primaryColor: branding.primaryColor,
    logoUrl: branding.logoUrl,
    companyPhone: branding.phone,
    now,
  });
  if (decision.redirectedFrom) {
    email.subject = `[Prueba → ${maskEmail(decision.redirectedFrom)}] ${email.subject}`;
  }
  const res = await sendNoticeEmail(decision.to, email, branding.name, "recordatorio a cliente");
  if (res.stub) return "stub";
  return res.ok ? "sent" : "failed";
}

async function sendPushNotification(userId: string, companyId: string, title: string, body: string, path: string) {
  try {
    const { error } = await supabase.from("notifications").insert({
      company_id: companyId,
      user_id: userId,
      title,
      body,
      text: title,
      path,
      type: "alert",
      read: false,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error("[Expiration Check] Error sending push:", error);
  }
}

Deno.serve(async (req: Request) => {
  if (!isAuthorizedCronCall(req)) return unauthorizedCronResponse();

  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);

  const warningBuffer = new Date(now);
  warningBuffer.setDate(now.getDate() + 5);

  const brandings = await loadAllCompanyBrandings();
  const results = {
    maintenance: 0,
    warranty: 0,
    emails: { sent: 0, failed: 0, stub: 0, disabled: 0, no_email: 0, invalid_email: 0 } as Record<EmailOutcome, number>,
    errors: [] as string[],
  };

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
      const branding = brandings[companyId] ?? DEFAULT_BRANDING;

      const lastDate = new Date(eq.last_maintenance_date);
      const dueDate = new Date(lastDate);
      dueDate.setMonth(lastDate.getMonth() + eq.maintenance_frequency);

      if (dueDate <= nextWeek) {
        const title = "Mantenimiento Próximo";
        const body = `El equipo ${eq.name}${eq.brand ? ` (${eq.brand})` : ""} necesita mantenimiento el ${formatReminderDate(dueDate)}.`;
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
            .select("name, email")
            .eq("id", eq.client_id)
            .single();
          if (client) {
            const outcome = await emailClient(branding, client.email, {
              kind: "maintenance",
              clientName: client.name,
              itemName: eq.name,
              serialNumber: eq.serial_number,
              location: eq.location,
              dueDate,
            }, now);
            results.emails[outcome]++;
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
      // orders no tiene equipment_name: se usa el nombre del servicio (name).
      .select("id, order_number, name, warranty_expiration, client_id, company_id, warranty_notification_sent")
      .eq("status", "Cerrado")
      .eq("warranty_notification_sent", false);

    if (orderError) throw orderError;

    for (const order of orders || []) {
      if (!order.warranty_expiration) continue;

      const companyId = order.company_id;
      const branding = brandings[companyId] ?? DEFAULT_BRANDING;

      const expirationDate = new Date(order.warranty_expiration);

      if (expirationDate <= warningBuffer) {
        const title = "Garantía por Vencer";
        const body = `La garantía de la orden #${order.order_number} vence el ${formatReminderDate(expirationDate)}.`;
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
            .select("name, email")
            .eq("id", order.client_id)
            .single();
          if (client) {
            const outcome = await emailClient(branding, client.email, {
              kind: "warranty",
              clientName: client.name,
              itemName: order.name,
              orderNumber: order.order_number,
              dueDate: expirationDate,
            }, now);
            results.emails[outcome]++;
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