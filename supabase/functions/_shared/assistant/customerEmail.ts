// Correo al cliente cuando su solicitud se confirma o se rechaza (fase 4). Lógica
// pura: arma asunto, HTML y texto plano; el envío lo hace _shared/email.ts. Todo
// dato que venga de la base se escapa: el nombre, el servicio y el motivo los
// escribieron el cliente o el gestor.

export type CustomerNoticeStatus = "confirmada" | "rechazada";

export interface CustomerNoticeInput {
  status: CustomerNoticeStatus;
  companyName: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
  contactName?: string | null;
  serviceName?: string | null;
  orderType?: string | null;
  /** Primeros 8 caracteres del id: la misma referencia que dio el chat. */
  reference: string;
  date?: string | null;            // YYYY-MM-DD
  time?: string | null;            // HH:MM o HH:MM:SS
  durationMinutes?: number | null;
  technicianName?: string | null;
  orderNumber?: number | string | null;
  rejectionReason?: string | null;
  /** Enlace al chat de la empresa, para escribir de nuevo. */
  chatUrl?: string | null;
}

export interface CustomerNotice {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Una línea, sin saltos (evita inyección de cabeceras en el asunto) y acotada. */
const oneLine = (s: string | null | undefined, max: number) =>
  (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

const HEX = /^#[0-9a-f]{6}$/i;
const safeColor = (c?: string | null) => (c && HEX.test(c) ? c : "#1f2937");
const safeHttps = (u?: string | null) => {
  if (!u || u.length > 1000) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

/** "2026-11-19" → "jueves, 19 de noviembre de 2026"; null si no es una fecha válida. */
export function formatServiceDate(date?: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? null : dateFmt.format(t);
}

/** "08:00:00" → "08:00"; null si no es una hora. */
export function formatServiceTime(time?: string | null): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(time ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}

function durationText(min?: number | null): string | null {
  if (!min || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function buildCustomerNotice(i: CustomerNoticeInput): CustomerNotice {
  const company = oneLine(i.companyName, 120) || "La empresa";
  const name = oneLine(i.contactName, 80);
  const service = oneLine(i.serviceName, 120) || oneLine(i.orderType, 40) || "servicio técnico";
  const reference = oneLine(i.reference, 16);
  const color = safeColor(i.primaryColor);
  const logo = safeHttps(i.logoUrl);
  const chatUrl = safeHttps(i.chatUrl);
  const greeting = name ? `Hola, ${name}:` : "Hola:";

  const rows: [string, string][] = [];
  let subject: string;
  let lead: string;
  let after: string;

  if (i.status === "confirmada") {
    const date = formatServiceDate(i.date);
    const time = formatServiceTime(i.time);
    const when = date ? (time ? `${date}, ${time}` : date) : null;
    subject = when
      ? `Servicio agendado con ${company}: ${when}`
      : `Tu solicitud de servicio a ${company} está confirmada`;
    lead = `${company} confirmó tu solicitud de ${service}.`;
    rows.push(["Servicio", service]);
    if (date) rows.push(["Fecha", date]);
    if (time) rows.push(["Hora de llegada", time]);
    const dur = durationText(i.durationMinutes);
    if (dur) rows.push(["Duración estimada", dur]);
    const tech = oneLine(i.technicianName, 80);
    if (tech) rows.push(["Técnico", tech]);
    if (i.orderNumber !== null && i.orderNumber !== undefined && String(i.orderNumber).trim() !== "") {
      rows.push(["Orden", `#${oneLine(String(i.orderNumber), 20)}`]);
    }
    rows.push(["Referencia", reference]);
    after = "Si necesitas cambiar la fecha o tienes alguna duda, responde a este correo o escríbenos por el chat.";
  } else {
    subject = `Sobre tu solicitud de servicio a ${company}`;
    lead = `${company} revisó tu solicitud de ${service} y no pudo agendarla.`;
    const reason = (i.rejectionReason ?? "").trim().slice(0, 1000);
    if (reason) rows.push(["Motivo", reason]);
    rows.push(["Referencia", reference]);
    after = "Si quieres, puedes enviar una nueva solicitud por el chat o responder a este correo.";
  }

  subject = oneLine(subject, 180);

  const rowsHtml = rows
    .map(([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0;font-size:14px;color:#111827;white-space:pre-wrap;">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:${color};padding:20px 24px;color:#ffffff;">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" height="36" style="display:block;max-height:36px;margin-bottom:8px;border:0;">` : ""}
      <div style="font-size:18px;font-weight:700;">${escapeHtml(company)}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;font-size:15px;">${escapeHtml(lead)}</p>
      <table role="presentation" style="border-collapse:collapse;margin:0 0 16px;">${rowsHtml}</table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">${escapeHtml(after)}</p>
      ${chatUrl ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:${color};color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Abrir el chat</a></p>` : ""}
    </div>
    <div style="padding:12px 24px;background:#f9fafb;font-size:11px;color:#9ca3af;">
      Recibes este correo porque dejaste una solicitud de servicio a ${escapeHtml(company)}.
    </div>
  </div>
</body></html>`;

  const text = [
    greeting,
    "",
    lead,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    after,
    ...(chatUrl ? ["", `Chat: ${chatUrl}`] : []),
    "",
    `Recibes este correo porque dejaste una solicitud de servicio a ${company}.`,
  ].join("\n");

  return { subject, html, text };
}

/** Correo de destino: el de la solicitud o, si no tiene, el del cliente registrado. */
export function pickCustomerEmail(
  requestEmail: string | null | undefined,
  clientEmail: string | null | undefined,
  isValid: (email: string) => boolean,
): string | null {
  for (const raw of [requestEmail, clientEmail]) {
    const e = (raw ?? "").trim().toLowerCase();
    if (e && isValid(e)) return e;
  }
  return null;
}
