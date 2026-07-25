/**
 * Módulo de plantillas de correo electrónico Premium con branding multi-tenant.
 * Acepta datos de branding: { companyName, companyLogo, primaryColor, whatsappNumber }
 */

/**
 * Genera el HTML para la notificación de Mantenimiento Preventivo.
 * @param {Object} data - { clientName, machineName, serialNumber, location, dueDate }
 * @param {Object} [branding] - { companyName, companyLogo, primaryColor, whatsappNumber }
 */
const getMaintenanceEmail = (data, branding = {}) => {
  const { clientName, machineName, serialNumber, location, dueDate } = data;
  const name = branding.companyName || 'Empresa';
  const color = branding.primaryColor || '#d32f2f';
  const waNumber = branding.whatsappNumber || '573117142337';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background-color: ${color}; color: white; padding: 25px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase;">Mantenimiento Preventivo</h1>
      </div>

      <div style="padding: 35px; line-height: 1.7; background-color: #ffffff;">
        <p style="font-size: 18px;">Estimado/a <strong>${clientName}</strong>,</p>

        <p>En <strong>${name}</strong> nos preocupamos por la salud de su equipamiento. Nuestro sistema indica que su equipo ha alcanzado la fecha recomendada para su revisión técnica.</p>

        <div style="background-color: #fafafa; border: 1px solid #f0f0f0; border-left: 6px solid ${color}; padding: 20px; margin: 30px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; color: ${color}; font-size: 15px; text-transform: uppercase; margin-bottom: 15px;">Detalles del Equipo</h3>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Modelo:</strong> ${machineName}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Serial:</strong> ${serialNumber || 'N/A'}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Ubicación:</strong> ${location || 'N/A'}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: ${color};">Vencimiento:</strong> ${dueDate}</p>
        </div>

        <div style="background-color: #fff9db; border: 1px solid #ffe066; color: #664d03; padding: 15px; border-radius: 6px; margin-bottom: 30px; font-size: 14px;">
           <strong>Nota Importante:</strong> Este servicio debe ser coordinado directamente vía WhatsApp para agendar la visita de nuestro personal técnico.
        </div>

        <p style="text-align: center; font-weight: bold; margin-bottom: 30px;">¿Desea agendar la visita técnica ahora?</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="https://wa.me/${waNumber}?text=Hola,%20quisiera%20agendar%20un%20mantenimiento%20para%20${encodeURIComponent(machineName)}" style="background-color: #25d366; color: white; padding: 16px 35px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);">
            Agendar por WhatsApp
          </a>
        </div>

        <p style="font-size: 13px; color: #666; font-style: italic; margin-top: 40px; text-align: center;">Un mantenimiento preventivo a tiempo evita reparaciones costosas y paros inesperados.</p>

        <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0 20px 0;">

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #999; margin: 5px 0;">${name} - Soluciones Profesionales</p>
          <p style="font-size: 11px; color: #aaa; margin: 5px 0;">WhatsApp: ${waNumber}</p>
        </div>
      </div>
    </div>
  `;
};

/**
 * Genera el HTML para la notificación de Vencimiento de Garantía.
 * @param {Object} data - { clientName, orderNumber, machineName, expirationDate }
 * @param {Object} [branding] - { companyName, companyLogo, primaryColor, whatsappNumber }
 */
const getWarrantyEmail = (data, branding = {}) => {
  const { clientName, orderNumber, machineName, expirationDate } = data;
  const name = branding.companyName || 'Empresa';
  const color = branding.primaryColor || '#1976d2';
  const waNumber = branding.whatsappNumber || '573117142337';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background-color: ${color}; color: white; padding: 25px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase;">Aviso de Garantía</h1>
      </div>

      <div style="padding: 35px; line-height: 1.7; background-color: #ffffff;">
        <p style="font-size: 18px;">Hola <strong>${clientName}</strong>,</p>

        <p>Le informamos que la garantía de su servicio técnico/equipo está próxima a vencer. Queremos asegurarnos de que todo funcione perfectamente antes de que el periodo de cobertura finalice.</p>

        <div style="background-color: #f1f8ff; border: 1px solid #e1f5fe; border-left: 6px solid ${color}; padding: 20px; margin: 30px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; color: ${color}; font-size: 15px; text-transform: uppercase; margin-bottom: 15px;">Detalles de la Garantía</h3>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Orden:</strong> #${orderNumber}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Referencia:</strong> ${machineName}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: ${color};">Fecha de Expiración:</strong> ${expirationDate}</p>
        </div>

        <p>Si ha notado algún funcionamiento inusual, este es el momento ideal para reportarlo y hacer valer su garantía.</p>

        <div style="text-align: center; margin: 35px 0;">
          <a href="https://wa.me/${waNumber}?text=Hola,%20tengo%20una%20duda%20sobre%20la%20garantia%20de%20mi%20orden%20${orderNumber}" style="background-color: ${color}; color: white; padding: 16px 35px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
            Contactar Soporte Técnico
          </a>
        </div>

        <p style="font-size: 13px; color: #666; text-align: center; margin-top: 30px;">Gracias por confiar en <strong>${name}</strong>.</p>

        <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0 20px 0;">

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #999; margin: 5px 0;">${name} - Soluciones Profesionales</p>
          <p style="font-size: 11px; color: #aaa; margin: 5px 0;">WhatsApp: ${waNumber}</p>
        </div>
      </div>
    </div>
  `;
};

module.exports = {
  getMaintenanceEmail,
  getWarrantyEmail
};