// Supabase Edge Function — Task Scheduler.
// Migrated from the Vercel cron (`api/edge/task-scheduler.ts`) to native Supabase scheduling.
// Cron trigger: */5 * * * * (set via `supabase functions deploy task-scheduler --schedule "*/5 * * * *"`).
//
// Handles:
//   1. Reminders (reminder time reached, not yet notified)
//   2. Due dates (8 AM window for today's due tasks)
//   3. Recurring tasks (completed tasks with a repeat pattern)
//
// The scheduler invokes this function server-to-server with the service_role JWT, so we fork
// the client off the incoming `Authorization` header to retain full schema privileges.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// El scheduler ejecuta este function server-to-server: necesita privilegios
// completos. Usar la service role key como secret, nunca la anon (que no lee
// nada privilegiado y degradaría el cron a un no-op silencioso).
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}
const supabase = createClient(SUPABASE_URL, serviceRole);

// Push OneSignal: opcional (mismo patrón que support-notify). Si no hay secrets,
// degrada a solo-notificación-interna sin romper el cron.
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
const base = Deno.env.get("APP_URL") || "https://navtickets.vercel.app";

// Envía un push OneSignal a un conjunto de user ids de la app (recordatorios,
// vencimientos). Resuelve el player id desde users.onesignal_player_id (fallback
// fcm_token legado). Retorna cuántos push se encolaron.
async function sendPushToUserIds(
  userIds: (string | null)[],
  title: string,
  body: string,
  path: string,
): Promise<number> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    console.warn("[Task Scheduler] OneSignal no configurado (solo notificación interna)");
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
    console.error("[Task Scheduler] OneSignal error:", await resp.text());
    return 0;
  }
  return playerIds.length;
}

Deno.serve(async () => {
  const now = new Date();
  const results: {
    reminders: number;
    dueDates: number;
    recurring: number;
    errors: string[];
  } = { reminders: 0, dueDates: 0, recurring: 0, errors: [] };

  try {
    // ─── 1. Handle Reminders ──────────────────────────────────────────────────
    const { data: reminders, error: remindersError } = await supabase
      .from("tasks")
      .select(
        "id, title, created_by, assigned_to, reminder, reminder_notification_sent, company_id",
      )
      .neq("reminder", null)
      .lte("reminder", now.toISOString())
      .eq("reminder_notification_sent", false);

    if (remindersError) throw remindersError;

    for (const task of reminders || []) {
      const recipients = [
        ...new Set([task.created_by, task.assigned_to].filter(Boolean)),
      ];

      for (const userId of recipients) {
        await supabase.from("notifications").insert({
          company_id: task.company_id,
          user_id: userId,
          title: `Recordatorio: ${task.title}`,
          body: `Recuerda la tarea: "${task.title}".`,
          text: `Recordatorio: ${task.title}`,
          path: "/tasks",
          type: "reminder",
          read: false,
          created_at: new Date().toISOString(),
        });
      }

      await sendPushToUserIds(
        recipients,
        `Recordatorio: ${task.title}`,
        `Recuerda la tarea: "${task.title}".`,
        "/tasks",
      );

      await supabase
        .from("tasks")
        .update({ reminder_notification_sent: true })
        .eq("id", task.id);
      results.reminders++;
    }

    // ─── 2. Handle Due Dates (8 AM window) ────────────────────────────────────
    const currentHour = now.getHours();
    if (currentHour >= 8 && currentHour < 9) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: dueTasks, error: dueError } = await supabase
        .from("tasks")
        .select(
          "id, title, created_by, assigned_to, due_date, due_date_notification_sent, company_id",
        )
        .gte("due_date", startOfDay.toISOString())
        .lte("due_date", endOfDay.toISOString())
        .eq("due_date_notification_sent", false);

      if (dueError) throw dueError;

      for (const task of dueTasks || []) {
        const recipients = [
          ...new Set([task.created_by, task.assigned_to].filter(Boolean)),
        ];

        for (const userId of recipients) {
          await supabase.from("notifications").insert({
            company_id: task.company_id,
            user_id: userId,
            title: `Vencimiento: ${task.title}`,
            body: `La tarea "${task.title}" se vence hoy.`,
            text: `Vencimiento: ${task.title}`,
            path: "/tasks",
            type: "due_date",
            read: false,
            created_at: new Date().toISOString(),
          });
        }

        await sendPushToUserIds(
          recipients,
          `Vencimiento: ${task.title}`,
          `La tarea "${task.title}" se vence hoy.`,
          "/tasks",
        );

        await supabase
          .from("tasks")
          .update({ due_date_notification_sent: true })
          .eq("id", task.id);
        results.dueDates++;
      }
    }

    // ─── 3. Handle Recurring Tasks ─────────────────────────────────────────────
    const { data: recurringTasks, error: recurringError } = await supabase
      .from("tasks")
      .select("id, title, due_date, created_at, repeat")
      .neq("repeat", null)
      .eq("completed", true);

    if (recurringError) throw recurringError;

    for (const task of recurringTasks || []) {
      const oldDueDate = new Date(task.due_date || task.created_at);
      const newDueDate = new Date(oldDueDate);

      switch (task.repeat) {
        case "Diariamente":
          newDueDate.setDate(oldDueDate.getDate() + 1);
          break;
        case "Días laborables": {
          let daysToAdd = 1;
          if (oldDueDate.getDay() === 5) daysToAdd = 3; // Friday -> Monday
          if (oldDueDate.getDay() === 6) daysToAdd = 2; // Saturday -> Monday
          newDueDate.setDate(oldDueDate.getDate() + daysToAdd);
          break;
        }
        case "Semanalmente":
          newDueDate.setDate(oldDueDate.getDate() + 7);
          break;
        case "Mensualmente":
          newDueDate.setMonth(oldDueDate.getMonth() + 1);
          break;
        case "Anualmente":
          newDueDate.setFullYear(oldDueDate.getFullYear() + 1);
          break;
        default:
          continue;
      }

      // Reactivate the task for the next cycle
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          completed: false,
          created_at: new Date().toISOString(),
          due_date: newDueDate.toISOString(),
          reminder_notification_sent: false,
          due_date_notification_sent: false,
        })
        .eq("id", task.id);

      if (updateError) throw updateError;

      console.log(
        `[Task Scheduler] Task "${task.title}" reactivated: ${newDueDate.toISOString()}`,
      );
      results.recurring++;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Task Scheduler] Error:", error);
    results.errors.push(error.message);
    return new Response(JSON.stringify({ success: false, ...results }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});