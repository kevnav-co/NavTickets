// Recordatorios por correo a los clientes (daily-expiration-check): mantenimiento
// próximo de un equipo y garantía por vencer de una orden. Lógica pura: arma
// asunto, HTML y texto plano y decide a quién se envía. El envío lo hace
// _shared/email.ts.
//
// Todo dato que venga de la base se escapa: nombres de cliente, equipo y empresa
// los escribe cualquier usuario de la empresa.

export type ReminderKind = "maintenance" | "warranty";

export interface ReminderInput {
  kind: ReminderKind;
  companyName: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
  /** Teléfono o WhatsApp de contacto de la empresa, si lo tiene configurado. */
  companyPhone?: string | null;
  clientName?: string | null;
  /** Mantenimiento: nombre del equipo. Garantía: nombre del servicio. */
  itemName?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  orderNumber?: number | string | null;
  /** Fecha de vencimiento (mantenimiento o garantía). */
  dueDate: Date;
  /** Para decir «vence hoy», «venció» o «vence en N días» respecto de este momento. */
  now: Date;
}

export interface ReminderEmail {
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
/** Solo URL https absolutas: una ruta relativa de la app no carga en un cliente de correo. */
const safeHttps = (u?: string | null) => {
  if (!u || u.length > 1000) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const TZ = "America/Bogota";
const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

/** "15 de diciembre de 2026", en hora de Colombia. */
export function formatReminderDate(d: Date): string {
  return dateFmt.format(d);
}

/** Días de calendario (Colombia) entre hoy y la fecha: 0 hoy, negativo si ya pasó. */
export function daysUntil(due: Date, now: Date): number {
  const toUtcDay = (d: Date) => {
    const [y, m, day] = dayKey.format(d).split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtcDay(due) - toUtcDay(now)) / 86_400_000);
}

function whenText(kind: ReminderKind, days: number, dateStr: string): string {
  const verb = kind === "maintenance" ? "le corresponde" : "vence";
  const past = kind === "maintenance" ? "le correspondía" : "venció";
  if (days < 0) return `${past} el ${dateStr}`;
  if (days === 0) return `${verb} hoy, ${dateStr}`;
  if (days === 1) return `${verb} mañana, ${dateStr}`;
  return `${verb} el ${dateStr} (en ${days} días)`;
}

export function buildReminderEmail(i: ReminderInput): ReminderEmail {
  const company = oneLine(i.companyName, 80) || "Su proveedor de servicio";
  const client = oneLine(i.clientName, 80);
  const item = oneLine(i.itemName, 120) || (i.kind === "maintenance" ? "su equipo" : "el servicio realizado");
  const dateStr = formatReminderDate(i.dueDate);
  const days = daysUntil(i.dueDate, i.now);
  const when = whenText(i.kind, days, dateStr);
  const phone = oneLine(i.companyPhone, 40);
  const color = safeColor(i.primaryColor);
  const logo = safeHttps(i.logoUrl);
  const orderNumber = i.orderNumber === null || i.orderNumber === undefined ? "" : oneLine(String(i.orderNumber), 20);

  const greeting = client ? `Hola, ${client}:` : "Hola:";
  let subject: string;
  let lead: string;
  let after: string;
  const rows: [string, string][] = [];

  if (i.kind === "maintenance") {
    subject = `Mantenimiento de ${item}`;
    lead = `Le recordamos que a su equipo ${item} ${when} su mantenimiento preventivo.`;
    rows.push(["Equipo", item]);
    if (oneLine(i.serialNumber, 60)) rows.push(["Número de serie", oneLine(i.serialNumber, 60)]);
    if (oneLine(i.location, 120)) rows.push(["Ubicación", oneLine(i.location, 120)]);
    rows.push(["Fecha", dateStr]);
    after = "Responda a este correo o contáctenos para agendar la visita.";
  } else {
    subject = orderNumber ? `Garantía de la orden #${orderNumber}` : `Garantía de ${item}`;
    lead = `Le informamos que la garantía de ${item}${orderNumber ? ` (orden #${orderNumber})` : ""} ${when}. Si nota alguna falla relacionada con el trabajo, avísenos antes de esa fecha.`;
    if (orderNumber) rows.push(["Orden", `#${orderNumber}`]);
    rows.push(["Servicio", item]);
    rows.push(["Vence", dateStr]);
    after = "Si tiene alguna consulta, responda a este correo o contáctenos.";
  }
  if (phone) rows.push(["Contacto", phone]);
  subject = oneLine(`${subject} — ${company}`, 180);

  const rowsHtml = rows
    .map(([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(v)}</td></tr>`
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
      <p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(after)}</p>
    </div>
    <div style="padding:12px 24px;background:#f9fafb;font-size:11px;color:#9ca3af;">
      Recibe este aviso porque es cliente de ${escapeHtml(company)}.
    </div>
  </div>
</body></html>`;

  const text = [greeting, "", lead, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", after, "", `— ${company}`].join("\n");

  return { subject, html, text };
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

export type RecipientDecision =
  | { send: true; to: string; redirectedFrom: string | null }
  | { send: false; reason: "disabled" | "no_email" | "invalid_email" };

/**
 * ¿A quién va el recordatorio? Solo si la empresa activó `clientReminderEmails`
 * y el cliente tiene un correo válido. Con `override` (secreto
 * REMINDER_EMAIL_OVERRIDE, para pruebas) todo va a esa dirección.
 */
export function decideRecipient(opts: {
  enabled: boolean;
  clientEmail?: string | null;
  override?: string | null;
}): RecipientDecision {
  if (!opts.enabled) return { send: false, reason: "disabled" };
  const email = (opts.clientEmail ?? "").trim();
  if (!email) return { send: false, reason: "no_email" };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { send: false, reason: "invalid_email" };
  const override = (opts.override ?? "").trim();
  if (override && EMAIL_RE.test(override)) return { send: true, to: override, redirectedFrom: email };
  return { send: true, to: email, redirectedFrom: null };
}
