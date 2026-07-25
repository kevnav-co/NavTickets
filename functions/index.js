require("dotenv").config();
const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options for all functions
setGlobalOptions({ region: "us-central1" });

// --- API with Express and CORS ---
const app = express();
app.use(cors({ origin: true }));

// ===== RUTA DEFINITIVA PARA PROXY DE CUENTI =====
app.get(['/cuenti/clients', '/api/cuenti/clients'], async (req, res) => {
  const cuentiURL = 'https://app.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/ConsultarClientePaginado/1/0';
  console.log("--- INICIANDO PROXY A CUENTI (v2) ---");
  console.log(`URL de destino: ${cuentiURL}`);

  try {
    const cuentiResponse = await fetch(cuentiURL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Auth-Token': 'dEmafMDjPaYNJEY0eLlMi2OAz/lU04dIyk2v0JyyYyxvy78hhQDxDI5n4aR7549UiE6+g/F3awXQrs0BGYyCx83DT415xV4tkog89LYFFvJKOX9zaQYTstAAahJIjgTXu4hx10drd2s=',
        'X-Auth-Token-Empresa': '14507',
        'X-Auth-Token-Id-Usuario': '22736',
        'X-Auth-Token-Usuario': '22736'
      },
    });

    const responseBodyText = await cuentiResponse.text();
    console.log(`Respuesta cruda de Cuenti (status: ${cuentiResponse.status}):`, responseBodyText);

    if (!cuentiResponse.ok) {
      console.error('La API de Cuenti devolvió un error HTTP explícito.');
      return res.status(cuentiResponse.status).send(`Error from Cuenti API: ${responseBodyText}`);
    }

    let dataFromCuenti;
    try {
        dataFromCuenti = JSON.parse(responseBodyText);
    } catch (parseError) {
        console.error('Error fatal: La respuesta de Cuenti no es un JSON válido.', parseError);
        return res.status(500).send('La respuesta de Cuenti no pudo ser procesada como JSON.');
    }

    if (!Array.isArray(dataFromCuenti) && !dataFromCuenti.ConsultarClientePaginadoResult) {
        console.warn('Advertencia: La respuesta de Cuenti no es un Array ni contiene ConsultarClientePaginadoResult. Formato inesperado.');
    } else {
        console.log('¡ÉXITO! La respuesta de Cuenti es válida. Pasando datos al frontend.');
    }

    return res.status(200).json(dataFromCuenti);

  } catch (error) {
    console.error('Error fatal en la función de proxy de Cuenti:', error);
    res.status(500).send('Error interno del servidor al procesar la solicitud para Cuenti.');
  }
});
// ===== FIN DE LA RUTA =====

// Expose Express API as a single Cloud Function called "api"
exports.api = onRequest(app);

// --- Other functions ---
const notificationManager = require("./notificationManager");
exports.onorderassigned = notificationManager.onorderassigned;
exports.ontaskassigned = notificationManager.ontaskassigned;

const scheduledTasks = require("./scheduledTasks");
exports.taskScheduler = scheduledTasks.taskScheduler;

const expirationCheck = require("./expirationCheck");
exports.dailyExpirationCheck = expirationCheck.dailyExpirationCheck;
exports.triggerExpirationCheck = expirationCheck.triggerExpirationCheck;

exports.updateUserPassword = onCall({ cors: true }, async (request) => {
  const callerRole = request.auth?.token?.role;
  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const { userId, newPassword } = request.data;
  if (!userId || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Invalid request');
  }
  try {
    await admin.auth().updateUser(userId, { password: newPassword });
    return { success: true };
  } catch (error) {
    console.error("Error updating user password:", error);
    throw new HttpsError('internal', 'Error updating password.');
  }
});

// --- Test Push Notification (Developer / Admin only) ---
exports.sendTestNotification = onCall({ cors: true }, async (request) => {
  const callerRole = request.auth?.token?.role;
  if (callerRole !== 'developer' && callerRole !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo developer o admin pueden enviar push de prueba.');
  }

  const { userId } = request.data;
  if (!userId || typeof userId !== 'string') {
    throw new HttpsError('invalid-argument', 'Se requiere userId válido.');
  }

  const db = admin.firestore();
  const messaging = admin.messaging();

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { success: false, error: 'USER_NOT_FOUND', message: 'El usuario no existe en Firestore.' };
    }

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      return { 
        success: false, 
        error: 'NO_TOKEN', 
        message: 'El usuario no tiene un token FCM registrado. Debe activar notificaciones desde su dispositivo.',
        userName: userData?.name || 'Desconocido'
      };
    }

    // Resolve company branding for the user
    const companyId = userData?.companyId || 'default';
    let companyName = 'Empresa';
    let companyLogo = "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.appspot.com/o/public%2FIcon-app.png?alt=media&token=1d2f3a47-3949-41b8-a727-4659b5f5410c";
    try {
      const companySnap = await db.collection("companies").doc(companyId).get();
      if (companySnap.exists) {
        const compData = companySnap.data();
        companyName = compData.name || 'Empresa';
        companyLogo = compData.theme?.logoUrl || companyLogo;
      }
    } catch (e) {
      console.warn(`[sendTestNotification] Could not load company ${companyId}:`, e.message);
    }

    const appUrl = "https://navas-33818730-80986.web.app/#";
    const testTitle = `🔔 Test Push - ${companyName}`;
    const testBody = `Notificación de prueba enviada a ${userData?.name || 'usuario'}. Si ves esto, ¡las notificaciones funcionan correctamente!`;
    const testUrl = `${appUrl}/`;

    const message = {
      token: fcmToken,
      data: { url: testUrl, testPush: "true" },
      notification: { title: testTitle, body: testBody },
      webpush: {
        fcm_options: { link: testUrl },
        notification: {
          icon: companyLogo,
          badge: companyLogo,
        },
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: { title: testTitle, body: testBody },
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
        },
      },
    };

    await messaging.send(message);
    console.log(`[TEST PUSH] Notificación de prueba enviada exitosamente a ${userData?.name} (${userId}).`);

    return { 
      success: true, 
      message: `Push enviado exitosamente a ${userData?.name}.`,
      userName: userData?.name || 'Desconocido',
      tokenPreview: `${fcmToken.substring(0, 12)}...${fcmToken.substring(fcmToken.length - 8)}`
    };

  } catch (error) {
    console.error(`[TEST PUSH] Error enviando push de prueba a ${userId}:`, error);

    // Handle specific FCM errors
    const errorCode = error.code || error.errorInfo?.code || '';
    
    if (errorCode === 'messaging/registration-token-not-registered' || 
        errorCode === 'messaging/invalid-registration-token') {
      // Auto-clean invalid token
      await db.collection("users").doc(userId).update({ fcmToken: admin.firestore.FieldValue.delete() });
      return { 
        success: false, 
        error: 'INVALID_TOKEN', 
        message: 'El token FCM es inválido o expirado. Se ha eliminado automáticamente. El usuario debe reactivar las notificaciones.',
      };
    }

    return { 
      success: false, 
      error: 'SEND_FAILED', 
      message: `Error al enviar: ${error.message || 'Error desconocido'}` 
    };
  }
});
