// Reconcilia supabase_auth_id en `users` desde auth.users (por email) y
// re-testea RLS. Además detecta si un trigger/regla lo sobreescribe.
// Uso: $env:SUPABASE_SERVICE_ROLE_KEY="TU_KEY"; node scripts/fix-users-rls.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SR) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const ANON = readFileSync("C:/Users/Nvas/Free Claude/NavTicket/.env", "utf8").match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1] ?? "";
const DOMAIN = "navas.com";
const USERNAMES = ["superadmin","a_dev","a_admin","a_sup","a_aux","a_tec1","a_tec2","h_admin","h_sup","h_aux","h_tec1","c_admin","c_sup","c_aux","c_tec1"];

const a = createClient(URL, SR, { auth: { persistSession: false } });

// 1) Mapa email -> auth id
const emailToId = new Map();
{
  let page = 0, done = false;
  while (!done) {
    const { data } = await a.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = data?.users ?? [];
    for (const u of batch) emailToId.set(u.email, u.id);
    const total = data?.total ?? (page + 1) * 1000;
    page++; done = page * 1000 >= total;
  }
}

// 2) Re-vincular
console.log("== Re-vinculando supabase_auth_id ==");
for (const uname of USERNAMES) {
  const id = emailToId.get(`${uname}@${DOMAIN}`);
  if (!id) { console.log(`${uname}: (no auth user)`); continue; }
  const { error } = await a.from("users").update({ supabase_auth_id: id }).eq("username", uname);
  console.log(`${uname}: ${error ? "ERR " + error.message : "OK -> " + id}`);
}

// 3) Confirmar si se mantuvo
const { data: after } = await a.from("users").select("username,supabase_auth_id").in("username", USERNAMES);
console.log("\n== Verificación post-UPDATE ==");
console.log(JSON.stringify(after, null, 2));

// 4) Test RLS real (login anon + query tenants)
console.log("\n== Test RLS ==");
const lg = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "a_admin@" + DOMAIN, password: "Demo#2026" }),
})).json();
if (!lg.access_token) { console.log("login fail", lg); process.exit(0); }
for (const t of ["companies", "users", "clients"]) {
  const res = await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: { apikey: ANON, Authorization: "Bearer " + lg.access_token } });
  console.log(`a_admin -> ${t}: ${res.status} ${JSON.stringify(await res.json())}`);
}