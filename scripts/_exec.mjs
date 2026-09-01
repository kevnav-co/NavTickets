// ─── Ejecutor: concat de SEED (Arrays en _p1+_p2) + este bloque  ─────────────
// Puebla cada empresa de forma idempotente y vincula usuarios Auth (patrón
// documentado: INSERT en users no persiste supabase_auth_id → se garantiza con
// un UPDATE posterior). Nunca borra/desvincula datos previos.
//   Guard de idempotencia = inventario presente en la empresa (todo tenant del
//   SEED crea inventario). Si ya hay inventario y no `--force-data` → se salta.
import { createHash } from "node:crypto";

const svc = createClient(URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
const jh = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };

const hash64 = (s) => BigInt("0x" + createHash("sha256").update(s).digest("hex").slice(0, 16));
const seedRng = (seed) => mulberry32(Number(hash64(seed) % BigInt(0xffffffff)));
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

async function createAuthUser(email, name) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: jh,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } }),
  });
  const b = await res.json();
  if (b.id) return b.id;
  if (res.status === 409) {
    const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = data.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return found?.id ?? null;
  }
  console.error("  crear auth FALLÓ", email, res.status, JSON.stringify(b));
  return null;
}

async function companyId(entry) {
  const bySlug = entry.slug
    ? await svc.from("companies").select("id,name,slug,theme,features").eq("slug", entry.slug)
    : { data: [] };
  if (bySlug.data?.length) return bySlug.data[0];
  if (entry.name) {
    const byName = await svc.from("companies").select("id,name,slug,theme,features").eq("name", entry.name);
    if (byName.data?.length) return byName.data[0];
  }
  const payload = { name: entry.name };
  if (entry.slug) payload.slug = entry.slug;
  if (entry.theme) payload.theme = entry.theme;
  if (entry.features) payload.features = entry.features;
  const { data, error } = await svc.from("companies").insert(payload).select("id,name,slug,theme,features").single();
  if (error) throw new Error(`crear company ${entry.name}: ${error.message}`);
  console.log(`  [nuevo tenant] company creada: ${data.name} (${data.id})`);
  return data;
}

async function ensureUser(company, u) {
  const email = `${u.username}@${DOMAIN}`;
  const ex = await svc.from("users").select("id,supabase_auth_id").eq("username", u.username).eq("company_id", company.id).maybeSingle();
  if (ex.data) {
    if (!ex.data.supabase_auth_id) {
      const uid = await createAuthUser(email, u.name);
      if (uid) await svc.from("users").update({ supabase_auth_id: uid }).eq("id", ex.data.id);
    }
    return ex.data.id;
  }
  const uid = await createAuthUser(email, u.name);
  const { data, error } = await svc.from("users")
    .insert({ company_id: company.id, name: u.name, username: u.username, role: u.role, identification: u.identification, supabase_auth_id: uid })
    .select("id").single();
  if (error) { console.error("  insert user", email, error.message); return null; }
  if (uid) await svc.from("users").update({ supabase_auth_id: uid }).eq("id", data.id); // garantiza link
  return data.id;
}

async function gCount(companyId, table) {
  const { count } = await svc.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return count ?? 0;
}

async function generate(company, entry, force) {
  const invCount = await gCount(company.id, "inventory_items");
  if (invCount > 0 && !force) {
    console.log(`  ya sembrada (inventario=${invCount}) → data se genera una vez, saltando (usa --force-data para más órdenes)`);
    return;
  }

  // ── usuarios (siempre idempotente; tenants nuevos crean + linkean Auth) ──
  let umap = {};
  for (const u of entry.users ?? []) umap[u.username] = await ensureUser(company, u);
  let roleByUser = {};
  for (const u of entry.users ?? []) roleByUser[u.username] = u.role;
  if (!(entry.users?.length)) {
    const { data } = await svc.from("users").select("id,username,role").eq("company_id", company.id);
    for (const r of data || []) roleByUser[r.username] = r.role;
  }
  const techIds = Object.entries(roleByUser).filter(([, r]) => r === "technician").map(([, id]) => id);
  const adminUser = (entry.users ?? []).find((u) => u.role === "admin");
  const adminId = adminUser ? umap[adminUser.username] ?? null : null;
  console.log(`  usuarios: ${Object.keys(roleByUser).length} (roles: ${Object.values(roleByUser).join(",")})`);

  const rng = seedRng(company.slug || company.name);

  // ── catálogo nuevo (solo si no sembrado) ──
  if (invCount === 0) {
    for (const c of entry.clients ?? []) {
      const { error } = await svc.from("clients").insert({ ...c, company_id: company.id }); if (error) console.error("  client", c.name, error.message);
    }
    for (const e of entry.equipment ?? []) {
      const { error } = await svc.from("equipment").insert({ ...e, company_id: company.id }); if (error) console.error("  equipment", e.name, error.message);
    }
    for (const it of entry.inventory ?? []) {
      const { error } = await svc.from("inventory_items").insert({ ...it, company_id: company.id }); if (error) console.error("  inventory", it.sku, error.message);
    }
  }

  // pool de clientes/equipos: los de BD (cubre tenants nuevos y demo)
  const { data: clients } = await svc.from("clients").select("id,name").eq("company_id", company.id);
  const { data: equip } = await svc.from("equipment").select("id,name").eq("company_id", company.id);
  const { data: inv } = await svc.from("inventory_items").select("id,sku,unit_cost").eq("company_id", company.id);
  const services = entry.services ?? [];

  // ── ÓRDENES (batch) ──
  const orderTarget = Math.min(entry.orderTarget ?? 40, 60);
  const timeSlots = ["08:00", "08:30", "10:00", "10:30", "13:00", "13:30", "15:00"];
  let created = 0, eqLinks = 0, invLines = 0;
  for (let k = 0; k < orderTarget; k++) {
    if (!clients?.length) break;
    const c = clients[Math.floor(rng() * clients.length)];
    const nEq = equip?.length ? 1 + (rng() < 0.35 ? 1 : 0) : 0;
    const usedEq = new Set();
    const ord = {
      company_id: company.id,
      client_id: c.id,
      client_name: c.name,
      technician_id: techIds.length ? techIds[Math.floor(rng() * techIds.length)] : null,
      scheduled_date: iso(randInt(rng, -60, 30)),
      time_slot: timeSlots[Math.floor(rng() * timeSlots.length)],
      description: "",
      priority: ["Baja", "Media", "Media", "Alta", "Urgente"][Math.floor(rng() * 5)],
    };
    const roll = rng();
    ord.status = roll < 0.2 ? "Pendiente" : roll < 0.55 ? "En Progreso" : "Cerrado";
    if (ord.status !== "Pendiente") ord.actual_start_date = ord.scheduled_date;
    if (services.length) {
      const sv = services[Math.floor(rng() * services.length)];
      ord.service_name = sv.service_name; ord.order_type = sv.category;
      ord.description = sv.descriptions[Math.floor(rng() * sv.descriptions.length)]; ord.name = sv.service_name;
    } else { ord.service_name = "Mantenimiento general"; ord.order_type = "Preventivo"; ord.name = "Mantenimiento general"; }
    let warranty_period = null, warranty_expiration = null;
    if (ord.status === "Cerrado") {
      warranty_period = [0, 0, 0, 30, 60, 90, 90, 180][Math.floor(rng() * 8)];
      if (warranty_period > 0) warranty_expiration = iso(randInt(rng, 5, warranty_period));
      ord.warranty_period = warranty_period; ord.warranty_expiration = warranty_expiration;
      ord.is_under_warranty_review = warranty_period > 0 && rng() < 0.25;
    }
    const { data: ordRow, error } = await svc.from("orders").insert(ord).select("id").single();
    if (error) { console.error("  order", ord.name, error.message); continue; }
    created++;
    const eqBatch = [];
    for (let m = 0; m < nEq; m++) {
      const e = equip[Math.floor(rng() * equip.length)];
      if (usedEq.has(e.id)) continue; usedEq.add(e.id);
      eqBatch.push({ equipment_id: e.id, order_id: ordRow.id });
    }
    if (eqBatch.length) { const r = await svc.from("equipment_orders").insert(eqBatch); if (!r.error) eqLinks += eqBatch.length; }
    if (inv?.length && rng() < 0.5) {
      const nn = 1 + Math.floor(rng() * 3), lines = [];
      for (let m = 0; m < nn; m++) {
        const it = inv[Math.floor(rng() * inv.length)];
        lines.push({ order_id: ordRow.id, inventory_item_id: it.id, quantity_out: 1 + Math.floor(rng() * 3), unit_cost_snapshot: it.unit_cost });
      }
      const r = await svc.from("order_inventory_lines").insert(lines); if (!r.error) invLines += lines.length;
    }
  }
  console.log(`  órdenes: ${created} (vinculos equipo ${eqLinks}, líneas repuesto ${invLines})`);

  // ── TASKS ──
  let tasks = 0;
  for (const t of entry.tasks ?? []) {
    const { error } = await svc.from("tasks").insert({
      company_id: company.id, title: t.title, important: !!t.important, due_date: t.due,
      category: t.category, assigned_to: umap[t.assigned] ?? null, created_by: adminId,
    });
    if (!error) tasks++; else console.error("  task", t.title, error.message);
  }
  console.log(`  tareas: ${tasks}`);

  // ── NOTIFICATIONS (muestra) ──
  let notifs = 0;
  for (const uid of Object.values(roleByUser)) {
    if (!uid) continue;
    const { error } = await svc.from("notifications").insert({ company_id: company.id, user_id: uid, title: "Seed demo", body: "Datos ficticios sembrados", text: "Seed", type: "info", read: true, path: "/dashboard" });
    if (!error) notifs++;
  }
  console.log(`  notificaciones: ${notifs}`);

  // ── SUPPORT (tenants con soportes) ──
  let support = 0;
  for (const s of entry.support ?? []) {
    const { data, error } = await svc.from("support_tickets").insert({ company_id: company.id, user_id: adminId, subject: s.subject, message: s.message, status: s.status }).select("id").single();
    if (!error) {
      support++;
      if (adminId) await svc.from("support_messages").insert({ ticket_id: data.id, user_id: adminId, role: "empresa", message: s.message });
    } else console.error("  support", s.subject, error.message);
  }
  console.log(`  soportes: ${support}`);
}

console.log(`\n== Seed demo NavTicket — ${SEED.length} tenants; force-data=${FORCE_DATA} ==`);
for (const entry of SEED) {
  console.log(`\n— ${entry.slug || entry.name} —`);
  try {
    const company = await companyId(entry);
    if (entry.slug && (company.slug !== entry.slug)) {
      const patch = { slug: entry.slug }; if (entry.theme) patch.theme = entry.theme; if (entry.features) patch.features = entry.features;
      await svc.from("companies").update(patch).eq("id", company.id);
    }
    await generate(company, entry, FORCE_DATA);
  } catch (e) { console.error("  ERROR en tenant:", entry.name, e.message); }
}

// ─── Resumen ───
console.log("\n== Resumen por empresa ==");
const { data: comps } = await svc.from("companies").select("id,name,slug").order("name");
for (const co of comps ?? []) {
  const [ord, cli, eq, iv, tsk, sup, usr] = await Promise.all([
    gCount(co.id, "orders"), gCount(co.id, "clients"), gCount(co.id, "equipment"),
    gCount(co.id, "inventory_items"), gCount(co.id, "tasks"), gCount(co.id, "support_tickets"),
    (await svc.from("users").select("id", { count: "exact", head: true }).eq("company_id", co.id)).count ?? 0,
  ]);
  console.log(`  ${(co.name ?? "").padEnd(28)} slug=${(co.slug ?? "-").padEnd(20)} ord=${String(ord).padEnd(4)} cli=${String(cli).padEnd(3)} eq=${String(eq).padEnd(3)} inv=${String(iv).padEnd(3)} tasks=${String(tsk).padEnd(3)} support=${String(sup).padEnd(2)} usr=${usr}`);
}