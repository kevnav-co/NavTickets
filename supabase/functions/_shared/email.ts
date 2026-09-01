// Supabase Edge — compartido: envío de correo real vía Gmail SMTP (nodemailer).
// Deploy automático: import root `../_shared/email.ts` desde cada función.
//
// Lee GMAIL_USER / GMAIL_APP_PASSWORD de los secrets del proyecto (los mismos
// que las demás funciones de canal). Si no están configurados NO revienta la
// función: loguea un stub (misma convención que daily-expiration-check) y
// devuelve false para que el llamante pueda distinguir "sin canal" de "enviado".
//
// Se importa con import dinámico en el sender para que un fallo de carga del
// paquete npm:nodemailer en el runtime no tire abajo el request.

interface SendResult {
  ok: boolean;
  stub: boolean;
}

export async function sendRecoveryEmail(
  to: string,
  username: string,
  resetLink: string,
): Promise<SendResult> {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");

  if (!user || !pass) {
    console.log(
      `[Email] (stub) Recuperación de clave para "${username}" → ${to}: ${resetLink}`,
    );
    return { ok: true, stub: true };
  }

  const subject = "Recuperación de contraseña — NavTicket";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#7b1113;color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;">Recuperación de contraseña</h1>
      </div>
      <div style="background:#f9f9f9;padding:30px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <p style="font-size:16px;">Hola <strong>${username}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Para continuar, abre el siguiente enlace:</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${resetLink}" style="display:inline-block;background:#7b1113;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Restablecer contraseña</a>
        </p>
        <p style="font-size:13px;color:#999;">Este enlace es de un solo uso y expira en 30 minutos. Si no solicitaste este cambio, ignora este correo.</p>
        <p style="font-size:12px;color:#aaa;">O copia y pega en tu navegador: ${resetLink}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#999;text-align:center;">NavTicket — Sistema de Gestión de Mantenimiento</p>
      </div>
    </body></html>`;

  try {
    // Import dinámico: evita que un problema de resolución de npm en el edge runtime
    // mate el request completo; si falla, degradamos a stub.
    const nodemailer = await import("npm:nodemailer@6");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `NavTicket <${user}>`,
      to,
      subject,
      html,
    });
    return { ok: true, stub: false };
  } catch (err: any) {
    console.error("[Email] Fallo al enviar recuperación:", err?.message ?? err);
    // No hacer fallar el flujo: si el correo no sale, al menos loguear el link.
    console.log(`[Email] (fallback) Link de recuperación para "${username}": ${resetLink}`);
    return { ok: false, stub: true };
  }
}