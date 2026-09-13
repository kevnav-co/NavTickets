// Supabase Edge Function — On Task Assigned
// Notifica al usuario cuando se le asigna una tarea y al creador cuando se completa.
// Disparado por el trigger `trg_task_assigned_webhook` (PostgreSQL) vía pg_net.
//
// 1) Inserta una fila en la tabla `notifications` (bandeja interna de la app).
// 2) Envía una notificación push en tiempo real vía OneSignal REST API.

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

  // Validación de seguridad defensiva si WEBHOOK_SECRET está configurado.
  // Solo rechaza si el header trae un valor real que NO coincide.
  // Si app.webhook_secret no está configurado en Session settings, el
  // header viene vacío y se acepta (best-effort).
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.get("authorization");
    const customHeader = req.headers.get("x-webhook-secret");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const provided = customHeader || bearer;

    if (provided && provided !== WEBHOOK_SECRET) {
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

    const taskId = record.id;
    const assignedTo = record.assigned_to;
    const companyId = record.company_id;
    const taskTitle = record.title || "Tarea sin título";
    const previousAssignee = oldRecord?.assigned_to;
    const createdBy = record.created_by;
    const isCompleted = Boolean(record.completed);
    const wasCompleted = Boolean(oldRecord?.completed);

    const results: string[] = [];

    // Obtener datos de empresa para branding (logo y nombre)
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

    // ─── 1. Notificar al asignado (si es asignación nueva o reasignación) ───
    if (assignedTo && (eventType === "INSERT" || assignedTo !== previousAssignee)) {
      const notifTitle = eventType === "INSERT" ? "Nueva tarea asignada" : "Tarea reasignada";
      const assignmentMsg = `Te han asignado la tarea: ${taskTitle}`;
      const targetPath = `/tasks/${taskId}`;

      // Insertar en bandeja interna
      const { error: notifError } = await supabase.from("notifications").insert({
        company_id: companyId,
        user_id: assignedTo,
        title: notifTitle,
        body: assignmentMsg,
        text: assignmentMsg,
        type: "info",
        path: targetPath,
        read: false,
        created_at: new Date().toISOString(),
      });

      if (notifError) {
        console.error("[OnTaskAssigned] Error al insertar notificación interna:", notifError);
      }

      // Enviar Push OneSignal al asignado
      if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
        const { data: assignedUsers } = await supabase
          .from("users")
          .select("onesignal_player_id, fcm_token")
          .eq("id", assignedTo);

        const playerId =
          (assignedUsers || [])[0]?.onesignal_player_id || (assignedUsers || [])[0]?.fcm_token;

        if (playerId) {
          const pushPayload: Record<string, unknown> = {
            app_id: ONESIGNAL_APP_ID,
            include_player_ids: [playerId],
            headings: { en: `📌 ${notifTitle}` },
            contents: { en: `${companyName}: ${assignmentMsg}` },
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
            console.error("[OnTaskAssigned] Error OneSignal asignado:", await pushResp.text());
          }
        }
      }

      results.push(`Notificado asignado: ${assignedTo}`);
    }

    // ─── 2. Notificar al creador si la tarea fue completada ───
    if (eventType === "UPDATE" && isCompleted && !wasCompleted && createdBy && createdBy !== assignedTo) {
      const completedTitle = "Tarea completada";
      const completedMsg = `La tarea "${taskTitle}" ha sido marcada como completada`;
      const targetPath = `/tasks/${taskId}`;

      // Insertar en bandeja interna
      const { error: notifError } = await supabase.from("notifications").insert({
        company_id: companyId,
        user_id: createdBy,
        title: completedTitle,
        body: completedMsg,
        text: completedMsg,
        type: "success",
        path: targetPath,
        read: false,
        created_at: new Date().toISOString(),
      });

      if (notifError) {
        console.error("[OnTaskAssigned] Error al insertar notificación creador:", notifError);
      }

      // Enviar Push OneSignal al creador
      if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
        const { data: creatorUsers } = await supabase
          .from("users")
          .select("onesignal_player_id, fcm_token")
          .eq("id", createdBy);

        const playerId =
          (creatorUsers || [])[0]?.onesignal_player_id || (creatorUsers || [])[0]?.fcm_token;

        if (playerId) {
          const pushPayload: Record<string, unknown> = {
            app_id: ONESIGNAL_APP_ID,
            include_player_ids: [playerId],
            headings: { en: `✅ ${completedTitle}` },
            contents: { en: `${companyName}: ${completedMsg}` },
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
            console.error("[OnTaskAssigned] Error OneSignal creador:", await pushResp.text());
          }
        }
      }

      results.push(`Notificado creador: ${createdBy}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[OnTaskAssigned] Error inesperado:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
