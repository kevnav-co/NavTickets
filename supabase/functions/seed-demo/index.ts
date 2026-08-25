// Supabase Edge Function — Seed de datos de prueba (empresas + datos ficticios).
// Deploy: `supabase functions deploy seed-demo`.
//
// Crea un set 100% ficticio y REALISTA para probar TODAS las funcionalidades:
//   - Empresas (tenants) con su staff por rol (developer/admin/supervisor/
//     aux_admin/technician) + un super_admin de plataforma.
//   - Por empresa: clientes (con GPS), equipos, órdenes de servicio en distintos
//     estados (Pendiente/En Progreso/Cerrado) y tareas asignadas a técnicos.
//
// Usa la service-role key → bypasa RLS. Idempotente: cada entidad se omite si ya
// existe (no falla, no duplica).
//
// Guard: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
// Login (AuthContext): username@navas.com. Password común: "Demo#2026".

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_DOMAIN = Deno.env.get("EMAIL_DOMAIN") ?? "navas.com";
const DEMO_PASSWORD = "Demo#2026";

interface DemoUser {
  name: string;
  username: string;
  role: string;
  identification?: string;
}
interface DemoEquipment {
  name: string;
  brand?: string;
  description?: string;
  serial_number: string;
  voltage?: string;
  gas_type?: string;
  status?: string;
  maintenance_frequency?: number;
  last_maintenance_date?: string;
}
interface DemoClient {
  name: string;
  address: string;
  contact: string;
  identification?: string;
  email?: string;
  lat: number;
  lng: number;
  city: string;
  neighborhood?: string;
  equipment: DemoEquipment[];
}
interface DemoOrder {
  name: string;
  client: string;               // client.name
  technician: string;           // user.username
  scheduled: string;            // ISO date
  time_slot: string;
  end_time: string;
  description: string;
  status: string;
  order_type: string;
  service_name: string;
  priority: string;
}
interface DemoTask {
  title: string;
  assigned: string;             // user.username
  category: string;
  due: string;                  // ISO date
  important?: boolean;
}
interface DemoCompany {
  name: string;
  users: DemoUser[];
  clients: DemoClient[];
  orders: DemoOrder[];
  tasks: DemoTask[];
}

// ─── Datos de prueba (ficticios pero realistas) ──────────────────────────────
const DAY = 24 * 60 * 60 * 1000;

// Fechas relativas a hoy (el edge DE aquí sí puede usar Date).
function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * DAY).toISOString().slice(0, 10);
}

const DEMO: DemoCompany[] = [
  {
    name: "Fábricas Andinas S.A.",
    users: [
      { name: "Kevin Navas", username: "defi", role: "developer", identification: "808080808" },
      { name: "Ana Gómez", username: "a_admin", role: "admin", identification: "100200300" },
      { name: "Carlos Ruiz", username: "a_sup", role: "supervisor", identification: "100400500" },
      { name: "María López", username: "a_aux", role: "aux_admin", identification: "53111111" },
      { name: "Luis Pérez", username: "a_tec1", role: "technician", identification: "101010101" },
      { name: "Rosa Castro", username: "a_tec2", role: "technician", identification: "102030405" },
    ],
    clients: [
      {
        name: "Planta Norte Andina", address: "Carrera 48 # 7 Sur - 120", contact: "Diana Restrepo",
        identification: "890900101", email: "planta.norte@andina.co", lat: 6.2442, lng: -75.5812,
        city: "Medellín", neighborhood: "Itagüí",
        equipment: [
          { name: "Prensa Hidráulica 800T", brand: "Krupp", description: "Prensado de piezas metálicas", serial_number: "FN-PH-001", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-80) },
          { name: "Compresor Atlas Copco GA75", brand: "Atlas Copco", description: "Aire comprimido industrial", serial_number: "FN-CP-002", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-30) },
        ],
      },
      {
        name: "Bodega Central", address: "Calle 31 Sur # 48 - 55", contact: "Roberto Mejía",
        identification: "890900202", email: "logistica@andina.co", lat: 6.1667, lng: -75.5833,
        city: "Envigado",
        equipment: [
          { name: "Montacargas Toyota 8FD", brand: "Toyota", description: "Carga de inventario", serial_number: "BC-MT-003", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-10) },
        ],
      },
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
      {
        name: "Hotel Caribe Centro", address: "Calle del Amparo 10", contact: "Martín García",
        identification: "900200111", email: "sistemas@caribe.com", lat: 10.391, lng: -75.4794,
        city: "Cartagena",
        equipment: [
          { name: "Chiller Carrier 30RB", brand: "Carrier", description: "Aire acondicionado centralizado", serial_number: "HC-CH-001", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-20) },
          { name: "Bomba de agua húmeda 15HP", brand: "Pedrollo", description: "Circuito de piscina", serial_number: "HC-BB-002", voltage: "220V", maintenance_frequency: 3, last_maintenance_date: iso(-60) },
        ],
      },
      {
        name: "Resort Playa Dorada", address: "Km 22 Vía a Palomino", contact: "Lucía Fernández",
        identification: "900200222", email: "central@playadorada.co", lat: 11.2408, lng: -74.199,
        city: "Santa Marta",
        equipment: [
          { name: "Planta eléctrica CAT 250kVA", brand: "Caterpillar", description: "Respaldo energético", serial_number: "RP-LP-003", voltage: "330V", maintenance_frequency: 12, last_maintenance_date: iso(-40) },
        ],
      },
    ],
    orders: [
      { name: "Mantenimiento Chiller zona lobby", client: "Hotel Caribe Centro", technician: "h_tec1", scheduled: iso(2), time_slot: "10:00", end_time: "13:00", description: "Limpieza y carga de refrigerante R410A.", status: "Pendiente", order_type: "Preventivo", service_name: "Climatización", priority: "Alta" },
      { name: "Bomba piscina sin arranque", client: "Hotel Caribe Centro", technician: "h_tec1", scheduled: iso(-2), time_slot: "15:00", end_time: "17:00", description: "Revisión de capacitor y sello mecánico.", status: "En Progreso", order_type: "Correctivo", service_name: "Hidráulica", priority: "Media" },
    ],
    tasks: [
      { title: "Chequeo trimestral planta CAT", assigned: "h_tec1", category: "Respaldo", due: iso(5) },
    ],
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
      {
        name: "Planta de Clinker", address: "Carretera Simón Bolívar Km 8", contact: "Héctor Castaño",
        identification: "900300333", email: "mantenimiento@cementos.co", lat: 3.4516, lng: -76.5319,
        city: "Cali", neighborhood: "Yumbo",
        equipment: [
          { name: "Molino de bolas 5m", brand: "FLSmidth", description: "Molienda de cemento", serial_number: "CP-MB-001", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-120) },
          { name: "Horno rotativo", brand: "KHD", description: "Clinkerización", serial_number: "CP-HR-002", voltage: "330V", gas_type: "Natural", maintenance_frequency: 12, last_maintenance_date: iso(-45) },
        ],
      },
      {
        name: "Cantera La Paz", address: "Vereda La Paz", contact: "Óscar Trujillo",
        identification: "900300444", email: "cantera@cementos.co", lat: 3.55, lng: -76.6,
        city: "Yumbo",
        equipment: [
          { name: "Chancadora cónica HP300", brand: "Metso", description: "Trituración de agregados", serial_number: "CL-CN-003", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-15) },
        ],
      },
    ],
    orders: [
      { name: "Cambio de blindajes Molino", client: "Planta de Clinker", technician: "c_tec1", scheduled: iso(4), time_slot: "07:00", end_time: "15:00", description: "Reemplazo de blindajes del molino y revestimiento.", status: "Pendiente", order_type: "Preventivo", service_name: "Molienda", priority: "Urgente" },
      { name: "Chancadora con vibración anormal", client: "Cantera La Paz", technician: "c_tec1", scheduled: iso(-3), time_slot: "11:00", end_time: "14:00", description: "Sobrecalentamiento de cojinetes. Revisar alineación.", status: "En Progreso", order_type: "Correctivo", service_name: "Trituración", priority: "Alta" },
    ],
    tasks: [
      { title: "Inspección de refractario Horno", assigned: "c_tec1", category: "Alta temperatura", due: iso(3), important: true },
    ],
  },
];

const SEED_COMPANY_NAME = "Navas Servicios Técnicos"; // empresa semilla (super_admin)

const PROJECT_REF = "hvysnxvuyexacktlwsbm";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Decodifica el payload de un JWT (sin firmar) para el guard.
function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bino = atob(b64);
    const bytes = Uint8Array.from(bino, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ─── Guard: exige un JWT service_role válido del proyecto (no igualdad con ─
  //     el secret, que puede estar rotado). Solo quien tenga una credential
  //     service_role puede disparar el seed.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = token ? jwtPayload(token) : null;
  const isServiceRole = payload?.role === "service_role" && payload?.ref === PROJECT_REF;
  if (!isServiceRole) {
    return json({ error: "Semilla rechazada (requires SERVICE_ROLE_KEY)" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = {
    companies: 0, users: 0, clients: 0, equipment: 0, orders: 0, tasks: 0,
    skipped: 0, errors: [] as string[],
  };
  const err = (tag: string, msg: string) => summary.errors.push(`[${tag}] ${msg}`);

  // ─── Helpers idempotentes: crean si falta, devuelven el id ────────────────
  async function ensureCompany(name: string): Promise<string | null> {
    const { data, error } = await supabase.from("companies").select("id").eq("name", name).maybeSingle();
    if (error) return err("company " + name, error.message), null;
    if (data) { summary.skipped++; return data.id; }
    const { data: created, error: insErr } = await supabase.from("companies").insert({ name }).select("id").single();
    if (insErr) return err("company " + name, insErr.message), null;
    summary.companies++;
    return created.id;
  }

  async function ensureUser(companyId: string, u: DemoUser, email: string): Promise<string | null> {
    const { data: existing, error } = await supabase.from("users")
      .select("id").eq("company_id", companyId).eq("username", u.username).maybeSingle();
    if (error) return err("user " + u.username, error.message), null;
    if (existing) { summary.skipped++; return existing.id; }

    let authUid: string | null = null;
    try {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
      if (createErr) throw createErr;
      authUid = created.id;
      const row: Record<string, unknown> = {
        company_id: companyId,
        name: u.name,
        role: u.role,
        username: u.username,
        // La tabla `users` NO tiene columna email (el email vive en auth.users).
        supabase_auth_id: authUid,
      };
      if (u.identification) row.identification = u.identification;
      const { data: userRow, error: insErr } = await supabase.from("users").insert(row).select("id").single();
      if (insErr) throw insErr;
      summary.users++;
      return userRow.id;
    } catch (e: any) {
      err("user " + u.username, e.message);
      if (authUid) await supabase.auth.admin.deleteUser(authUid).catch(() => {});
      return null;
    }
  }

  async function ensureClient(companyId: string, c: DemoClient): Promise<string | null> {
    const { data: existing, error } = await supabase.from("clients")
      .select("id").eq("company_id", companyId).eq("name", c.name).maybeSingle();
    if (error) return err("client " + c.name, error.message), null;
    if (existing) { summary.skipped++; return existing.id; }
    const { data: created, error: insErr } = await supabase.from("clients")
      .insert({ company_id: companyId, name: c.name, address: c.address, contact: c.contact, identification: c.identification, email: c.email, latitude: c.lat, longitude: c.lng, neighborhood: c.neighborhood, city: c.city })
      .select("id").single();
    if (insErr) return err("client " + c.name, insErr.message), null;
    summary.clients++;
    return created.id;
  }

  async function ensureEquipment(companyId: string, clientId: string, eq: DemoEquipment): Promise<void> {
    const { data: existing, error } = await supabase.from("equipment")
      .select("id").eq("company_id", companyId).eq("serial_number", eq.serial_number).maybeSingle();
    if (error) return err("equip " + eq.serial_number, error.message);
    if (existing) { summary.skipped++; return; }
    const { error: insErr } = await supabase.from("equipment")
      .insert({ company_id: companyId, client_id: clientId, name: eq.name, brand: eq.brand, description: eq.description, serial_number: eq.serial_number, voltage: eq.voltage, gas_type: eq.gas_type, status: eq.status ?? "Activa", maintenance_frequency: eq.maintenance_frequency, last_maintenance_date: eq.last_maintenance_date });
    if (insErr) err("equip " + eq.serial_number, insErr.message); else summary.equipment++;
  }

  async function ensureOrder(companyId: string, c: DemoClient, o: DemoOrder, userByUsername: Map<string, string>): Promise<void> {
    const client = await ensureClient(companyId, c);
    if (!client) return;
    const techId = userByUsername.get(o.technician) ?? null;
    const { data: existing, error } = await supabase.from("orders")
      .select("id").eq("company_id", companyId).eq("name", o.name).maybeSingle();
    if (error) return err("order " + o.name, error.message);
    if (existing) { summary.skipped++; return; }
    const { data: num, error: numErr } = await supabase.from("orders")
      .select("order_number").eq("company_id", companyId).order("order_number", { ascending: false }).limit(1).maybeSingle();
    const orderNumber = numErr || !num ? 1 : num.order_number + 1;
    const { error: insErr } = await supabase.from("orders")
      .insert({
        company_id: companyId, order_number: orderNumber, name: o.name,
        client_id: client, client_name: c.name, technician_id: techId,
        scheduled_date: o.scheduled, time_slot: o.time_slot, scheduled_end_time: o.end_time,
        description: o.description, status: o.status, order_type: o.order_type,
        service_name: o.service_name, priority: o.priority,
      });
    if (insErr) err("order " + o.name, insErr.message); else summary.orders++;
  }

  async function ensureTask(companyId: string, t: DemoTask, userByUsername: Map<string, string>): Promise<void> {
    const assignedTo = userByUsername.get(t.assigned) ?? null;
    const { data: existing, error } = await supabase.from("tasks")
      .select("id").eq("company_id", companyId).eq("title", t.title).maybeSingle();
    if (error) return err("task " + t.title, error.message);
    if (existing) { summary.skipped++; return; }
    const { error: insErr } = await supabase.from("tasks")
      .insert({ company_id: companyId, title: t.title, assigned_to: assignedTo, created_by: assignedTo, category: t.category, due_date: t.due, important: t.important ?? false });
    if (insErr) err("task " + t.title, insErr.message); else summary.tasks++;
  }

  // ─── 1) Empresa semilla + super_admin ─────────────────────────────────────
  const seedId = await ensureCompany(SEED_COMPANY_NAME);
  if (seedId) {
    await ensureUser(seedId, { name: "Super Administrador", username: "superadmin", role: "super_admin", identification: "99999999" }, "superadmin@" + EMAIL_DOMAIN);
  }

  // ─── 2) Empresas ficticias + staff + clientes/órdenes/tareas ──────────────
  for (const company of DEMO) {
    const companyId = await ensureCompany(company.name);
    if (!companyId) continue;

    const userByUsername = new Map<string, string>();
    for (const u of company.users) {
      const uid = await ensureUser(companyId, u, `${u.username}@${EMAIL_DOMAIN}`);
      if (uid) userByUsername.set(u.username, uid);
    }

    for (const client of company.clients) {
      const clientId = await ensureClient(companyId, client);
      if (!clientId) continue;
      for (const eq of client.equipment) await ensureEquipment(companyId, clientId, eq);
    }

    for (const order of company.orders) {
      const client = company.clients.find((x) => x.name === order.client);
      if (client) await ensureOrder(companyId, client, order, userByUsername);
    }

    for (const task of company.tasks) await ensureTask(companyId, task, userByUsername);
  }

  const data = summary;
  return json(summary.errors.length ? { ok: false, ...data } : { ok: true, ...data }, summary.errors.length ? 500 : 200);
});