// Supabase Edge Function — Asistente de ventas y servicio técnico (fase 3).
// Endpoint PÚBLICO (verify_jwt = false): lo usa el chat de /#/asistente/<slug>,
// que atiende a clientes sin cuenta.
//
// Acciones (POST JSON):
//   init         { slug, conversationId? }          → abre o retoma una conversación
//   message      { slug, conversationId, message }  → un turno del asistente
//   send_code    { slug, conversationId, email }     → envía un código de un solo uso
//   verify_code  { slug, conversationId, email, code } → verifica el correo
//
// Seguridad:
//   - La empresa la fija el servidor a partir del slug (y solo si tiene la bandera
//     aiAssistant); el cliente lo fija la verificación del correo. El modelo nunca
//     elige empresa ni cliente: las herramientas usan el contexto del servidor.
//   - Las herramientas solo devuelven huecos libres (fecha y hora), los datos del
//     cliente verificado y el estado de su propia solicitud. Nunca crean órdenes.
//   - Límites por mensaje, conversación, IP (hash con sal, nunca en claro) y empresa.
//   - Los textos del cliente se guardan y se muestran como texto plano.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createProvider } from "../_shared/llm/index.ts";
import { LlmNotAllowedError, LlmUnavailableError } from "../_shared/llm/types.ts";
import { runTurn, type ToolOutcome } from "../_shared/assistant/engine.ts";
import { toLlmHistory, visibleTranscript, type StoredMessage } from "../_shared/assistant/history.ts";
import { buildSystemPrompt, type PromptService } from "../_shared/assistant/prompt.ts";
import { ASSISTANT_TOOLS, cleanText, isToolName, validateDisponibilidad, validateSolicitud } from "../_shared/assistant/tools.ts";
import { LIMITS, turnBlockedReason } from "../_shared/assistant/limits.ts";
import { generateCode, hashCode, isValidEmail, normalizeEmail, safeEqual, sha256Hex } from "../_shared/assistant/codes.ts";
import { sendVerificationCodeEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const env = (k: string) => Deno.env.get(k);
const SALT = env("ASSISTANT_SALT") || env("WEBHOOK_SECRET") || "";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 10_000;

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function allowedOrigins(): string[] {
  return [env("APP_URL"), ...(env("ASSISTANT_ALLOWED_ORIGINS") ?? "").split(",")]
    .map((o) => (o ?? "").trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(req) },
  });

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconocida";
}

// ─── Datos ────────────────────────────────────────────────────────────────────
interface Company {
  id: string;
  name: string;
  theme: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
}

interface Settings {
  timezone: string;
  service_types: { id: string; name: string; orderType: string; durationMinutes: number }[];
  welcome_message: string;
  retention_days: number;
}

interface Conversation {
  id: string;
  company_id: string;
  status: string;
  turn_count: number;
  input_tokens: number;
  output_tokens: number;
  verified_email: string | null;
  client_id: string | null;
  last_message_at: string;
}

const CONVERSATION_COLUMNS = "id, company_id, status, turn_count, input_tokens, output_tokens, verified_email, client_id, last_message_at";

async function loadCompany(slug: unknown): Promise<Company> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) throw new HttpError(400, "Enlace no válido");
  const { data, error } = await db.from("companies").select("id, name, theme, features").eq("slug", slug).maybeSingle();
  if (error) throw error;
  // Mismo mensaje si no existe o si no tiene el asistente: no revela qué empresas existen.
  if (!data || data.features?.aiAssistant !== true) throw new HttpError(404, "El asistente no está disponible");
  return data as Company;
}

async function loadSettings(companyId: string): Promise<Settings> {
  const cols = "timezone, service_types, welcome_message, retention_days";
  const { data, error } = await db.from("assistant_settings").select(cols).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  if (data) return data as Settings;
  // Sin configuración guardada: se crea con los valores por defecto de la tabla (042).
  const created = await db.from("assistant_settings").insert({ company_id: companyId }).select(cols).single();
  if (created.error) throw created.error;
  return created.data as Settings;
}

async function loadConversation(id: unknown, companyId: string): Promise<Conversation | null> {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const { data, error } = await db.from("assistant_conversations").select(CONVERSATION_COLUMNS)
    .eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return (data as Conversation) ?? null;
}

async function requireConversation(id: unknown, companyId: string): Promise<Conversation> {
  const conv = await loadConversation(id, companyId);
  if (!conv) throw new HttpError(404, "La conversación no existe. Vuelve a cargar la página.");
  return conv;
}

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Escapa los comodines de LIKE para comparar un correo de forma exacta sin distinguir mayúsculas. */
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findClientByEmail(companyId: string, email: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from("clients").select("id, name").eq("company_id", companyId)
    .ilike("email", likeExact(email)).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

function privacyNotice(companyName: string, retentionDays: number): string {
  return `${companyName} usará los datos que compartas en este chat (nombre, contacto, dirección y descripción del servicio) ` +
    `solo para atender tu solicitud de servicio técnico, conforme a la Ley 1581 de 2012 de protección de datos personales. ` +
    `La conversación se conserva hasta ${retentionDays} días. Puedes pedir a la empresa consultar, corregir o suprimir tus datos. ` +
    `Las respuestas las genera un asistente automático y un administrador confirma cada cita.`;
}

// ─── Herramientas (contexto fijado por el servidor) ──────────────────────────
interface ToolContext {
  company: Company;
  conv: Conversation;
  services: PromptService[];
  today: string;
}

async function freeSlots(companyId: string, from: string, to: string, duration: number) {
  const { data, error } = await db.rpc("available_slots", {
    p_company: companyId, p_from: from, p_to: to, p_duration_minutes: duration,
  });
  if (error) throw error;
  return (data ?? []) as { slot_date: string; slot_time: string; free_technicians: number; technician_ids: string[] }[];
}

async function toolDisponibilidad(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const v = validateDisponibilidad(input);
  if (!v.ok) return { content: v.error, isError: true };
  const desde = v.value.desde < ctx.today ? ctx.today : v.value.desde;
  let hasta = v.value.hasta < desde ? desde : v.value.hasta;
  if (dayDiff(desde, hasta) >= LIMITS.maxAvailabilityDays) hasta = addDays(desde, LIMITS.maxAvailabilityDays - 1);
  const service = ctx.services.find((s) => s.id === v.value.tipoServicioId);
  const duration = service?.durationMinutes ?? 60;

  const rows = await freeSlots(ctx.company.id, desde, hasta, duration);
  // Solo fecha y hora: nunca qué técnico está libre ni qué ocupa los demás huecos.
  const huecos = rows.slice(0, LIMITS.maxSlotsReturned).map((r) => ({ fecha: r.slot_date, hora: String(r.slot_time).slice(0, 5) }));
  return {
    content: JSON.stringify({
      desde, hasta, duracion_minutos: duration, huecos,
      ...(huecos.length ? {} : { nota: "No hay huecos libres en ese rango; ofrece otras fechas." }),
    }),
  };
}

async function toolIdentificar(ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.conv.verified_email) {
    return { content: JSON.stringify({ verificado: false, mensaje: "El cliente debe verificar su correo con el botón «Verificar mi correo»." }) };
  }
  const client = ctx.conv.client_id
    ? (await db.from("clients").select("id, name").eq("id", ctx.conv.client_id).eq("company_id", ctx.company.id).maybeSingle()).data
    : await findClientByEmail(ctx.company.id, ctx.conv.verified_email);
  if (!client) return { content: JSON.stringify({ verificado: true, cliente: null, equipos: [] }) };
  if (ctx.conv.client_id !== client.id) {
    await db.from("assistant_conversations").update({ client_id: client.id }).eq("id", ctx.conv.id);
    ctx.conv.client_id = client.id;
  }
  const { data: equipos, error } = await db.from("equipment").select("id, name, brand, location")
    .eq("company_id", ctx.company.id).eq("client_id", client.id).limit(20);
  if (error) throw error;
  return {
    content: JSON.stringify({
      verificado: true,
      cliente: { nombre: client.name },
      equipos: (equipos ?? []).map((e) => ({ id: e.id, nombre: e.name, marca: e.brand, ubicacion: e.location })),
    }),
  };
}

const REQUEST_FIELDS = "id, status, contact_name, contact_phone, contact_email, contact_identification, address, city, " +
  "service_type_id, service_name, order_type, description, equipment_ids, equipment_description, preferred_slots, " +
  "proposed_date, proposed_time, proposed_duration_minutes, proposed_technician_id";

async function toolGuardar(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const v = validateSolicitud(input);
  if (!v.ok) return { content: v.error, isError: true };
  const s = v.value;
  const service = s.tipoServicioId ? ctx.services.find((x) => x.id === s.tipoServicioId) : undefined;
  if (s.tipoServicioId && !service) return { content: "tipo_servicio_id no está en la lista de servicios", isError: true };

  const { data: existingRows, error: existingError } = await db.from("service_requests").select(REQUEST_FIELDS)
    .eq("conversation_id", ctx.conv.id).in("status", ["borrador", "pendiente"])
    .order("created_at", { ascending: false }).limit(1);
  if (existingError) throw existingError;
  // deno-lint-ignore no-explicit-any
  const existing = existingRows?.[0] as any | undefined;
  const keep = <T>(value: T | null, current: T | null | undefined): T | null => (value ?? current ?? null);

  // Equipos: solo los del cliente verificado en esta empresa.
  let equipmentIds: string[] = existing?.equipment_ids ?? [];
  if (s.equiposIds.length && ctx.conv.client_id) {
    const { data, error } = await db.from("equipment").select("id").eq("company_id", ctx.company.id)
      .eq("client_id", ctx.conv.client_id).in("id", s.equiposIds);
    if (error) throw error;
    equipmentIds = (data ?? []).map((e) => e.id);
  }

  // Propuesta: solo un hueco que siga libre ahora mismo.
  let proposal: Record<string, unknown> = {};
  if (s.propuesta) {
    const duration = service?.durationMinutes ?? existing?.proposed_duration_minutes ?? 60;
    if (s.propuesta.fecha < ctx.today) return { content: "La fecha propuesta ya pasó", isError: true };
    const slots = await freeSlots(ctx.company.id, s.propuesta.fecha, s.propuesta.fecha, duration);
    const slot = slots.find((r) => String(r.slot_time).slice(0, 5) === s.propuesta!.hora);
    if (!slot) {
      return { content: "Ese hueco ya no está libre. Consulta de nuevo la disponibilidad y ofrece otro.", isError: true };
    }
    proposal = {
      proposed_date: s.propuesta.fecha,
      proposed_time: s.propuesta.hora,
      proposed_duration_minutes: duration,
      proposed_technician_id: slot.technician_ids?.[0] ?? null,
    };
  }

  const row: Record<string, unknown> = {
    contact_name: keep(s.nombre, existing?.contact_name),
    contact_phone: keep(s.telefono, existing?.contact_phone),
    contact_email: keep(s.correo ?? ctx.conv.verified_email, existing?.contact_email),
    contact_identification: keep(s.identificacion, existing?.contact_identification),
    address: keep(s.direccion, existing?.address),
    city: keep(s.ciudad, existing?.city),
    service_type_id: keep(service?.id ?? null, existing?.service_type_id),
    service_name: keep(service?.name ?? null, existing?.service_name),
    order_type: service?.orderType ?? existing?.order_type ?? "Correctivo",
    description: keep(s.descripcion, existing?.description) ?? "",
    equipment_ids: equipmentIds,
    equipment_description: keep(s.descripcionEquipo, existing?.equipment_description),
    preferred_slots: s.franjas.length ? s.franjas.map((f) => ({ date: f.fecha, time: f.hora })) : (existing?.preferred_slots ?? []),
    client_id: ctx.conv.client_id,
    ...proposal,
  };

  let id: string;
  let status: string;
  if (existing) {
    status = s.lista ? "pendiente" : existing.status;
    const { error } = await db.from("service_requests").update({ ...row, status }).eq("id", existing.id);
    if (error) throw error;
    id = existing.id;
  } else {
    status = s.lista ? "pendiente" : "borrador";
    const { data, error } = await db.from("service_requests")
      .insert({ ...row, company_id: ctx.company.id, conversation_id: ctx.conv.id, channel: "web", status })
      .select("id").single();
    if (error) throw error;
    id = data.id;
  }
  return { content: JSON.stringify({ guardada: true, estado: status, referencia: id.slice(0, 8) }) };
}

function toolExecutor(ctx: ToolContext) {
  return async (name: string, input: unknown): Promise<ToolOutcome> => {
    if (!isToolName(name)) return { content: `Herramienta desconocida: ${name}`, isError: true };
    if (name === "consultar_disponibilidad") return await toolDisponibilidad(ctx, input);
    if (name === "identificar_cliente") return await toolIdentificar(ctx);
    return await toolGuardar(ctx, input);
  };
}

// ─── Acciones ────────────────────────────────────────────────────────────────
async function countSince(table: string, column: string, value: string, sinceIso: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true })
    .eq(column, value).gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

async function actionInit(req: Request, body: Record<string, unknown>) {
  const company = await loadCompany(body.slug);
  const settings = await loadSettings(company.id);
  const theme = company.theme ?? {};
  const companyInfo = {
    name: company.name,
    logoUrl: typeof theme.logoUrl === "string" ? theme.logoUrl : null,
    primaryColor: typeof theme.primaryColor === "string" ? theme.primaryColor : null,
  };
  const base = {
    company: companyInfo,
    welcome: settings.welcome_message,
    privacyNotice: privacyNotice(company.name, settings.retention_days),
  };

  const existing = await loadConversation(body.conversationId, company.id);
  const idleLimit = Date.now() - LIMITS.conversationIdleHours * 3_600_000;
  if (existing && existing.status === "abierta" && Date.parse(existing.last_message_at) > idleLimit) {
    const { data, error } = await db.from("assistant_messages").select("role, content")
      .eq("conversation_id", existing.id).order("id", { ascending: true }).limit(200);
    if (error) throw error;
    return json(req, {
      ...base,
      conversationId: existing.id,
      verified: !!existing.verified_email,
      messages: visibleTranscript((data ?? []) as StoredMessage[]),
    });
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const ipHash = await sha256Hex(`${SALT}:ip:${clientIp(req)}`);
  if (await countSince("assistant_conversations", "ip_hash", ipHash, since) >= LIMITS.maxNewConversationsPerIpPerDay) {
    throw new HttpError(429, "Has abierto demasiadas conversaciones hoy. Intenta más tarde.");
  }
  if (await countSince("assistant_conversations", "company_id", company.id, since) >= LIMITS.maxConversationsPerCompanyPerDay) {
    throw new HttpError(429, "El asistente está atendiendo muchas solicitudes. Intenta más tarde.");
  }
  const { data, error } = await db.from("assistant_conversations")
    .insert({ company_id: company.id, channel: "web", ip_hash: ipHash }).select("id").single();
  if (error) throw error;
  return json(req, { ...base, conversationId: data.id, verified: false, messages: [] });
}

async function actionMessage(req: Request, body: Record<string, unknown>) {
  const company = await loadCompany(body.slug);
  const conv = await requireConversation(body.conversationId, company.id);
  const blocked = turnBlockedReason(conv);
  if (blocked) throw new HttpError(429, blocked);

  const text = cleanText(body.message, LIMITS.maxMessageChars + 1);
  if (!text) throw new HttpError(400, "Escribe un mensaje");
  if (text.length > LIMITS.maxMessageChars) throw new HttpError(400, `El mensaje supera ${LIMITS.maxMessageChars} caracteres`);

  const settings = await loadSettings(company.id);
  const services: PromptService[] = (settings.service_types ?? []).map((s) => ({
    id: s.id, name: s.name, orderType: s.orderType, durationMinutes: s.durationMinutes,
  }));
  const today = todayIn(settings.timezone);

  let provider;
  try {
    provider = await createProvider(env, company.id);
  } catch (error) {
    console.error("[assistant-chat] Proveedor no disponible:", error instanceof Error ? error.message : error);
    throw new HttpError(503, "El asistente no está disponible en este momento. Intenta más tarde.");
  }

  const { data: rows, error: rowsError } = await db.from("assistant_messages").select("role, content")
    .eq("conversation_id", conv.id).order("id", { ascending: false }).limit(LIMITS.maxHistoryMessages);
  if (rowsError) throw rowsError;
  const history = toLlmHistory(((rows ?? []) as StoredMessage[]).reverse(), LIMITS.maxHistoryMessages);

  const clientName = conv.client_id
    ? (await db.from("clients").select("name").eq("id", conv.client_id).eq("company_id", company.id).maybeSingle()).data?.name ?? null
    : null;
  const system = buildSystemPrompt({
    companyName: company.name, today, timezone: settings.timezone, services,
    verifiedEmail: !!conv.verified_email, clientName,
  });

  let result;
  try {
    result = await runTurn({
      provider, system, tools: ASSISTANT_TOOLS, history, userText: text,
      executeTool: toolExecutor({ company, conv, services, today }),
      maxIterations: LIMITS.maxToolIterations, maxTokens: LIMITS.maxOutputTokens,
    });
  } catch (error) {
    if (error instanceof LlmUnavailableError || error instanceof LlmNotAllowedError) {
      throw new HttpError(503, "El asistente no está disponible en este momento. Intenta más tarde.");
    }
    throw error;
  }

  // El turno se guarda completo al final: nunca queda una llamada sin su resultado.
  const { error: insertError } = await db.from("assistant_messages").insert(
    result.toStore.map((m) => ({ conversation_id: conv.id, company_id: company.id, role: m.role, content: m.content })),
  );
  if (insertError) throw insertError;
  await db.from("assistant_conversations").update({
    turn_count: conv.turn_count + 1,
    input_tokens: conv.input_tokens + result.usage.inputTokens,
    output_tokens: conv.output_tokens + result.usage.outputTokens,
    last_message_at: new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
  }).eq("id", conv.id);

  const { data: request } = await db.from("service_requests").select("status, id")
    .eq("conversation_id", conv.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return json(req, {
    reply: result.reply,
    request: request ? { status: request.status, reference: String(request.id).slice(0, 8) } : null,
  });
}

async function actionSendCode(req: Request, body: Record<string, unknown>) {
  const company = await loadCompany(body.slug);
  const conv = await requireConversation(body.conversationId, company.id);
  if (conv.status !== "abierta") throw new HttpError(409, "La conversación está cerrada.");
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) throw new HttpError(400, "Escribe un correo válido");

  const { count, error } = await db.from("assistant_verification_codes").select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id);
  if (error) throw error;
  if ((count ?? 0) >= LIMITS.maxCodeSendsPerConversation) {
    throw new HttpError(429, "Ya pediste varios códigos en esta conversación. Abre una nueva para intentarlo de nuevo.");
  }

  const code = generateCode();
  const { error: insertError } = await db.from("assistant_verification_codes").insert({
    company_id: company.id,
    conversation_id: conv.id,
    email,
    code_hash: await hashCode(code, email, SALT),
    expires_at: new Date(Date.now() + LIMITS.codeTtlMinutes * 60_000).toISOString(),
  });
  if (insertError) throw insertError;
  const sent = await sendVerificationCodeEmail(email, code, company.name);
  if (!sent.ok) throw new HttpError(503, "No se pudo enviar el correo. Intenta más tarde.");
  // La respuesta no dice si el correo pertenece a un cliente registrado.
  return json(req, { sent: true, minutes: LIMITS.codeTtlMinutes });
}

async function actionVerifyCode(req: Request, body: Record<string, unknown>) {
  const company = await loadCompany(body.slug);
  const conv = await requireConversation(body.conversationId, company.id);
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) throw new HttpError(400, "Escribe el correo y el código de 6 dígitos");

  const { data: row, error } = await db.from("assistant_verification_codes").select("id, code_hash, attempts")
    .eq("conversation_id", conv.id).eq("email", email).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!row) throw new HttpError(400, "El código venció o no existe. Pide uno nuevo.");
  if (row.attempts >= LIMITS.maxCodeAttempts) throw new HttpError(429, "Demasiados intentos. Pide un código nuevo.");
  await db.from("assistant_verification_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);

  if (!safeEqual(await hashCode(code, email, SALT), row.code_hash)) throw new HttpError(400, "El código no es correcto.");

  await db.from("assistant_verification_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  const client = await findClientByEmail(company.id, email);
  await db.from("assistant_conversations").update({
    verified_email: email, verified_at: new Date().toISOString(), client_id: client?.id ?? null,
  }).eq("id", conv.id);
  return json(req, { verified: true });
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "La petición es demasiado grande");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "JSON no válido");
    }
    if (typeof body !== "object" || body === null) throw new HttpError(400, "JSON no válido");

    switch (body.action) {
      case "init": return await actionInit(req, body);
      case "message": return await actionMessage(req, body);
      case "send_code": return await actionSendCode(req, body);
      case "verify_code": return await actionVerifyCode(req, body);
      default: throw new HttpError(400, "Acción no válida");
    }
  } catch (error) {
    if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
    console.error("[assistant-chat] Error:", error);
    return json(req, { error: "Ocurrió un error. Intenta de nuevo en un momento." }, 500);
  }
});
