// Limpieza de SOLO las filas ficticias que la corrida fallida del seed creó.
// - 3 tenants NUEVOS (creados por el seed): se borra users → cascade + company → cascade.
//   Auth.users se borran por email (ma_*, pl_*, lo_* @navas.com).
// - 3 tenants EXISTENTES (demo): solo lo añadido por el seed →
//   inventory_items por sku (prefijos FA-/HC-/CP-), tasks por títulos, notifications text='Seed'.
// NO toca datos preexistentes de los tenants demo.
import { createClient } from "@supabase/supabase-js";
const URL = "https://hvysnxvuyexacktlwsbm.supabase.co";
const DOMAIN = "navas.com";

const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const jh = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

const NEW_SLUGS = { "metalmecanica-andina": "ma", "plasticos-del-sur": "pl", "logistica-expresa": "lo" };
const DEMO = {
  "Fábricas Andinas S.A.": ["FA-"],
  "Hoteles Caribe LTDA": ["HC-"],
  "Cementos Pacífico": ["CP-"],
};
const SEED_TASKS = [
  "Engrase semanal de puente grúa", "Levantamiento de stock mínimo en bodega", "Inspección de seguridad de cabina de pintura",
  "Prueba no destructiva de soldaduras", "Actualizar planes de mantenimiento CNC", "Revisión de refrigerante en centro de mecanizado", "Calibración de sensores de horno",
  "Cambio de molde en inyectora 350T", "Revisión de humedad en polipropileno", "Limpieza de secador de material", "Calibración de temperatura de extrusora",
  "Inspección de fuga de aire compresor", "Preparar pedido de masterbatch",
  "Calibración de báscula de plataforma", "Servicio técnico de grúa horquilla", "Inspección de grupo electrógeno", "Pedido de batería de repuesto",
  "Revisión de sorter de maletas", "Reemplazo de neumáticos macizos",
  "Engrase semanal Prensa Hidráulica", "Inspección de seguridad Montacargas", "Preparar pedido de rodamientos", "Prueba de estanqueidad compresor", "Actualizar plano de planta", "Revisión de niveles de refrigerante",
  "Chequeo trimestral planta CAT", "Revisión de filtros de chiller", "Inspección de bomba de piscina", "Pedido de neumáticos para montacargas",
  "Inspección de refractario Horno", "Cambio de filtros de mangas", "Revisión de carga de bolas molino", "Pedido de blindajes de molino",
];

async function delAuthByPrefix(prefix) {
  const { data: users } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const targets = (users?.users ?? []).filter((u) => u.email?.toLowerCase().includes(`@${DOMAIN}`) && u.email?.toLowerCase().startsWith(prefix));
  let n = 0;
  for (const t of targets) {
    const r = await fetch(`${URL}/auth/v1/admin/users/${t.id}`, { method: "DELETE", headers: jh });
    if (r.ok || r.status === 404) n++;
  }
  return n;
}

// 1) tenants nuevos: borrar company (cascade data) y auth users
for (const [slug, prefix] of Object.entries(NEW_SLUGS)) {
  const { data: co } = await svc.from("companies").select("id,name").eq("slug", slug);
  if (co?.length) {
    await svc.from("users").delete().eq("company_id", co[0].id); // script implícito antes de company
    const d = await svc.from("companies").delete().eq("id", co[0].id);
    console.log(`[nuevo] borrado company ${co[0].name}:`, d.error ? d.error.message : "ok");
    const au = await delAuthByPrefix(prefix);
    console.log(`       auth users borrados: ${au}`);
  } else console.log(`[nuevo] ${slug} no está (nada que borrar)`);
}

// 2) tenants demo: borrar inventario seed, tasks seed, notifs seed
const { data: comps } = await svc.from("companies").select("id,name");
for (const [name, prefixes] of Object.entries(DEMO)) {
  const co = comps?.find((c) => c.name === name);
  if (!co) { console.log(`[demo] ${name} no está`); continue; }
  let inv = 0;
  for (const p of prefixes) {
    const { data: rows } = await svc.from("inventory_items").select("id").ilike("sku", `${p}%`).eq("company_id", co.id);
    for (const r of rows ?? []) { const x = await svc.from("inventory_items").delete().eq("id", r.id); if (!x.error) inv++; }
  }
  const tDel = await svc.from("tasks").delete().eq("company_id", co.id).in("title", SEED_TASKS);
  const nDel = await svc.from("notifications").delete().eq("company_id", co.id).eq("text", "Seed");
  console.log(`[demo] ${name}: inv seed borradas ${inv}, tasks seed ${tDel.error ? "ERR "+tDel.error.message : tDel.count ?? "?"}, notifs seed ${nDel.error ? "ERR" : nDel.count ?? "?"}`);
}

console.log("cleanup listo");