const twilio = require('twilio');
const nodemailer = require('nodemailer');

/**
 * Módulo para gestionar los canales de comunicación externos.
 * Soporta branding dinámico multi-tenant (company name, logo, WhatsApp number).
 */

/**
 * Envía un mensaje de WhatsApp.
 * @param {string} phone - Número de teléfono del destinatario.
 * @param {string} body - Contenido del mensaje.
 * @returns {Promise<boolean>} - True si el envío fue exitoso.
 */
async function sendWhatsAppMessage(phone, body) {
  if (!phone) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'; // Sandbox por defecto

  if (!accountSid || !authToken) {
    console.log(`[STUB] No hay credenciales de Twilio. WhatsApp a ${phone}: ${body}`);
    return true;
  }

  try {
    const client = twilio(accountSid, authToken);
    // El número de destino debe incluir "whatsapp:" prefix
    const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    await client.messages.create({ body, from, to });
    console.log(`WhatsApp enviado exitosamente a ${phone}`);
    return true;
  } catch (error) {
    console.error(`Error al enviar WhatsApp a ${phone}:`, error);
    return false;
  }
}

/**
 * Genera una plantilla HTML base para correos electrónicos con branding dinámico.
 * @param {Object} options - Opciones de branding.
 * @param {string} options.companyName - Nombre de la empresa.
 * @param {string} options.logoUrl - URL del logo de la empresa.
 * @param {string} options.subject - Asunto del correo.
 * @param {string} options.content - Contenido HTML del cuerpo.
 * @param {string} options.primaryColor - Color principal (hex).
 * @param {string} options.whatsappNumber - Número de WhatsApp para contacto.
 * @returns {string} - HTML completo del correo.
 */
function buildEmailTemplate({ companyName, logoUrl, subject, content, primaryColor, whatsappNumber }) {
  const name = companyName || 'Empresa';
  const logo = logoUrl || 'https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Inicio.png?alt=media&token=b516cd08-2ece-445d-ac69-0b91d444d78f';
  const color = primaryColor || '#7b1113';
  const waNumber = whatsappNumber || '573133788705';

  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 20px; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee;">
        <!-- Header -->
        <div style="background-color: #fdfdfd; padding: 30px; text-align: center; border-bottom: 1px solid #f0f0f0;">
          <img src="${logo}" alt="${name}" style="max-height: 100px; width: auto;">
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h1 style="font-size: 20px; margin-bottom: 24px; color: #1a1a1a; text-align: center;">${subject}</h1>
          <div style="font-size: 16px; line-height: 1.6; color: #444;">
            ${content}
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 30px; background-color: #fafafa; border-top: 1px solid #f0f0f0; text-align: center;">
          <p style="margin: 0 0 15px 0; font-size: 14px; color: #555; font-weight: bold;">
            ⚠️ El mantenimiento se debe agendar directamente por WhatsApp.
          </p>
          <div style="margin-bottom: 20px;">
             <a href="https://wa.me/${waNumber}" style="display: inline-block; background-color: #25D366; color: white; padding: 12px 25px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 14px; box-shadow: 0 2px 5px rgba(37,211,102,0.3);">
                Agendar por WhatsApp: +${waNumber}
             </a>
          </div>
          <p style="margin: 20px 0 10px 0; font-size: 12px; color: #999; font-style: italic;">
            Este es un correo informativo generado automáticamente. Por favor, <strong>no respondas a este mensaje</strong>.
          </p>
          <p style="margin: 0; font-size: 12px; color: #bbb;">&copy; 2026 ${name} - Servicios Industriales</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Envía un correo electrónico usando Gmail (Nodemailer) con branding dinámico.
 * @param {string} email - Dirección de correo electrónico.
 * @param {string} subject - Asunto del correo.
 * @param {string} body - Contenido del mensaje (Texto plano).
 * @param {string} [htmlBody] - Contenido HTML opcional. Si no se provee, se genera uno desde el body.
 * @param {Object} [branding] - Opciones de branding { companyName, logoUrl, primaryColor, whatsappNumber }.
 * @returns {Promise<boolean>} - True si el envío fue exitoso.
 */
async function sendEmailMessage(email, subject, body, htmlBody = null, branding = {}) {
  if (!email) return false;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.log(`[STUB] No hay credenciales de Gmail. Email a ${email}: [${subject}] ${body}`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const contentToUse = htmlBody || body.replace(/\n/g, '<br>');
    const htmlTemplate = buildEmailTemplate({
      companyName: branding.companyName || 'Empresa',
      logoUrl: branding.logoUrl,
      subject: subject,
      content: contentToUse,
      primaryColor: branding.primaryColor,
      whatsappNumber: branding.whatsappNumber,
    });

    const companyName = branding.companyName || 'Empresa';

    await transporter.sendMail({
      from: `"${companyName}" <${gmailUser}>`,
      to: email,
      subject: subject,
      html: htmlTemplate,
      text: body
    });

    console.log(`Email enviado exitosamente via Gmail a ${email} (branding: ${companyName})`);
    return true;
  } catch (error) {
    console.error(`Error al enviar Email via Gmail a ${email}:`, error);
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendEmailMessage,
  buildEmailTemplate
};