const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const { notifyClientWithFallback } = require("./notificationManager");
const { getMaintenanceEmail, getWarrantyEmail } = require("./emailTemplates");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

/**
 * Script de prueba para validar el sistema de notificaciones premium.
 * Simula el flujo que ocurriría en expirationCheck.js
 */
async function testPremiumFlow() {
  console.log("🚀 Iniciando prueba de flujo premium...");

  const testEmail = process.argv[2] || "pnavas@gmail.com";
  const clientId = "TEST_CLIENT_PREMIUM";

  // Mock de datos del cliente
  const clientData = {
    name: "Test User",
    email: testEmail,
    contact: "+573117142337" 
  };

  console.log(`📧 Enviando correos de prueba a: ${testEmail}`);

  // 1. Simular Notificación de Mantenimiento
  const maintenanceData = {
    clientName: clientData.name,
    machineName: "Horno Rational iCombi Pro",
    serialNumber: "RAT-2024-X99",
    location: "Sede Principal - Cocina 1",
    dueDate: "20 de Abril, 2026"
  };

  const maintHtml = getMaintenanceEmail(maintenanceData);
  const maintSubject = "⚠️ Recordatorio: Mantenimiento Preventivo Rational";

  console.log("- Probando plantilla de Mantenimiento...");
  await notifyClientWithFallback(clientId, {
    title: maintSubject,
    body: `Hola ${clientData.name}, tu equipo ${maintenanceData.machineName} requiere mantenimiento.`,
    subject: maintSubject,
    htmlBody: maintHtml
  });

  // 2. Simular Notificación de Garantía
  const warrantyData = {
    clientName: clientData.name,
    orderNumber: "8842",
    machineName: "Lavavajillas Winterhalter",
    expirationDate: "15 de Mayo, 2026"
  };

  const warrantyHtml = getWarrantyEmail(warrantyData);
  const warrantySubject = "ℹ️ Aviso Importante: Garantía Próxima a Vencer";

  console.log("- Probando plantilla de Garantía...");
  await notifyClientWithFallback(clientId, {
    title: warrantySubject,
    body: `Hola ${clientData.name}, la garantía de tu orden ${warrantyData.orderNumber} vence pronto.`,
    subject: warrantySubject,
    htmlBody: warrantyHtml
  });

  console.log("✅ Pruebas finalizadas. Si notifyClientWithFallback funciona, los correos deberían estar en camino.");
}

// Nota: Para que esto funcione fuera de Firebase, mockeamos la respuesta de Firestore
// ya que clientId "TEST_CLIENT_PREMIUM" no existe realmente.
const originalGet = admin.firestore().collection("clients").doc;
admin.firestore().collection("clients").doc = (id) => {
    if (id === "TEST_CLIENT_PREMIUM") {
        return {
            get: async () => ({
                exists: true,
                data: () => ({
                    name: "Test User",
                    email: process.argv[2] || "pnavas@gmail.com"
                })
            })
        };
    }
    return originalGet.call(admin.firestore().collection("clients"), id);
};

testPremiumFlow().catch(console.error);
