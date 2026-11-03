// Guard para funciones programadas (verify_jwt=true solo exige un JWT válido, y la anon
// key lo es): solo se aceptan llamadas con la service_role key o el secreto del cron.
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   ó   x-cron-secret: <CRON_SECRET>
export function isAuthorizedCronCall(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (serviceRole && bearer === serviceRole) return true;
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true;
  return false;
}

export const unauthorizedCronResponse = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
