// Herramientas del asistente: definición (JSON Schema estricto) y validación en el
// servidor. El modelo propone, el servidor decide: cada entrada se valida otra vez
// aquí aunque el proveedor garantice el esquema, y la empresa, el cliente y la
// conversación los fija siempre el servidor, nunca un parámetro del modelo.
// Código puro (sin Deno): lo prueba Vitest.
import type { LlmTool } from "../llm/types.ts";

const nullableString = (description: string) => ({ type: ["string", "null"], description });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICE_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const TOOL_NAMES = ["consultar_disponibilidad", "identificar_cliente", "guardar_solicitud"] as const;
export type ToolName = typeof TOOL_NAMES[number];

export const ASSISTANT_TOOLS: LlmTool[] = [
  {
    name: "consultar_disponibilidad",
    description:
      "Devuelve fechas y horas en que la empresa puede atender un servicio, entre dos fechas (máximo 14 días). " +
      "Úsala siempre antes de proponer una fecha: nunca inventes disponibilidad.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["tipo_servicio_id", "desde", "hasta"],
      properties: {
        tipo_servicio_id: nullableString("Id del tipo de servicio de la lista del sistema, o null si aún no se sabe"),
        desde: { type: "string", description: "Fecha inicial YYYY-MM-DD" },
        hasta: { type: "string", description: "Fecha final YYYY-MM-DD" },
      },
    },
  },
  {
    name: "identificar_cliente",
    description:
      "Si el cliente verificó su correo con el código de un solo uso, devuelve su nombre de cliente registrado y sus equipos. " +
      "Si no lo verificó, indica que la verificación es necesaria; no pidas datos de otros clientes.",
    input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
  {
    name: "guardar_solicitud",
    description:
      "Guarda o actualiza la solicitud de servicio de esta conversación. Con lista = true queda pendiente para que un " +
      "administrador la confirme; solo márcala lista cuando tengas nombre, un teléfono o correo de contacto y la descripción, " +
      "y el cliente esté de acuerdo. No crea órdenes ni asigna técnicos.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "nombre", "telefono", "correo", "identificacion", "direccion", "ciudad", "tipo_servicio_id", "descripcion",
        "equipos_ids", "descripcion_equipo", "franjas_preferidas", "propuesta_fecha", "propuesta_hora", "lista",
      ],
      properties: {
        nombre: nullableString("Nombre de la persona o empresa que pide el servicio"),
        telefono: nullableString("Teléfono de contacto"),
        correo: nullableString("Correo de contacto"),
        identificacion: nullableString("NIT o cédula, si la da"),
        direccion: nullableString("Dirección del servicio"),
        ciudad: nullableString("Ciudad"),
        tipo_servicio_id: nullableString("Id del tipo de servicio de la lista del sistema"),
        descripcion: nullableString("Qué necesita, con sus palabras"),
        equipos_ids: { type: "array", items: { type: "string" }, description: "Ids de equipos devueltos por identificar_cliente" },
        descripcion_equipo: nullableString("Equipo descrito por el cliente si no está registrado"),
        franjas_preferidas: {
          type: "array",
          description: "Franjas que prefiere el cliente",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["fecha", "hora"],
            properties: { fecha: { type: "string" }, hora: { type: ["string", "null"] } },
          },
        },
        propuesta_fecha: nullableString("Fecha YYYY-MM-DD de un hueco devuelto por consultar_disponibilidad que el cliente aceptó"),
        propuesta_hora: nullableString("Hora HH:MM de ese hueco"),
        lista: { type: "boolean", description: "true si la solicitud está completa y el cliente quiere enviarla" },
      },
    },
  },
];

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Texto limpio: sin caracteres de control, espacios colapsados, recortado al máximo. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // deno-lint-ignore no-control-regex
  const t = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  return t === "" ? null : t.slice(0, max);
}

export interface DisponibilidadInput {
  tipoServicioId: string | null;
  desde: string;
  hasta: string;
}

export function validateDisponibilidad(input: unknown): Validation<DisponibilidadInput> {
  if (!isObj(input)) return { ok: false, error: "Entrada no válida" };
  const desde = String(input.desde ?? "");
  const hasta = String(input.hasta ?? "");
  if (!DATE.test(desde) || !DATE.test(hasta)) return { ok: false, error: "Las fechas deben tener el formato YYYY-MM-DD" };
  if (hasta < desde) return { ok: false, error: "La fecha final es anterior a la inicial" };
  const tipo = input.tipo_servicio_id;
  if (tipo != null && (typeof tipo !== "string" || !SERVICE_ID.test(tipo))) return { ok: false, error: "tipo_servicio_id no válido" };
  return { ok: true, value: { tipoServicioId: (tipo as string | null) ?? null, desde, hasta } };
}

export interface SolicitudInput {
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  identificacion: string | null;
  direccion: string | null;
  ciudad: string | null;
  tipoServicioId: string | null;
  descripcion: string | null;
  equiposIds: string[];
  descripcionEquipo: string | null;
  franjas: { fecha: string; hora: string | null }[];
  propuesta: { fecha: string; hora: string } | null;
  lista: boolean;
}

export function validateSolicitud(input: unknown): Validation<SolicitudInput> {
  if (!isObj(input)) return { ok: false, error: "Entrada no válida" };
  const correo = cleanText(input.correo, 254)?.toLowerCase() ?? null;
  if (correo && !EMAIL.test(correo)) return { ok: false, error: "El correo no es válido" };
  const telefono = cleanText(input.telefono, 40);
  if (telefono && !/^[0-9+()\-\s]{7,40}$/.test(telefono)) return { ok: false, error: "El teléfono no es válido" };
  const tipo = cleanText(input.tipo_servicio_id, 60);
  if (tipo && !SERVICE_ID.test(tipo)) return { ok: false, error: "tipo_servicio_id no válido" };

  const equiposIds = Array.isArray(input.equipos_ids)
    ? [...new Set(input.equipos_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 20)
    : [];
  const franjas = Array.isArray(input.franjas_preferidas)
    ? input.franjas_preferidas
      .filter(isObj)
      .map((f) => ({ fecha: String(f.fecha ?? ""), hora: typeof f.hora === "string" && TIME.test(f.hora) ? f.hora : null }))
      .filter((f) => DATE.test(f.fecha))
      .slice(0, 5)
    : [];

  const pf = input.propuesta_fecha;
  const ph = input.propuesta_hora;
  let propuesta: SolicitudInput["propuesta"] = null;
  if (pf != null || ph != null) {
    if (typeof pf !== "string" || !DATE.test(pf) || typeof ph !== "string" || !TIME.test(ph)) {
      return { ok: false, error: "La propuesta necesita fecha YYYY-MM-DD y hora HH:MM de un hueco disponible" };
    }
    propuesta = { fecha: pf, hora: ph };
  }

  const value: SolicitudInput = {
    nombre: cleanText(input.nombre, 200),
    telefono,
    correo,
    identificacion: cleanText(input.identificacion, 40),
    direccion: cleanText(input.direccion, 300),
    ciudad: cleanText(input.ciudad, 120),
    tipoServicioId: tipo,
    descripcion: cleanText(input.descripcion, 4000),
    equiposIds,
    descripcionEquipo: cleanText(input.descripcion_equipo, 2000),
    franjas,
    propuesta,
    lista: input.lista === true,
  };
  if (value.lista) {
    const faltan = [
      !value.nombre && "nombre",
      !value.telefono && !value.correo && "teléfono o correo",
      !value.descripcion && "descripción",
    ].filter(Boolean);
    if (faltan.length) return { ok: false, error: `Para enviarla falta: ${faltan.join(", ")}` };
  }
  return { ok: true, value };
}

export const isToolName = (name: string): name is ToolName => (TOOL_NAMES as readonly string[]).includes(name);
