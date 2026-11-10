/**
 * Helper compartido para enviar notificaciones push vía la Edge Function `send-push`.
 * Centraliza el patrón fetch-to-send-push que se repite en support-notify,
 * support-reply-notify, support-chat-notify, on-order-assigned y on-task-assigned.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "";

export interface PushRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  total: number;
}

export async function sendPush(request: PushRequest): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify(request),
  });
  return resp.ok;
}

export async function sendPushToMany(
  userIds: string[],
  notification: Omit<PushRequest, "userId">,
  tag: string,
): Promise<PushResult> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const ok = await sendPush({ userId, ...notification });
    if (ok) {
      sent++;
    } else {
      console.error(`[${tag}] Failed to send push to ${userId}`);
      failed++;
    }
  }

  return { sent, failed, total: userIds.length };
}
