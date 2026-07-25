/**
 * Script de prueba para enviar una notificación de mantenimiento con datos reales.
 * Basado en la DIRECTIVA: ENVIAR_TEST_MANTENIMIENTO_PREVENTIVO
 */

const path = require('path');
require('dotenv').config();
const { sendEmailMessage } = require('./communicationChannels');

async function sendSpecificTest() {
  const recipient = process.argv[2] || 'knavasov@gmail.com';
  
  console.log(`\n--- ENVIANDO CORREO DE MANTENIMIENTO (SOP) ---`);
  console.log(`Destinatario: ${recipient}`);

  const machineName = "FREIDORA DE ALTO RENDIMIENTO / 37 LITROS / CERETE";
  const serialNumber = "SN-0096";
  const clientName = "YERMY JULIAN ESPITIA LLORENTE (MAXI SHEN LONG)";
  const location = "CERETE, CERETE";
  const dueDate = "15 de Abril, 2026"; // Simulamos vencimiento cercano

  const subject = `AVISO: Mantenimiento Preventivo - ${machineName}`;
  
  const body = `Hola ${clientName},\n\nLe informamos que la máquina ${machineName} (Serial: ${serialNumber}) requiere mantenimiento preventivo. La fecha programada era el ${dueDate}.\n\nPara agendar su visita técnica, por favor contáctenos por WhatsApp.`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background-color: #d32f2f; color: white; padding: 25px; text-align: center;">
        <h1 style="margin: 0; font-size: 26px; letter-spacing: 1px;">Mantenimiento Preventivo</h1>
      </div>
      
      <div style="padding: 35px; line-height: 1.7;">
        <p style="font-size: 18px;">Estimado/a <strong>${clientName}</strong>,</p>
        
        <p>En <strong>Navas Máquinas</strong> nos preocupamos por la salud de su equipamiento. Nuestro sistema indica que su equipo ha alcanzado la fecha recomendada para su revisión técnica.</p>
        
        <div style="background-color: #fafafa; border: 1px solid #f0f0f0; border-left: 6px solid #d32f2f; padding: 20px; margin: 30px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #d32f2f; font-size: 16px; text-transform: uppercase;">Detalles del Equipo</h3>
          <p style="margin: 8px 0;"><strong>Modelo:</strong> ${machineName}</p>
          <p style="margin: 8px 0;"><strong>Serial:</strong> ${serialNumber}</p>
          <p style="margin: 8px 0;"><strong>Punto:</strong> ${location}</p>
          <p style="margin: 8px 0;"><strong style="color: #d32f2f;">Vencimiento:</strong> ${dueDate}</p>
        </div>

        <div style="background-color: #fff9db; border: 1px solid #ffe066; color: #664d03; padding: 15px; border-radius: 6px; margin-bottom: 30px; display: flex; align-items: center;">
           <span style="font-size: 20px; margin-right: 15px;">⚠️</span>
           <span><strong>Acción necesaria:</strong> Este servicio debe ser coordinado directamente vía WhatsApp.</span>
        </div>

        <p style="text-align: center; font-weight: bold; margin-bottom: 25px;">¿Desea agendar la visita técnica ahora?</p>
        
        <div style="text-align: center; margin: 35px 0;">
          <a href="https://wa.me/573117142337" style="background-color: #25d366; color: white; padding: 18px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 5px 15px rgba(37, 211, 102, 0.3); font-size: 16px;">
            Agendar por WhatsApp
          </a>
        </div>

        <p style="font-size: 14px; color: #666; font-style: italic;">Un mantenimiento preventivo a tiempo evita reparaciones costosas y paros inesperados en su producción.</p>

        <hr style="border: 0; border-top: 1px solid #eee; margin: 45px 0 25px 0;">
        
        <div style="text-align: center;">
          <p style="font-size: 13px; color: #999; margin: 5px 0;">
            Navas Máquinas - Soluciones Gastronómicas Profesionales
          </p>
          <p style="font-size: 12px; color: #aaa; margin: 5px 0;">
            Montería, Córdoba | Cel: 311 7142337
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    const success = await sendEmailMessage(recipient, subject, body, htmlBody);
    if (success) {
      console.log('✅ EXITO: El correo de mantenimiento ha sido enviado.');
    } else {
      console.error('❌ ERROR: No se pudo enviar el correo.');
    }
  } catch (error) {
    console.error('❌ ERROR CRÍTICO:', error);
  }
}

sendSpecificTest();
