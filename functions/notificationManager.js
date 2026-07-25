const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

const db = admin.firestore();
const messaging = admin.messaging();

const DEFAULT_APP_URL = "https://navas-33818730-80986.web.app/#";
const DEFAULT_ICON = "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Inicio.png?alt=media&token=b516cd08-2ece-445d-ac69-0b91d444d78f";

/**
 * Obtiene la configuración de una empresa por su ID.
 * @param {string} companyId
 * @returns {Promise<{name: string, logoUrl: string, theme: {primaryColor: string}}>}
 */
async function getCompanyConfig(companyId) {
  if (!companyId || companyId === 'default') return { name: 'NavTickets', logoUrl: DEFAULT_ICON, theme: { primaryColor: '#7b1113' } };
  try {
    const snap = await db.collection("companies").doc(companyId).get();
    if (snap.exists) {
      const data = snap.data();
      return {
        name: data.name || 'Empresa',
        logoUrl: data.theme?.logoUrl || DEFAULT_ICON,
        theme: { primaryColor: data.theme?.primaryColor || '#7b1113' },
      };
    }
  } catch (e) {
    console.warn(`[getCompanyConfig] Error reading company ${companyId}:`, e.message);
  }
  return { name: 'Empresa', logoUrl: DEFAULT_ICON, theme: { primaryColor: '#7b1113' } };
}

/**
 * Creates a notification document in Firestore and sends a push notification via FCM.
 * @param {string} userId - The ID of the user to notify.
 * @param {string} title - The title of the notification.
 * @param {string} body - The main content of the notification.
 * @param {string} path - The deep link path for the notification.
 * @param {string|null} forcedId - Optional forced notification ID.
 * @param {string|null} companyId - Optional companyId (auto-looked up from user if not provided).
 */
const sendAndCreateNotification = async (userId, title, body, path, forcedId = null, companyId = null) => {
  if (!userId) {
    console.error("sendAndCreateNotification failed: userId is missing.");
    return;
  }

  // Resolve companyId from user if not provided
  if (!companyId) {
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        companyId = userDoc.data().companyId || 'default';
      }
    } catch (e) {
      console.warn(`[notificationManager] Could not resolve companyId for user ${userId}:`, e.message);
      companyId = 'default';
    }
  }

  // Get company config for branding
  const company = await getCompanyConfig(companyId);

  const notificationId = forcedId || uuidv4();
  const notificationPayload = {
    id: notificationId,
    userId: userId,
    companyId: companyId,
    title,
    body,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    type: 'info',
    path,
  };

  try {
    await db.collection("notifications").doc(notificationId).set(notificationPayload);
    console.log(`Internal notification '${title}' created for user ${userId} (company: ${companyId}).`);
  } catch (error) {
    console.error(`Failed to create internal notification for user ${userId}:`, error);
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    console.warn(`User ${userId} not found, skipping push notification.`);
    return;
  }

  const appUrl = company.name ? `https://navas-33818730-80986.web.app/#` : DEFAULT_APP_URL;
  const iconUrl = company.logoUrl || DEFAULT_ICON;

  const fcmToken = userDoc.data()?.fcmToken;
  if (fcmToken) {
    const fullUrl = path.startsWith('http') ? path : `${appUrl}${path}`;

    const message = {
      token: fcmToken,
      notification: { title, body },
      data: {
        url: fullUrl,
        path: path,
        type: 'assignment'
      },
      webpush: {
        fcm_options: {
          link: fullUrl
        },
        notification: {
          icon: iconUrl,
          badge: iconUrl
        }
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
        },
      },
    };
    try {
      await messaging.send(message);
      console.log(`Push notification sent successfully to user ${userId}.`);
    } catch (error) {
      const errorCode = error.code || error.errorInfo?.code || '';
      console.error(`Failed to send FCM message to user ${userId} (code: ${errorCode}):`, error.message);

      // Auto-clean invalid/expired tokens
      if (errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token') {
        console.warn(`[FCM] Token inválido para usuario ${userId}. Limpiando token de Firestore.`);
        try {
          await db.collection("users").doc(userId).update({
            fcmToken: admin.firestore.FieldValue.delete()
          });
        } catch (cleanupError) {
          console.error(`[FCM] Error al limpiar token de usuario ${userId}:`, cleanupError);
        }
      }
    }
  } else {
    console.log(`User ${userId} does not have an FCM token. Skipping push notification.`);
  }
};

exports.sendAndCreateNotification = sendAndCreateNotification;

/**
 * Triggered on order document write. Sends a notification if the technician is changed or assigned.
 */
exports.onorderassigned = onDocumentWritten("orders/{orderId}", async (event) => {
  const orderId = event.params.orderId;
  console.log(`[ORDER-NOTIFY] ========== Trigger disparado para orden: ${orderId} ==========`);

  const snapshotAfter = event.data?.after;
  const snapshotBefore = event.data?.before;

  console.log(`[ORDER-NOTIFY] before.exists: ${snapshotBefore?.exists}, after.exists: ${snapshotAfter?.exists}`);

  const orderDataAfter = snapshotAfter?.data();
  const orderDataBefore = snapshotBefore?.exists ? snapshotBefore.data() : null;

  if (!orderDataAfter) {
    console.log(`[ORDER-NOTIFY] Documento eliminado. Saliendo.`);
    return;
  }

  const technicianId = orderDataAfter.technicianId;
  const oldTechnicianId = orderDataBefore ? orderDataBefore.technicianId : null;
  const isNewDocument = !snapshotBefore?.exists;

  console.log(`[ORDER-NOTIFY] isNewDocument: ${isNewDocument}`);
  console.log(`[ORDER-NOTIFY] technicianId: "${technicianId}", oldTechnicianId: "${oldTechnicianId}"`);
  console.log(`[ORDER-NOTIFY] orderNumber: ${orderDataAfter.orderNumber}, clientId: ${orderDataAfter.clientId}`);

  // Notify if the technician is newly assigned or changed
  if (technicianId && technicianId !== oldTechnicianId) {
    console.log(`[ORDER-NOTIFY] ✅ Condición cumplida: técnico nuevo o cambiado. Preparando notificación...`);

    let clientName = "un cliente";
    if (orderDataAfter.clientId) {
      try {
        const clientDoc = await db.collection("clients").doc(orderDataAfter.clientId).get();
        if (clientDoc.exists) {
          clientName = clientDoc.data()?.name || "un cliente";
        }
      } catch (clientError) {
        console.error(`[ORDER-NOTIFY] Error al buscar cliente ${orderDataAfter.clientId}:`, clientError);
      }
    }

    const title = isNewDocument ? "Nueva Orden Asignada" : "Cambio de Asignación";
    const body = `Se te ha asignado la orden #${orderDataAfter.orderNumber} para ${clientName}.`;
    const path = `/orders/${orderId}`;
    const notificationId = `assignment_order_${orderId}_${technicianId}`;

    console.log(`[ORDER-NOTIFY] Enviando: title="${title}", to="${technicianId}", notifId="${notificationId}"`);

    try {
      await sendAndCreateNotification(technicianId, title, body, path, notificationId);
      console.log(`[ORDER-NOTIFY] ✅ sendAndCreateNotification completado exitosamente.`);
    } catch (notifError) {
      console.error(`[ORDER-NOTIFY] ❌ Error en sendAndCreateNotification:`, notifError);
    }
  } else {
    console.log(`[ORDER-NOTIFY] ⏭️ Sin cambio de técnico. technicianId="${technicianId}", oldTechnicianId="${oldTechnicianId}". No se envía notificación.`);
  }

  console.log(`[ORDER-NOTIFY] ========== Fin del trigger para orden: ${orderId} ==========`);
});

/**
 * Triggered on task document write. Sends a notification if the assignee is newly assigned or changed.
 */
exports.ontaskassigned = onDocumentWritten("tasks/{taskId}", async (event) => {
  const taskDataAfter = event.data?.after.data();
  const taskDataBefore = event.data?.before.data();

  // Exit if the document was deleted.
  if (!taskDataAfter) {
    console.log(`Task notification trigger: Ignoring DELETE event for task ${event.params.taskId}.`);
    return;
  }

  const assigneeId = taskDataAfter.assignedTo;
  const oldAssigneeId = taskDataBefore ? taskDataBefore.assignedTo : null;

  // Send a notification if:
  // 1. A new task is created with an assignee.
  // 2. An existing task's assignee changes.
  if (assigneeId && assigneeId !== oldAssigneeId) {
    console.log(`Task assignment changed or created for task ${event.params.taskId}. Sending notification to ${assigneeId}.`);
    const title = !taskDataBefore ? "Nueva Tarea Asignada" : "Cambio de Asignación";
    const body = `Se te ha asignado la tarea: '''${taskDataAfter.title || "una nueva tarea"}'''.`;
    const path = "/tasks";
    const notificationId = `assignment_task_${event.params.taskId}_${assigneeId}`;
    await sendAndCreateNotification(assigneeId, title, body, path, notificationId);
  } else {
    console.log(`Task assignment did not change for task ${event.params.taskId}. No notification sent.`);
  }
});

const { sendWhatsAppMessage, sendEmailMessage } = require("./communicationChannels");

/**
 * Notifica a un cliente con una lógica de fallback: WhatsApp -> Email -> Alerta a Admins.
 * @param {string} clientId - ID del cliente.
 * @param {Object} options - { title, body, subject, htmlBody }
 */
const notifyClientWithFallback = async (clientId, { title, body, subject, htmlBody }, companyId = null) => {
  const db = admin.firestore();
  const clientDoc = await db.collection("clients").doc(clientId).get();

  if (!clientDoc.exists) {
    console.error(`Cliente ${clientId} no existe. No se puede notificar.`);
    return;
  }

  const client = clientDoc.data();
  const resolvedCompanyId = companyId || client.companyId || 'default';
  let notified = false;

  // 1. Intentar WhatsApp
  if (client.contact) {
    const success = await sendWhatsAppMessage(client.contact, body);
    if (success) notified = true;
  }

  // 2. Intentar Email si falla WhatsApp
  if (!notified && client.email) {
    const success = await sendEmailMessage(client.email, subject || title, body, htmlBody);
    if (success) notified = true;
  }

  // 3. Si ambos fallan, alertar a los administradores de la misma empresa
  if (!notified) {
    console.warn(`No se pudo notificar al cliente ${client.name} (${clientId}). Enviando alerta a admins.`);
    const adminsSnapshot = await db.collection("users")
      .where("role", "==", "admin")
      .where("companyId", "==", resolvedCompanyId)
      .get();
    const adminAlertTitle = "⚠️ Fallo de Notificación";
    const adminAlertBody = `No se pudo enviar el aviso de vencimiento a ${client.name} por falta de teléfono o email registrados.`;

    for (const adminDoc of adminsSnapshot.docs) {
      await sendAndCreateNotification(adminDoc.id, adminAlertTitle, adminAlertBody, `/clients/${clientId}`, null, resolvedCompanyId);
    }
  }
};

exports.notifyClientWithFallback = notifyClientWithFallback;
