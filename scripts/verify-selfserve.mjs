// Verificación RLS self-serve (Fase 4, migración 012).
// SOLO hace login + UPDATEs de prueba sobre `companies` (no siembra nada, no
// borra vínculos). Al final restaura el theme original del tenant A.
//
// Matriz:
//   1. admin A  → UPDATE theme de SU empresa  → 204 (permitido)
//   2. admin A  → UPDATE name de SU empresa   → fail (trigger bloquea identidad)
//   3. admin A  → UPDATE theme de empresa B   → fail (RLS: otra empresa)
//   4. admin B  → UPDATE theme de empresa A   → fail (RLS: otra empresa)
//   5. super_admin → UPDATE name de empresa A → 204 (permiso total)
//
// Uso:
//   node scripts/verify-selfserve.mjs
// (lee VITE_SUPABASE_ANON_KEY de .env; NO requiere service-role)

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
  const body = await res.json();
  if (!res.ok) return { ok: false, err: body.error_description ?? body.code };
  return { ok: true, token: body.access_token };
}

// getCompany usa el "view own company" del token (RLS: id = current_company_id())
async function getCompany(token) {
  const res = await fetch(`${URL}/rest/v1/companies?select=id,name,theme`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// PATCH: devuelve { status, rows } — `rows` = nº de filas realmente afectadas
// (vía Content-Range). RLS que filtra 0 filas → status 204 pero rows 0.
async function patch(token, id, body) {
  const res = await fetch(`${URL}/rest/v1/companies?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=minimal,count=exact" },
    body: JSON.stringify(body),
  });
  const range = res.headers.get("content-range") ?? "*/*";
  const rows = parseInt((range.split("/")[1] ?? "0"), 10);
  return { status: res.status, ok: res.ok, rows: Number.isNaN(rows) ? 0 : rows };
}

// `wrote` = cuántas filas debe haber tocado el UPDATE (0 si RLS/trigger lo bloqueó)
const check = (name, got, wrote) => {
  const pass = got.rows === wrote;
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}  (filas afectadas ${got.rows}, esperado ${wrote}, status ${got.status})`);
  return pass;
};

console.log("Fase 4 · Verificación RLS self-serve\n");
const adminA = await login("a_admin");
const adminB = await login("h_admin");
const superU = await login("superadmin");
if (!adminA.ok || !adminB.ok || !superU.ok) {
  console.error("Login fallido (¿seed no presente?):", { adminA, adminB, superU });
  process.exit(1);
}

const coA = await getCompany(adminA.token); // Fábricas Andinas (tena A)
const coB = await getCompany(adminB.token); // Hoteles Caribe (tenant B)
console.log("Tenant A:", coA?.name, coA?.id);
console.log("Tenant B:", coB?.name, coB?.id);
if (!coA || !coB) { console.error("No se pudo resolver una empresa."); process.exit(1); }

const snapshotTheme = coA.theme;
let pass = true;

// 1) admin A → theme de su empresa (permitido → toca 1 fila)
pass &= check("admin A actualiza theme PROPIA", await patch(adminA.token, coA.id, { theme: { ...snapshotTheme, selfserve_test: true } }), 1);

// 2) admin A → name de su empresa (bloqueado por trigger → 0 filas)
pass &= check("admin A NO puede cambiar name PROPIA", await patch(adminA.token, coA.id, { name: "HACKED" }), 0);

// 3) admin A → theme de empresa B (bloqueado por RLS → 0 filas)
pass &= check("admin A NO toca empresa AJENA B", await patch(adminA.token, coB.id, { theme: { selfserve_test: true } }), 0);

// 4) admin B → theme de empresa A (bloqueado → 0 filas)
pass &= check("admin B NO toca empresa AJENA A", await patch(adminB.token, coA.id, { theme: { selfserve_test: true } }), 0);

// 5) super_admin → name de empresa A (permitido → 1 fila)
pass &= check("super_admin sí cambia name de A", await patch(superU.token, coA.id, { name: coA.name }), 1);

// Restaurar theme original de A
await patch(adminA.token, coA.id, { theme: snapshotTheme });

console.log(`\n${pass ? "TODAS LAS COMPROBACIONES PASS" : "HUBO FALLOS"}`);
process.exit(pass ? 0 : 1);