/**
 * Script de prueba para validar el envío de correos electrónicos vía Gmail/Nodemailer.
 * Ejecución: node functions/test-email-v2.js [email_destino]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { sendEmailMessage } = require('./communicationChannels');

async function testEmail() {
  const recipient = process.argv[2] || process.env.GMAIL_USER;
  
  if (!recipient) {
    console.error('❌ Error: No se especificó email de destino y GMAIL_USER no está en .env');
    process.exit(1);
  }

  console.log(`\n--- INICIANDO TEST DE EMAIL ---`);
  console.log(`Destinatario: ${recipient}`);
  console.log(`Remitente (GMAIL_USER): ${process.env.GMAIL_USER}`);
  
  const subject = "Prueba de Notificación - Sistema de Gestión";
  const body = "Este es un correo de prueba para validar la integración con Gmail.\nSi estás viendo esto, el servicio de mensajería está configurado correctamente.";
  
  const htmlBody = `
    <h2 style="color: #1a1a1a;">¡Hola!</h2>
    <p>Este es un correo de <strong>prueba</strong> enviado desde el sistema de gestión.</p>
    <p>Estamos verificando que el diseño de las notificaciones se vea bien en tu bandeja de entrada.</p>
    <div style="margin: 20px 0;">
      <p><strong>Detalles del Test:</strong></p>
      <ul style="color: #444;">
        <li>Servicio: Gmail/Nodemailer</li>
        <li>Estado: OK 🟢</li>
      </ul>
    </div>
  `;

  try {
    const success = await sendEmailMessage(recipient, subject, body, htmlBody);
    
    if (success) {
      console.log('✅ TEST FINALIZADO: El correo ha sido enviado con éxito.');
    } else {
      console.error('❌ TEST FALLIDO: Hubo un error al enviar el correo. Revisa las credenciales en .env');
    }
  } catch (error) {
    console.error('❌ ERROR CRÍTICO durante el test:', error);
  }
}

testEmail();
