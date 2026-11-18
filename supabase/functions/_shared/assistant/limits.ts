// Límites del asistente público. Protegen el costo y frenan el abuso; la seguridad
// real (qué datos se pueden leer o escribir) la ponen las herramientas y la RLS.
export const LIMITS = {
  /** Caracteres por mensaje del cliente. */
  maxMessageChars: 2000,
  /** Mensajes del cliente por conversación. */
  maxTurnsPerConversation: 30,
  /** Tokens (entrada + salida) por conversación. */
  maxTokensPerConversation: 300_000,
  /** Conversaciones nuevas por IP en 24 horas. */
  maxNewConversationsPerIpPerDay: 10,
  /** Conversaciones nuevas por empresa en 24 horas. */
  maxConversationsPerCompanyPerDay: 300,
  /** Horas sin actividad tras las que una conversación no se reanuda. */
  conversationIdleHours: 24,
  /** Iteraciones de herramientas por turno. */
  maxToolIterations: 4,
  /** Tokens de salida por llamada al modelo (incluye el razonamiento). */
  maxOutputTokens: 2048,
  /** Mensajes de historial que se envían al modelo. */
  maxHistoryMessages: 60,
  /** Códigos de verificación: vigencia, envíos por conversación e intentos por código. */
  codeTtlMinutes: 10,
  maxCodeSendsPerConversation: 3,
  maxCodeAttempts: 5,
  /** Huecos que se devuelven al modelo y días máximos por consulta. */
  maxSlotsReturned: 15,
  maxAvailabilityDays: 14,
} as const;

export interface ConversationUsage {
  status: string;
  turn_count: number;
  input_tokens: number;
  output_tokens: number;
}

/** Motivo por el que no se admite otro mensaje en la conversación, o null si se admite. */
export function turnBlockedReason(c: ConversationUsage): string | null {
  if (c.status !== "abierta") return "La conversación está cerrada. Abre una nueva para continuar.";
  if (c.turn_count >= LIMITS.maxTurnsPerConversation) {
    return "Esta conversación llegó a su límite de mensajes. Abre una nueva o deja tus datos para que te contacten.";
  }
  if (c.input_tokens + c.output_tokens >= LIMITS.maxTokensPerConversation) {
    return "Esta conversación llegó a su límite. Abre una nueva o deja tus datos para que te contacten.";
  }
  return null;
}
