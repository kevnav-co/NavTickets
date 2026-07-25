const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { sendAndCreateNotification, notifyClientWithFallback } = require("./notificationManager");
const { getMaintenanceEmail, getWarrantyEmail } = require("./emailTemplates");

/**
 * Carga la configuración de branding de una empresa.
 */
async function getCompanyBranding(db, companyId) {
  try {
    const snap = await db.collection("companies").doc(companyId).get();
    if (snap.exists) {
      const data = snap.data();
      return {
        name: data.name || 'Empresa',
        primaryColor: data.theme?.primaryColor || '#7b1113',
        logoUrl: data.theme?.logoUrl || '',
        whatsappNumber: data.whatsappNumber || '573117142337',
      };
    }
  } catch (e) {
    console.warn(`[expirationCheck] Error loading company ${companyId}:`, e.message);
  }
  return { name: 'Empresa', primaryColor: '#7b1113', logoUrl: '', whatsappNumber: '573117142337' };
}

/**
 * Obtiene el mapa de companyId → branding para todas las empresas.
 */
async function loadAllCompanyBrandings(db) {
  const brandings = {};
  try {
    const snapshot = await db.collection("companies").get();
    snapshot.forEach(doc => {
      const data = doc.data();
      brandings[doc.id] = {
        name: data.name || 'Empresa',
        primaryColor: data.theme?.primaryColor || '#7b1113',
        logoUrl: data.theme?.logoUrl || '',
        whatsappNumber: data.whatsappNumber || '573117142337',
      };
    });
  } catch (e) {
    console.warn('[expirationCheck] Error loading companies:', e.message);
  }
  return brandings;
}

/**
 * Función programada que se ejecuta cada 24 horas a las 8:00 AM.
 * Revisa vencimientos de mantenimiento y garantías para todas las empresas.
 */
async function runExpirationCheckLogic() {
  const db = getFirestore();
  const now = new Date();

  // Rango de aviso: 7 días antes
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 7);

  console.log("--- INICIANDO ESCANEO DE VENCIMIENTOS (multi-tenant) ---");

  // Load branding for all companies
  const brandings = await loadAllCompanyBrandings(db);

  // 1. REVISAR MANTENIMIENTO DE EQUIPOS — query all, group by companyId
  const equipmentQuery = db.collection("equipment")
    .where("status", "==", "Activa")
    .where("nextMaintenanceNotificationSent", "==", false);

  const equipmentDocs = await equipmentQuery.get();

  for (const doc of equipmentDocs.docs) {
    const eq = doc.data();
    if (!eq.lastMaintenanceDate || !eq.maintenanceFrequency) continue;

    const companyId = eq.companyId || 'default';
    const branding = brandings[companyId] || { name: 'Empresa', primaryColor: '#7b1113', logoUrl: '', whatsappNumber: '573117142337' };

    const lastDate = new Date(eq.lastMaintenanceDate);
    const dueDate = new Date(lastDate);
    dueDate.setMonth(lastDate.getMonth() + eq.maintenanceFrequency);

    if (dueDate <= nextWeek) {
      const title = "Mantenimiento Próximo";
      const body = `El equipo ${eq.name} (${eq.brand}) necesita mantenimiento el ${dueDate.toLocaleDateString()}.`;
      const path = `/equipment/${doc.id}`;

      // Notificar a los admins de la misma empresa
      const adminsSnapshot = await db.collection("users")
        .where("role", "==", "admin")
        .where("companyId", "==", companyId)
        .get();

      for (const adminDoc of adminsSnapshot.docs) {
        await sendAndCreateNotification(adminDoc.id, title, body, path, null, companyId);
      }

      // Notificar al cliente con branding de la empresa
      if (eq.clientId) {
        const clientDoc = await db.collection("clients").doc(eq.clientId).get();
        const clientData = clientDoc.data() || { name: "Estimado Cliente" };

        const clientSubject = `Aviso: Mantenimiento Preventivo - ${eq.name}`;
        const clientBody = `Hola ${clientData.name},\n\nLe recordamos que su equipo ${eq.name} tiene un mantenimiento programado para el ${dueDate.toLocaleDateString("es-ES")}. Por favor contáctenos para agendar.`;

        const clientHtmlBody = getMaintenanceEmail({
          clientName: clientData.name,
          machineName: eq.name,
          serialNumber: eq.serialNumber,
          location: eq.location,
          dueDate: dueDate.toLocaleDateString("es-ES", { day: 'numeric', month: 'long', year: 'numeric' })
        }, branding);

        await notifyClientWithFallback(eq.clientId, {
          title: clientSubject,
          body: clientBody,
          subject: clientSubject,
          htmlBody: clientHtmlBody
        }, companyId);
      }

      await doc.ref.update({ nextMaintenanceNotificationSent: true });
      console.log(`Alerta de mantenimiento enviada para: ${eq.name} (company: ${companyId})`);
    }
  }

  // 2. REVISAR VENCIMIENTO DE GARANTÍAS
  const ordersQuery = db.collection("orders")
    .where("status", "==", "CLOSED")
    .where("warrantyNotificationSent", "==", false);

  const orderDocs = await ordersQuery.get();

  for (const doc of orderDocs.docs) {
    const order = doc.data();
    if (!order.warrantyExpiration) continue;

    const companyId = order.companyId || 'default';
    const branding = brandings[companyId] || { name: 'Empresa', primaryColor: '#7b1113', logoUrl: '', whatsappNumber: '573117142337' };

    const expirationDate = new Date(order.warrantyExpiration);

    // Avisar 5 días antes de que expire
    const warningBuffer = new Date();
    warningBuffer.setDate(now.getDate() + 5);

    if (expirationDate <= warningBuffer) {
      const title = "Garantía por Vencer";
      const body = `La garantía de la orden #${order.orderNumber} vence el ${expirationDate.toLocaleDateString()}.`;
      const path = `/orders/${doc.id}`;

      // Notificar a los admins de la misma empresa
      const adminsSnapshot = await db.collection("users")
        .where("role", "==", "admin")
        .where("companyId", "==", companyId)
        .get();

      for (const adminDoc of adminsSnapshot.docs) {
        await sendAndCreateNotification(adminDoc.id, title, body, path, null, companyId);
      }

      // Notificar al cliente con branding de la empresa
      if (order.clientId) {
        const clientDoc = await db.collection("clients").doc(order.clientId).get();
        const clientData = clientDoc.data() || { name: "Estimado Cliente" };

        const clientSubject = `Aviso de Garantía - Orden #${order.orderNumber}`;
        const clientBody = `Hola ${clientData.name}, te informamos que la garantía de tu servicio #${order.orderNumber} vence el ${expirationDate.toLocaleDateString("es-ES")}.`;

        const clientHtmlBody = getWarrantyEmail({
          clientName: clientData.name,
          orderNumber: order.orderNumber,
          machineName: order.equipmentName || "Equipo de Cocina",
          expirationDate: expirationDate.toLocaleDateString("es-ES", { day: 'numeric', month: 'long', year: 'numeric' })
        }, branding);

        await notifyClientWithFallback(order.clientId, {
          title: "Vencimiento de Garantía",
          body: clientBody,
          subject: clientSubject,
          htmlBody: clientHtmlBody
        }, companyId);
      }

      await doc.ref.update({ warrantyNotificationSent: true });
      console.log(`Alerta de garantía enviada para orden: ${order.orderNumber} (company: ${companyId})`);
    }
  }

  console.log("--- ESCANEO FINALIZADO ---");
  return { success: true };
}

exports.dailyExpirationCheck = onSchedule("0 8 * * *", async (event) => {
  await runExpirationCheckLogic();
});

const { onRequest } = require("firebase-functions/v2/https");
exports.triggerExpirationCheck = onRequest({ cors: true }, async (req, res) => {
  try {
    await runExpirationCheckLogic();
    res.status(200).json({ message: "Escaneo forzado ejecutado con éxito." });
  } catch (error) {
    console.error("Error en triggerExpirationCheck:", error);
    res.status(500).json({ error: error.message });
  }
});