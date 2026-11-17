// Guard para las Edge Functions que disparan los triggers de la base de datos vía pg_net
// (verify_jwt = false). El único control de acceso es el secreto compartido:
//   x-webhook-secret: <WEBHOOK_SECRET>   ó   Authorization: Bearer <WEBHOOK_SECRET>
// Debe coincidir con `app.webhook_secret` de la base de datos. Si el secret WEBHOOK_SECRET
// no está configurado, se rechaza todo (fail-closed): sin él, cualquiera podría crear
// notificaciones y pushes falsos para cualquier usuario.
export function isAuthorizedWebhook(req: Request): boolean {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret) {
    console.error("[webhook-auth] WEBHOOK_SECRET no configurado: se rechaza la llamada");
    return false;
  }
  const header = req.headers.get("x-webhook-secret");
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

export const unauthorizedWebhookResponse = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
