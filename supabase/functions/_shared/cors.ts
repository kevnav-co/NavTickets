// CORS para las Edge Functions que llama el navegador (la app está en otro
// origen que *.supabase.co). Sin esto el navegador hace un preflight OPTIONS,
// la función responde 405 y la llamada falla con «Failed to fetch».
//
// Solo se responde con `Access-Control-Allow-Origin` a los orígenes de la app:
// `APP_URL`, `APP_ORIGIN` y la lista `APP_ALLOWED_ORIGINS` (separada por comas).

function env(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

const normalize = (o: string | undefined | null) => (o ?? "").trim().replace(/\/+$/, "");

export function allowedAppOrigins(): string[] {
  return [env("APP_URL"), env("APP_ORIGIN"), ...(env("APP_ALLOWED_ORIGINS") ?? "").split(",")]
    .map(normalize)
    .filter(Boolean);
}

/** Origen de la app para enlaces (correos): nunca sale de cabeceras de la petición sin validar. */
export function appOriginFor(req: Request): string {
  const allowed = allowedAppOrigins();
  const requested = normalize(req.headers.get("Origin"));
  if (requested && allowed.includes(requested)) return requested;
  return normalize(env("APP_ORIGIN")) || normalize(env("APP_URL"));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = normalize(req.headers.get("Origin"));
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedAppOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

/** Envuelve un handler: responde el preflight y añade las cabeceras CORS a toda respuesta. */
export function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
