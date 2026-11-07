// Supabase Edge Function — On Task Assigned
// Notifica al usuario cuando se le asigna una tarea y al creador cuando se completa.
// Disparado por el trigger `trg_task_assigned_webhook` (PostgreSQL) vía pg_net.
//
// 1) Inserta una fila en la tabla `notifications` (bandeja interna de la app).
// 2) Envía una notificación push en tiempo real vía Web Push API.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isAuthorizedWebhook, unauthorizedWebhookResponse } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!serviceRole) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
}

const supabase = createClient(SUPABASE_URL, serviceRole);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAuthorizedWebhook(req)) return unauthorizedWebhookResponse();

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

      // Enviar Push vía send-push al asignado
      const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: assignedTo,
          title: `📌 ${notifTitle}`,
          body: assignmentMsg,
          data: { path: targetPath },
        }),
      });

      if (!pushResp.ok) {
        console.error("[OnTaskAssigned] Error send-push asignado:", await pushResp.text());
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

      // Enviar Push vía send-push al creador
      const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: createdBy,
          title: `✅ ${completedTitle}`,
          body: completedMsg,
          data: { path: targetPath },
        }),
      });

      if (!pushResp.ok) {
        console.error("[OnTaskAssigned] Error send-push creador:", await pushResp.text());
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
