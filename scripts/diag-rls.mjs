// Diagnóstico RLS: inspecciona las filas `users` demo y las functions/policies de
// tenant para entender por qué REST devuelve [] a pesar de lograr login.
// Uso: $env:SUPABASE_SERVICE_ROLE_KEY="TU_KEY"; node scripts/diag-rls.mjs

import { createClient } from "@supabase/supabase-js";

const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SR) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const c = createClient(URL, SR, { auth: { persistSession: false } });

const { data: users, error: uErr } = await c
  .from("users")
  .select("id,username,company_id,supabase_auth_id,role")
  .in("username", ["superadmin","a_admin","a_tec1","h_admin","c_admin"]);
console.log("== users demo ==");
console.log(uErr ? "ERR " + uErr.message : JSON.stringify(users, null, 2));

// Funciones de tenant existen?
const { data: fns } = await c.rpc("current_company_id", {}).select();
console.log("\n== current_company_id() en esta sesión (service-role) ==");
console.log(JSON.stringify(fns));

// Lista policies de users y companies (pg policies)
const { data: pol } = await c
  .from("pg_policies")
  .select("tablename, policyname, cmd, qual, with_check")
  .in("tablename", ["users","companies","clients"]);
console.log("\n== pg_policies ==");
console.log(pol ? JSON.stringify(pol, null, 2) : "n/a (quizás sin permiso a pg_catalog)");

// ¿Cuántas cuentas Auth hay? (lista emails que coinciden con demo)
const { data: lu, error: luErr } = await c.auth.admin.listUsers({ page: 0, perPage: 50 });
const emails = (lu?.users ?? []).map(u => u.email).filter(e => e && e.includes("navas.com"));
console.log("\n== auth.users (emails demo) ==");
console.log(luErr ? "ERR " + luErr.message : JSON.stringify(emails));