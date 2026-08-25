// Verificador del seed-demo: hace login con CADA usuario (uno a uno) vía Supabase
// Auth (anon key, igual que la app) y consulta sus datos a través de RLS,
// confirmando que ve SOLO su empresa (aislamiento multi-tenant).
//
// Uso: node scripts/verify-seed.mjs
// Depende de que `seed-demo` ya se haya ejecutado (usuarios + datos poblados).

const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY
  ?? (await import("node:fs")).readFileSync("C:/Users/Nvas/Free Claude/NavTicket/.env", "utf8")
    .match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1]
  ?? "";
const PASSWORD = "Demo#2026";
const DOMAIN = "navas.com";

const USERS = [
  "superadmin",
  // Fábricas Andinas
  "a_dev", "a_admin", "a_sup", "a_aux", "a_tec1", "a_tec2",
  // Hoteles Caribe
  "h_admin", "h_sup", "h_aux", "h_tec1",
  // Cementos Pacífico
  "c_admin", "c_sup", "c_aux", "c_tec1",
];

async function login(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) return { ok: false, error: body.error_description ?? body.msg ?? body.code };
  return { ok: true, token: body.access_token };
}

async function countWith(token, table, where = "") {
  const q = where ? `?select=id&${where}` : "?select=id";
  const res = await fetch(`${URL}/rest/v1/${table}${q}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return `ERR ${res.status}`;
  const rows = await res.json();
  return rows.length;
}

async function companyName(token) {
  const res = await fetch(`${URL}/rest/v1/companies?select=name`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "?";
  const rows = await res.json();
  return rows[0]?.name ?? "(sin empresa)";
}

const rows = [];
for (const username of USERS) {
  const email = `${username}@${DOMAIN}`;
  const lg = await login(email, PASSWORD);
  if (!lg.ok) {
    rows.push({ usuario: username, login: `❌ ${lg.error}` });
    continue;
  }
  const [company, clients, equipment, orders, tasks] = await Promise.all([
    companyName(lg.token),
    countWith(lg.token, "clients"),
    countWith(lg.token, "equipment"),
    countWith(lg.token, "orders"),
    countWith(lg.token, "tasks"),
  ]);
  rows.push({
    usuario: username, login: "✅ OK", company,
    clients, equipment, orders, tasks,
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log("\n== Verificación de usuarios (login + aislamiento) ==");
console.log(`${pad("usuario", 12)} ${pad("login", 10)} ${pad("empresa", 24)} ${pad("cli", 4)} ${pad("eq", 3)} ${pad("ord", 4)} ${pad("tasks", 5)}`);
for (const r of rows) {
  console.log(`${pad(r.usuario, 12)} ${pad(r.login === "✅ OK" ? "OK" : "FAIL", 10)} ${pad(r.company ?? "", 24)} ${pad(r.clients ?? "", 4)} ${pad(r.equipment ?? "", 3)} ${pad(r.orders ?? "", 4)} ${pad(r.tasks ?? "", 5)} ${r.login !== "✅ OK" ? r.login : ""}`);
}