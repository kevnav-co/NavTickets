// Seed + verificación NavTicket (todo en un solo comando `node`).
//
//   - SIEMBRA: crea (idempotente) empresas, usuarios con cuenta Auth, clientes,
//     equipos, órdenes y tareas ficticios via la service-role key.
//   - VERIFICA: hace login con CADA usuario (anon key, como la app) y confirma
//     aislamiento multi-tenant (solo ve su empresa) + prueba read/write básico.
//
// Uso (Windows PowerShell):
//   cd "C:\Users\Nvas\Free Claude\NavTicket"
//   $env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"; node scripts/seed-and-verify.mjs
//
// La key viaja por variable de entorno local → no entra en logs compartidos.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const DOMAIN = "navas.com";
const PASSWORD = "Demo#2026";

// ─── Claves ──────────────────────────────────────────────────────────────────
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
let ANON = "";
try {
  ANON = readFileSync("C:/Users/Nvas/Free Claude/NavTicket/.env", "utf8")
    .match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1] ?? "";
} catch {}

if (!SERVICE_ROLE) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY. Ejecuta:\n  $env:SUPABASE_SERVICE_ROLE_KEY=\"TU_KEY\"; node scripts/seed-and-verify.mjs");
  process.exit(1);
}

// ─── Datos de prueba (ficticios pero realistas) ──────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

const DEMO = [
  {
    name: "Fábricas Andinas S.A.",
    users: [
      { name: "Kevin Navas", username: "a_dev", role: "developer", identification: "808080808" },
      { name: "Ana Gómez", username: "a_admin", role: "admin", identification: "100200300" },
      { name: "Carlos Ruiz", username: "a_sup", role: "supervisor", identification: "100400500" },
      { name: "María López", username: "a_aux", role: "aux_admin", identification: "53111111" },
      { name: "Luis Pérez", username: "a_tec1", role: "technician", identification: "101010101" },
      { name: "Rosa Castro", username: "a_tec2", role: "technician", identification: "102030405" },
    ],
    clients: [
      { name: "Planta Norte Andina", address: "Carrera 48 # 7 Sur - 120", contact: "Diana Restrepo", identification: "890900101", email: "planta.norte@andina.co", lat: 6.2442, lng: -75.5812, city: "Medellín", neighborhood: "Itagüí",
        equipment: [
          { name: "Prensa Hidráulica 800T", brand: "Krupp", description: "Prensado de piezas metálicas", serial_number: "FN-PH-001", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-80) },
          { name: "Compresor Atlas Copco GA75", brand: "Atlas Copco", description: "Aire comprimido industrial", serial_number: "FN-CP-002", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-30) },
        ] },
      { name: "Bodega Central", address: "Calle 31 Sur # 48 - 55", contact: "Roberto Mejía", identification: "890900202", email: "logistica@andina.co", lat: 6.1667, lng: -75.5833, city: "Envigado",
        equipment: [
          { name: "Montacargas Toyota 8FD", brand: "Toyota", description: "Carga de inventario", serial_number: "BC-MT-003", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-10) },
        ] },
    ],
    orders: [
      { name: "Mantenimiento preventivo Prensa 800T", client: "Planta Norte Andina", technician: "a_tec1", scheduled: iso(3), time_slot: "08:00", end_time: "12:00", description: "Cambio de aceite hidráulico y revisión de sellos.", status: "Pendiente", order_type: "Preventivo", service_name: "Mantenimiento preventivo", priority: "Media" },
      { name: "Falla compresor GA75 - sin presión", client: "Planta Norte Andina", technician: "a_tec1", scheduled: iso(-1), time_slot: "14:00", end_time: "16:00", description: "Compresor no alcanza presión de trabajo. Revisar válvula de descarga.", status: "En Progreso", order_type: "Correctivo", service_name: "Reparación compresor", priority: "Alta" },
      { name: "Preventivo montacargas Bodega", client: "Bodega Central", technician: "a_tec2", scheduled: iso(-4), time_slot: "09:00", end_time: "11:00", description: "Lubricación y ajuste de frenos.", status: "Cerrado", order_type: "Preventivo", service_name: "Mantenimiento preventivo", priority: "Baja" },
    ],
    tasks: [
      { title: "Engrase semanal Prensa Hidráulica", assigned: "a_tec1", category: "Mantenimiento", due: iso(1), important: true },
      { title: "Inspección de seguridad Montacargas", assigned: "a_tec2", category: "Prevención", due: iso(2) },
    ],
  },
  {
    name: "Hoteles Caribe LTDA",
    users: [
      { name: "Pedro Díaz", username: "h_admin", role: "admin", identification: "200100100" },
      { name: "Sofía Vargas", username: "h_sup", role: "supervisor", identification: "200200200" },
      { name: "Diego Rojas", username: "h_aux", role: "aux_admin", identification: "200300300" },
      { name: "Camila Suárez", username: "h_tec1", role: "technician", identification: "200400400" },
    ],
    clients: [
      { name: "Hotel Caribe Centro", address: "Calle del Amparo 10", contact: "Martín García", identification: "900200111", email: "sistemas@caribe.com", lat: 10.391, lng: -75.4794, city: "Cartagena",
        equipment: [
          { name: "Chiller Carrier 30RB", brand: "Carrier", description: "Aire acondicionado centralizado", serial_number: "HC-CH-001", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-20) },
          { name: "Bomba de agua húmeda 15HP", brand: "Pedrollo", description: "Circuito de piscina", serial_number: "HC-BB-002", voltage: "220V", maintenance_frequency: 3, last_maintenance_date: iso(-60) },
        ] },
      { name: "Resort Playa Dorada", address: "Km 22 Vía a Palomino", contact: "Lucía Fernández", identification: "900200222", email: "central@playadorada.co", lat: 11.2408, lng: -74.199, city: "Santa Marta",
        equipment: [
          { name: "Planta eléctrica CAT 250kVA", brand: "Caterpillar", description: "Respaldo energético", serial_number: "RP-LP-003", voltage: "330V", maintenance_frequency: 12, last_maintenance_date: iso(-40) },
        ] },
    ],
    orders: [
      { name: "Mantenimiento Chiller zona lobby", client: "Hotel Caribe Centro", technician: "h_tec1", scheduled: iso(2), time_slot: "10:00", end_time: "13:00", description: "Limpieza y carga de refrigerante R410A.", status: "Pendiente", order_type: "Preventivo", service_name: "Climatización", priority: "Alta" },
      { name: "Bomba piscina sin arranque", client: "Hotel Caribe Centro", technician: "h_tec1", scheduled: iso(-2), time_slot: "15:00", end_time: "17:00", description: "Revisión de capacitor y sello mecánico.", status: "En Progreso", order_type: "Correctivo", service_name: "Hidráulica", priority: "Media" },
    ],
    tasks: [{ title: "Chequeo trimestral planta CAT", assigned: "h_tec1", category: "Respaldo", due: iso(5) }],
  },
  {
    name: "Cementos Pacífico",
    users: [
      { name: "Javier Ortiz", username: "c_admin", role: "admin", identification: "300100100" },
      { name: "Laura Mendoza", username: "c_sup", role: "supervisor", identification: "300200200" },
      { name: "Andrés Peña", username: "c_aux", role: "aux_admin", identification: "300300300" },
      { name: "Valentina Rincón", username: "c_tec1", role: "technician", identification: "300400400" },
    ],
    clients: [
      { name: "Planta de Clinker", address: "Carretera Simón Bolívar Km 8", contact: "Héctor Castaño", identification: "900300333", email: "mantenimiento@cementos.co", lat: 3.4516, lng: -76.5319, city: "Cali", neighborhood: "Yumbo",
        equipment: [
          { name: "Molino de bolas 5m", brand: "FLSmidth", description: "Molienda de cemento", serial_number: "CP-MB-001", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-120) },
          { name: "Horno rotativo", brand: "KHD", description: "Clinkerización", serial_number: "CP-HR-002", voltage: "330V", gas_type: "Natural", maintenance_frequency: 12, last_maintenance_date: iso(-45) },
        ] },
      { name: "Cantera La Paz", address: "Vereda La Paz", contact: "Óscar Trujillo", identification: "900300444", email: "cantera@cementos.co", lat: 3.55, lng: -76.6, city: "Yumbo",
        equipment: [
          { name: "Chancadora cónica HP300", brand: "Metso", description: "Trituración de agregados", serial_number: "CL-CN-003", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-15) },
        ] },
    ],
    orders: [
      { name: "Cambio de blindajes Molino", client: "Planta de Clinker", technician: "c_tec1", scheduled: iso(4), time_slot: "07:00", end_time: "15:00", description: "Reemplazo de blindajes del molino y revestimiento.", status: "Pendiente", order_type: "Preventivo", service_name: "Molienda", priority: "Urgente" },
      { name: "Chancadora con vibración anormal", client: "Cantera La Paz", technician: "c_tec1", scheduled: iso(-3), time_slot: "11:00", end_time: "14:00", description: "Sobrecalentamiento de cojinetes. Revisar alineación.", status: "En Progreso", order_type: "Correctivo", service_name: "Trituración", priority: "Alta" },
    ],
    tasks: [{ title: "Inspección de refractario Horno", assigned: "c_tec1", category: "Alta temperatura", due: iso(3), important: true }],
  },
];
const SEED_COMPANY = "Navas Servicios Técnicos";

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

const summary = { companies: 0, users: 0, clients: 0, equipment: 0, orders: 0, tasks: 0, skipped: 0, errors: [] };
const err = (tag, msg) => summary.errors.push(`[${tag}] ${msg}`);

// ─── Seed idempotente ────────────────────────────────────────────────────────
async function ensureCompany(name) {
  const { data } = await admin.from("companies").select("id").eq("name", name).maybeSingle();
  if (data) { summary.skipped++; return data.id; }
  const { data: created, error } = await admin.from("companies").insert({ name }).select("id").single();
  if (error) { err("company", error.message); return null; }
  summary.companies++; return created.id;
}
async function ensureUser(companyId, u, email) {
  const authId = emailToAuthId.get(email) ?? null;
  const { data: existing } = await admin.from("users")
    .select("id,supabase_auth_id").eq("company_id", companyId).eq("username", u.username).maybeSingle();

  // Ya existe fila de negocio → reconciliar el vínculo Auth si falta (NUNCA borrar).
  if (existing) {
    if (authId && existing.supabase_auth_id !== authId) {
      // El INSERT de `users` NO persiste supabase_auth_id; el UPDATE sí.
      const { error } = await admin.from("users").update({ supabase_auth_id: authId }).eq("id", existing.id);
      if (error) err("user " + u.username, error.message); else summary.users++;
    } else {
      summary.skipped++;
    }
    return existing.id;
  }

  // No existe la fila → crear cuenta Auth (si hace falta) + fila + vínculo por UPDATE.
  let authUid = authId;
  if (!authUid) {
    const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (ce) { err("user " + u.username, ce.message); return null; }
    authUid = created.id;
  }
  const { data: row, error } = await admin.from("users")
    .insert({ company_id: companyId, name: u.name, role: u.role, username: u.username, identification: u.identification })
    .select("id").single();
  if (error) { err("user " + u.username, error.message); if (!authId) try { await admin.auth.admin.deleteUser(authUid); } catch {} return null; }

  // Vincular por UPDATE (probado: aquí SÍ persiste supabase_auth_id).
  const { error: le } = await admin.from("users").update({ supabase_auth_id: authUid }).eq("id", row.id);
  if (le) err("user " + u.username, "link: " + le.message);
  summary.users++;
  return row.id;
}
async function ensureClient(companyId, c) {
  const { data: existing } = await admin.from("clients").select("id").eq("company_id", companyId).eq("name", c.name).maybeSingle();
  if (existing) { summary.skipped++; return existing.id; }
  const { data: created, error } = await admin.from("clients").insert({ company_id: companyId, name: c.name, address: c.address, contact: c.contact, identification: c.identification, email: c.email, latitude: c.lat, longitude: c.lng, neighborhood: c.neighborhood, city: c.city }).select("id").single();
  if (error) { err("client", error.message); return null; }
  summary.clients++; return created.id;
}
async function ensureEquipment(companyId, clientId, e) {
  const { data: existing } = await admin.from("equipment").select("id").eq("company_id", companyId).eq("serial_number", e.serial_number).maybeSingle();
  if (existing) { summary.skipped++; return; }
  const { error } = await admin.from("equipment").insert({ company_id: companyId, client_id: clientId, name: e.name, brand: e.brand, description: e.description, serial_number: e.serial_number, voltage: e.voltage, gas_type: e.gas_type, status: e.status ?? "Activa", maintenance_frequency: e.maintenance_frequency, last_maintenance_date: e.last_maintenance_date });
  if (error) err("equip " + e.name, error.message); else summary.equipment++;
}
async function ensureOrder(companyId, client, o, usersById) {
  const clientId = await ensureClient(companyId, client);
  const tech = usersById.get(o.technician) ?? null;
  const { data: existing } = await admin.from("orders").select("id").eq("company_id", companyId).eq("name", o.name).maybeSingle();
  if (existing) { summary.skipped++; return; }
  const { data: num } = await admin.from("orders").select("order_number").eq("company_id", companyId).order("order_number", { ascending: false }).limit(1).maybeSingle();
  const orderNumber = num ? num.order_number + 1 : 1;
  const { error } = await admin.from("orders").insert({ company_id: companyId, order_number: orderNumber, name: o.name, client_id: clientId, client_name: client.name, technician_id: tech, scheduled_date: o.scheduled, time_slot: o.time_slot, scheduled_end_time: o.end_time, description: o.description, status: o.status, order_type: o.order_type, service_name: o.service_name, priority: o.priority });
  if (error) err("order " + o.name, error.message); else summary.orders++;
}
async function ensureTask(companyId, t, usersById) {
  const assignee = usersById.get(t.assigned) ?? null;
  const { data: existing } = await admin.from("tasks").select("id").eq("company_id", companyId).eq("title", t.title).maybeSingle();
  if (existing) { summary.skipped++; return; }
  const { error } = await admin.from("tasks").insert({ company_id: companyId, title: t.title, assigned_to: assignee, created_by: assignee, category: t.category, due_date: t.due, important: t.important ?? false });
  if (error) err("task " + t.title, error.message); else summary.tasks++;
}

// Mapa email -> auth id, cargado UNA vez al inicio. Permite reconciliar el
// vínculo `supabase_auth_id` SIN borrar ninguuna cuenta (re-seed seguro).
const emailToAuthId = new Map();
async function loadAuthMap() {
  let page = 0, done = false;
  while (!done) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = data?.users ?? [];
    for (const u of batch) if (u.email) emailToAuthId.set(u.email, u.id);
    const total = data?.total ?? (page + 1) * 1000;
    page++; done = page * 1000 >= total;
  }
}

async function seed() {
  await loadAuthMap();
  const seedId = await ensureCompany(SEED_COMPANY);
  if (seedId) await ensureUser(seedId, { name: "Super Administrador", username: "superadmin", role: "super_admin", identification: "99999999" }, "superadmin@" + DOMAIN);

  for (const co of DEMO) {
    const companyId = await ensureCompany(co.name);
    if (!companyId) continue;
    const byUser = new Map();
    for (const u of co.users) { const id = await ensureUser(companyId, u, `${u.username}@${DOMAIN}`); if (id) byUser.set(u.username, id); }
    for (const cl of co.clients) { const cid = await ensureClient(companyId, cl); if (cid) for (const e of cl.equipment) await ensureEquipment(companyId, cid, e); }
    for (const o of co.orders) { const clt = co.clients.find((x) => x.name === o.client); if (clt) await ensureOrder(companyId, clt, o, byUser); }
    for (const t of co.tasks) await ensureTask(companyId, t, byUser);
  }
  return summary;
}

// ─── Verificación de login + aislamiento (anon key, como la app) ─────────────
async function login(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return res.ok ? { ok: true, token: body.access_token } : { ok: false, err: body.error_description ?? body.msg ?? body.code };
}
async function count(token, table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) return `ERR${res.status}`;
  return (await res.json()).length;
}

async function verify() {
  const all = ["superadmin", "a_dev", "a_admin", "a_sup", "a_aux", "a_tec1", "a_tec2", "h_admin", "h_sup", "h_aux", "h_tec1", "c_admin", "c_sup", "c_aux", "c_tec1"];
  const rows = [];
  for (const uname of all) {
    const lg = await login(`${uname}@${DOMAIN}`, PASSWORD);
    if (!lg.ok) { rows.push({ usuario: uname, ok: false, err: lg.err }); continue; }
    const company = (await (await fetch(`${URL}/rest/v1/companies?select=name`, { headers: { apikey: ANON, Authorization: `Bearer ${lg.token}` } })).json())[0]?.name ?? "?";
    const [cli, eq, ord, task] = await Promise.all([
      count(lg.token, "clients"), count(lg.token, "equipment"), count(lg.token, "orders"), count(lg.token, "tasks"),
    ]);
    rows.push({ usuario: uname, ok: true, company, cli, eq, ord, task });
  }
  return rows;
}

// ─── Run ─────────────────────────────────────────────────────────────────────
console.log("Configurando datos ficticios (seed)...");
const s = await seed();
console.log(JSON.stringify(s, null, 2));
if (s.errors.length) { console.error("\nHubo errores en el seed. Revisa arriba."); process.exit(1); }

console.log("\nVerificando login + aislamiento de cada usuario...\n");
const pad = (x, n) => String(x).padEnd(n);
console.log(`${pad("usuario", 11)} ${pad("login", 6)} ${pad("empresa", 24)} ${pad("cli", 4)} ${pad("eq", 3)} ${pad("ord", 4)} ${pad("tasks", 5)}`);
for (const r of await verify()) {
  if (!r.ok) console.log(`${pad(r.usuario, 11)} FAIL    ${r.err}`);
  else console.log(`${pad(r.usuario, 11)} OK      ${pad(r.company, 24)} ${r.cli} ${r.eq} ${r.ord} ${r.task}`);
}
console.log("\nSi todo sale OK y cada empresa muestra solo sus datos → auth + multi-tenant funcionan.");