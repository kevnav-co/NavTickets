// # Verificación RLS de la migración 014 (inventario).
// NO siembra datos: crea una fila de prueba controlada y la borra al final.
//
// Matriz:
//   1. a_tec1 (technician)   SELECT inventory_items                 → permite (lectura tenant)
//   2. a_tec1 (technician)   INSERT inventory_items (sin company)   → 0 filas (bloqueado)
//   3. a_admin (admin)       INSERT inventory_items (con su company)→ 1 fila (permitido)
//   4. h_admin (otro tenant) INSERT inventory_items con company de A → 0 filas (bloqueado cross-tenant)
//   5. a_admin               DELETE la fila de prueba               → limpieza
//
// Uso: node scripts/verify-inventory-rls.mjs
import { readFileSync } from "node:fs";

const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const DOMAIN = "navas.com";
const PASSWORD = "Demo#2026";
const ANON = readFileSync("C:/Users/Nvas/Free Claude/NavTicket/.env", "utf8")
  .match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1] ?? "";
if (!ANON) { console.error("Falta VITE_SUPABASE_ANON_KEY en .env"); process.exit(1); }

async function login(username) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${username}@${DOMAIN}`, password: PASSWORD }),
  });
  const b = await res.json();
  if (!res.ok) return { ok: false, err: b.error_description ?? b.code ?? b.msg };
  return { ok: true, token: b.access_token };
}

async function select(token, table, extra = "") {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id${extra}&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null };
}

async function insert(token, table, body) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal,count=exact" },
    body: JSON.stringify(body),
  });
  const range = res.headers.get("content-range") ?? "*/*";
  const n = parseInt((range.split("/")[1] ?? "0"), 10);
  return { ok: res.ok, status: res.status, rows: Number.isNaN(n) ? 0 : n };
}

async function del(token, table, id) {
  await fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
}

const aAdmin = await login("a_admin");
const aTech = await login("a_tec1");
const hAdmin = await login("h_admin");
for (const [k, v] of Object.entries({ aAdmin, aTech, hAdmin })) {
  if (!v?.ok) { console.error(`Login ${k} FALLO`, v?.err); process.exit(1); }
}

// company_id de A desde una fila propia (clients/equipment se leen por tenant).
const aClient = await select(aAdmin.token, "clients", ",company_id");
const companyA = aClient?.body?.[0]?.company_id;
if (!companyA) { console.error("No se pudo resolver company_id de A"); process.exit(1); }

let pass = 0, fail = 0;
const check = (name, got, expected) => {
  const ok = got === expected; ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(48)} got=${got} expected=${expected}`);
};

const TEST = { name: "FILTRO RLS PRUEBA FASE6", sku: "RLS-TEST", quantity: 0 };

// 1. technician lee inventario
check("technician SELECT inventory_items", (await select(aTech.token, "inventory_items")).ok, true);

// 2. technician no puede crear stock (y sin company_id tampoco)
check("technician INSERT inventory_items (sin company)", (await insert(aTech.token, "inventory_items", TEST)).rows, 0);

// 3. admin inserta con SU company → permitido
const ins = await insert(aAdmin.token, "inventory_items", { ...TEST, company_id: companyA });
check("admin INSERT inventory_items (con company)", ins.rows, 1);

let createdId = null;
if (ins.rows === 1) {
  const list = await select(aAdmin.token, "inventory_items", `&name=eq.${encodeURIComponent(TEST.name)}`);
  createdId = list?.body?.[0]?.id ?? null;
}

// 4. admin de otro tenant (B) inserta con company de A → bloqueado
check("h_admin cross-tenant INSERT", (await insert(hAdmin.token, "inventory_items", { ...TEST, company_id: companyA })).rows, 0);

// 5. limpieza
if (createdId) await del(aAdmin.token, "inventory_items", createdId);
console.log("Limpieza fila prueba en empresa A:", createdId ? "hecha" : "nada que borrar");

console.log(`\n${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);