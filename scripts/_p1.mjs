// Seed de datos ficticios NavTicket (multi-tenant, Supabase).
//
//   PUEBLA la BD con datos realistas que simulan TODAS las funcionalidades de la
//   app, de forma idempotente y reutilizable:
//     - Crea 3 tenants NUEVOS con branding propio (metalmecanica-andina,
//       plasticos-del-sur, logistica-expresa) con roster completo de usuarios
//       (admin, supervisor, aux_admin, developer, técnicos) y cuenta Auth real.
//     - EnRRIQUECE los 3 tenants demo existentes (Fábricas Andinas, Hoteles
//       Caribe, Cementos Pacífico) reutilizando sus usuarios ya enlazados.
//     - Por empresa: clientes, máquinas (equipment), inventario (inventory_items),
//       órdenes de servicio en estados/mezcla que alimentan calendario, dashboard,
//       stats e informes (Cerrado/En Progreso/Pendiente, fechas pasadas+futuras,
//       garantías, repuestos usados, máquinas asociadas), tareas, notificaciones
//       y (solo tenants nuevos) soportes con chat.
//
//   REGLAS CRÍTICAS:
//     - Nunca borra ni desvincula datos previos. Cada empresa se identifica por
//       `slug`; si existe se enriquece, si no se crea. La generación de data por
//       empresa corre UNA vez: se detecta con un floor de órdenes (count) en la
//       misma empresa → re-llamar no duplica ni desvincula. Flag `--force-data`
//       para volver a sembrar más (la secuencia de order_number sigue MAX+1).
//     - Link Auth OBLIGATORIO: el INSERT en `users` NO persiste `supabase_auth_id`;
//       se vincula con un UPDATE posterior (patrón probado). Nunca insertar users
//       sin enlazar.
//     - Estadísticas/informes NO se siembran: se derivan solos de las órdenes.
//     - NO se insertan `seguimientos`: la BD los crea vía trigger.
//
// Uso (Windows PowerShell):
//   cd "C:\Users\Nvas\Free Claude\NavTicket"
//   $env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"; node scripts/seed-demo-data.mjs
//   $env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"; node scripts/seed-demo-data.mjs --force-data
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
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY. Ejecuta:\n  $env:SUPABASE_SERVICE_ROLE_KEY=\"TU_KEY\"; node scripts/seed-demo-data.mjs");
  process.exit(1);
}

const FORCE_DATA = process.argv.includes("--force-data");

// ─── Utilidades de fecha ─────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

// ─── RNG determinista (mulberry32) para datos reproducibles ─────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ─── Tenants a poblar ────────────────────────────────────────────────────────
// Los EXISTENTES se resuelven por nombre (slugs pueden estar vacíos en BD);
// los NUEVOS por slug. La data solo se genera la 1ª corrida (floor de órdenes).
const SEED = [
  {
    // NUEVO — creación completa
    slug: "metalmecanica-andina",
    name: "Metalmecánica Andina S.A.",
    theme: { primaryColor: "#F97316", accentColor: "#FB923C", secondaryColor: "#FED7AA", titleSuffix: "Metalmecánica Andina" },
    features: { accounting: true, maps: true, aiAssistant: false, equipmentManagement: true },
    orderTarget: 45,
    users: [
      { name: "Abraham Torres", username: "ma_admin", role: "admin", identification: "700000001" },
      { name: "Bárbara Cifuentes", username: "ma_sup", role: "supervisor", identification: "700000002" },
      { name: "Camilo Herrera", username: "ma_aux", role: "aux_admin", identification: "700000003" },
      { name: "Daniela Ríos", username: "ma_dev", role: "developer", identification: "700000004" },
      { name: "Esteban Cabrera", username: "ma_tec1", role: "technician", identification: "700000005" },
      { name: "Francisca Duarte", username: "ma_tec2", role: "technician", identification: "700000006" },
      { name: "Guillermo Pardo", username: "ma_tec3", role: "technician", identification: "700000007" },
    ],
    clients: [
      { name: "Planta de Estampado Norte", address: "Calle 80 # 45 - 21", contact: "Ing. Crisanto Velásquez", identification: "910000001", email: "estampado@plantasur.co", lat: 6.2171, lng: -75.5672, neighborhood: "Bello", city: "Medellín" },
      { name: "Taller de Mecanizado Central", address: "Cra 52 # 72 - 104", contact: "Ramiro Gómez", identification: "910000002", email: "mecanizado@plantasur.co", lat: 6.2518, lng: -75.5636, neighborhood: "La América", city: "Medellín" },
      { name: "Fundición El Morro", address: "Vereda El Morro Km 12", contact: "Sandra Gil", identification: "910000003", email: "fundicion@plantasur.co", lat: 6.4667, lng: -75.6833, neighborhood: "San Pedro", city: "San Pedro de los Milagros" },
      { name: "Bodega de Repuestos", address: "Zona Industrial Citadel Cra 50 # 9 - 90", contact: "Óscar López", identification: "910000004", email: "bodega@plantasur.co", lat: 6.1611, lng: -75.6089, neighborhood: "Guayabal", city: "Medellín" },
      { name: "Planta de Pintura Electroestática", address: "Calle 20 # 30 - 5", contact: "Patricia Mora", identification: "910000005", email: "pintura@plantasur.co", lat: 6.2367, lng: -75.6242, neighborhood: "Robledo", city: "Medellín" },
    ],
    equipment: [
      { name: "Prensa Hidráulica 1000T", brand: "Siempelkamp", description: "Estampado de lámina de acero", serial_number: "MA-PH-001", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-40) },
      { name: "Guillotina Hidráulica 6m", brand: "ASCO", description: "Corte de lámina calibre 10", serial_number: "MA-GH-002", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-120) },
      { name: "Robot Soldador KUKA KR16", brand: "KUKA", description: "Soldadura de puntos en línea", serial_number: "MA-RS-003", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-15) },
      { name: "Centro de mecanizado CNC HAAS VF-4", brand: "HAAS", description: "Fresado de alta precisión", serial_number: "MA-CM-004", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-60) },
      { name: "Torno CNC Nakamura", brand: "Nakamura-Tome", description: "Torneado de ejes", serial_number: "MA-TC-005", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-25) },
      { name: "Rectificadora plana Okamoto", brand: "Okamoto", description: "Rectificado de superficies", serial_number: "MA-RP-006", voltage: "220V", maintenance_frequency: 3, last_maintenance_date: iso(-90) },
      { name: "Horno de inducción ABB 10T", brand: "ABB", description: "Fusión de hierro gris", serial_number: "MA-HI-007", voltage: "330V", gas_type: "Natural", maintenance_frequency: 12, last_maintenance_date: iso(-200) },
      { name: "Compresor de tornillo GA90", brand: "Atlas Copco", description: "Aire comprimido fundición", serial_number: "MA-CT-008", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-35) },
      { name: "Montacargas eléctrico BT", brand: "Toyota", description: "Carga de repuestos", serial_number: "MA-ME-009", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-10) },
      { name: "Puente grúa 20T", brand: "Demag", description: "Movimiento de piezas pesadas", serial_number: "MA-PG-010", voltage: "330V", maintenance_frequency: 12, last_maintenance_date: iso(-180) },
      { name: "Cabina de pintura electrostática", brand: "Gema", description: "Aplicación de recubrimiento en polvo", serial_number: "MA-CP-011", voltage: "220V", maintenance_frequency: 3, last_maintenance_date: iso(-5) },
      { name: "Horno de curado IFB", brand: "IFB", description: "Horneado de piezas pintadas", serial_number: "MA-HC-012", voltage: "330V", gas_type: "Natural", maintenance_frequency: 6, last_maintenance_date: iso(-70) },
    ],
    inventory: [
      { sku: "AC-R501", name: "Aceite hidráulico ISO 68 (barril)", unit: "barril", quantity: 8, unit_cost: 1850000, low_stock_threshold: 5 },
      { sku: "AC-R502", name: "Aceite de corte soluble", unit: "galón", quantity: 34, unit_cost: 42000, low_stock_threshold: 20 },
      { sku: "GR-M001", name: "Grasa multipropósito EP2 (pote)", unit: "pote", quantity: 12, unit_cost: 18500, low_stock_threshold: 15 },
      { sku: "FK-F001", name: "Filtro de aire GA75 (repuesto)", unit: "unidad", quantity: 6, unit_cost: 240000, low_stock_threshold: 4 },
      { sku: "FK-F002", name: "Filtro de aceite compresor", unit: "unidad", quantity: 4, unit_cost: 175000, low_stock_threshold: 6 },
      { sku: "EL-M001", name: "Motor eléctrico 10HP trifásico", unit: "unidad", quantity: 2, unit_cost: 2450000, low_stock_threshold: 3 },
      { sku: "EL-C001", name: "Contactor 3x40A", unit: "unidad", quantity: 25, unit_cost: 68000, low_stock_threshold: 15 },
      { sku: "SD-R001", name: "Rodamiento SKF 6205-2RS", unit: "unidad", quantity: 60, unit_cost: 32000, low_stock_threshold: 40 },
      { sku: "SD-R002", name: "Rodamiento SKF 6308", unit: "unidad", quantity: 8, unit_cost: 54000, low_stock_threshold: 25 },
      { sku: "EL-Q001", name: "Quemador gas natural mediano", unit: "unidad", quantity: 3, unit_cost: 1850000, low_stock_threshold: 2 },
      { sku: "IN-P001", name: "Pintura electrostática azul (25kg)", unit: "bulto", quantity: 6, unit_cost: 285000, low_stock_threshold: 10 },
      { sku: "AC-R503", name: "Líquido refrigerante de corte", unit: "galón", quantity: 10, unit_cost: 35000, low_stock_threshold: 30 },
      { sku: "SU-S001", name: "Soldadura MIG ER70S-6 (rollo)", unit: "rollo", quantity: 14, unit_cost: 145000, low_stock_threshold: 8 },
    ],
    services: [
      { category: "Preventivo", service_name: "Mantenimiento preventivo", descriptions: ["Cambio de aceite hidráulico y revisión de sellos.", "Limpieza y ajuste general de la máquina.", "Revisión de niveles y lubricación."] },
      { category: "Correctivo", service_name: "Reparación hidráulica", descriptions: ["Fuga de aceite en cilindro principal, cambio de sello.", "Presión hidráulica inestable, revisar válvula reguladora."] },
      { category: "Correctivo", service_name: "Reparación mecánica", descriptions: ["Ruido anormal en reductora, cambio de rodamiento.", "Desalineación de husillo, alineación y ajuste."] },
      { category: "Correctivo", service_name: "Reparación eléctrica", descriptions: ["Contactor de arranque quemado, reemplazo.", "Fallos intermitentes en tablero de control."] },
      { category: "Correctivo", service_name: "Soporte en frío", descriptions: ["Ajuste de prensa para calibre de material.", "Cambio de matriz de punzonado."] },
      { category: "Preventivo", service_name: "Inspección de seguridad", descriptions: ["Verificación de guardas y paros de emergencia.", "Revisión de cableado y puesta a tierra."] },
      { category: "Preventivo", service_name: "Mantenimiento de horno", descriptions: ["Revisión de refractario y quemadores.", "Limpieza de cámara de fusión."] },
    ],
    tasks: [
      { title: "Engrase semanal de puente grúa", assigned: "ma_tec2", category: "Mantenimiento", due: iso(1), important: true },
      { title: "Levantamiento de stock mínimo en bodega", assigned: "ma_aux", category: "Inventario", due: iso(2) },
      { title: "Inspección de seguridad de cabina de pintura", assigned: "ma_tec1", category: "Prevención", due: iso(3), important: true },
      { title: "Prueba no destructiva de soldaduras", assigned: "ma_tec3", category: "Calidad", due: iso(6) },
      { title: "Actualizar planes de mantenimiento CNC", assigned: "ma_sup", category: "Documentación", due: iso(8) },
      { title: "Revisión de refrigerante en centro de mecanizado", assigned: "ma_tec1", category: "Mantenimiento", due: iso(10) },
      { title: "Calibración de sensores de horno", assigned: "ma_tec2", category: "Calibración", due: iso(12) },
    ],
    support: [
      { subject: "Error al editar pedido de repuestos", message: "Al guardar cambios en un pedido de la bodega aparece un mensaje de validación. Adjunto captura.", status: "abierto" },
      { subject: "Solicitud de acceso para nuevo técnico", message: "Necesitamos crear la cuenta de un técnico nuevo para la planta de estampado. ¿Cómo procedo?", status: "abierto" },
    ],
  },
  {
    // NUEVO — creación completa
    slug: "plasticos-del-sur",
    name: "Plásticos del Sur",
    theme: { primaryColor: "#16A34A", accentColor: "#4ADE80", secondaryColor: "#BBF7D0", titleSuffix: "Plásticos del Sur" },
    features: { accounting: true, maps: true, aiAssistant: true, equipmentManagement: true },
    orderTarget: 45,
    users: [
      { name: "Hernán Sotelo", username: "pl_admin", role: "admin", identification: "800000001" },
      { name: "Irene Zambrano", username: "pl_sup", role: "supervisor", identification: "800000002" },
      { name: "Jorge Mena", username: "pl_aux", role: "aux_admin", identification: "800000003" },
      { name: "Karina Peña", username: "pl_tec1", role: "technician", identification: "800000004" },
      { name: "Luciano Padilla", username: "pl_tec2", role: "technician", identification: "800000005" },
      { name: "Marcela Vega", username: "pl_tec3", role: "technician", identification: "800000006" },
    ],
    clients: [
      { name: "Planta de Inyección Sur", address: "Calle 32 # 124 - 90", contact: "Rocío Caicedo", identification: "920000001", email: "inyeccion@plasticos.co", lat: 3.4372, lng: -76.5225, neighborhood: "Cristal", city: "Cali" },
      { name: "Planta de Soplado Oriente", address: "Cra 8 # 20 - 250", contact: "Marco Fierro", identification: "920000002", email: "soplado@plasticos.co", lat: 3.46, lng: -76.49, neighborhood: "Villa del Sur", city: "Cali" },
      { name: "Planta de Extrusión", address: "Autopista Yumbo km 5", contact: "Tatiana Bravo", identification: "920000003", email: "extrusion@plasticos.co", lat: 3.582, lng: -76.492, neighborhood: "Yumbo", city: "Yumbo" },
      { name: "Bodega de Producto Terminado", address: "Zona Franca del Valle", contact: "Andrés Márquez", identification: "920000004", email: "bodega@plasticos.co", lat: 3.518, lng: -76.418, neighborhood: "Palmira", city: "Palmira" },
    ],
    equipment: [
      { name: "Inyectora 350T Haitian", brand: "Haitian", description: "Inyección de piezas grandes", serial_number: "PS-IN-001", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-30) },
      { name: "Inyectora 180T Engel", brand: "ENGEL", description: "Inyección de precisión", serial_number: "PS-IN-002", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-50) },
      { name: "Secador de aire 1000L", brand: "Conair", description: "Secado de material plástico", serial_number: "PS-SA-003", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-20) },
      { name: "Sopladora 100L Bekum", brand: "Bekum", description: "Soplado de botellas pet", serial_number: "PS-SO-004", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-8) },
      { name: "Compresor de aceite 75HP", brand: "Ingersoll Rand", description: "Aire comprimido de proceso", serial_number: "PS-CA-005", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-45) },
      { name: "Extrusora de doble husillo 100mm", brand: "Coperion", description: "Línea de tubería PVC", serial_number: "PS-EX-006", voltage: "330V", maintenance_frequency: 3, last_maintenance_date: iso(-12) },
      { name: "Horno de secado de polímero", brand: "Motan", description: "Deshumidificador de material", serial_number: "PS-HS-007", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(0) },
      { name: "Cortadora de pellet", brand: "UIYM", description: "Peletizado de PVC", serial_number: "PS-CP-008", voltage: "220V", maintenance_frequency: 3, last_maintenance_date: iso(-70) },
      { name: "Estibador eléctrico", brand: "Raymond", description: "Movimiento de producto terminado", serial_number: "PS-ET-009", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-15) },
      { name: "Empacadora de roscas", brand: "Sollas", description: "Empaques de bolsas plásticas", serial_number: "PS-ER-010", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-60) },
    ],
    inventory: [
      { sku: "PL-PE001", name: "Polietileno de alta densidad (bulto)", unit: "bulto", quantity: 40, unit_cost: 380000, low_stock_threshold: 25 },
      { sku: "PL-PP002", name: "Polipropileno virgen (bulto)", unit: "bulto", quantity: 12, unit_cost: 420000, low_stock_threshold: 20 },
      { sku: "PL-PVC003", name: "Resina PVC (bulto)", unit: "bulto", quantity: 28, unit_cost: 350000, low_stock_threshold: 15 },
      { sku: "PL-CB001", name: "Colorante masterbatch negro (bulto)", unit: "bulto", quantity: 8, unit_cost: 120000, low_stock_threshold: 12 },
      { sku: "PL-CB002", name: "Masterbatch blanco (bulto)", unit: "bulto", quantity: 6, unit_cost: 135000, low_stock_threshold: 10 },
      { sku: "PL-M004", name: "Moldes de inyección (set 4)", unit: "set", quantity: 4, unit_cost: 8000000, low_stock_threshold: 2 },
      { sku: "AC-R504", name: "Aceite para inyectoras ISO 46", unit: "barril", quantity: 5, unit_cost: 1700000, low_stock_threshold: 3 },
      { sku: "FK-F003", name: "Filtro de aire compresor IR", unit: "unidad", quantity: 9, unit_cost: 200000, low_stock_threshold: 6 },
    ],
    services: [
      { category: "Correctivo", service_name: "Reparación en caliente", descriptions: ["Falla de fusión en molde, revisar resistencia.", "Siembre de material crudo sin fundir, ajustar perfil de temperaturas."] },
      { category: "Correctivo", service_name: "Reparación hidráulica", descriptions: ["Pérdida de presión en inyectora, revisión de bomba.", "Válvula proporcional atascada, limpieza y ajuste."] },
      { category: "Correctivo", service_name: "Reparación eléctrica", descriptions: ["Corto en tablero de control de extrusora.", "Sensor de temperatura fuera de rango, reemplazo."] },
      { category: "Correctivo", service_name: "Reparación mecánica", descriptions: ["Cambio de husillo de extrusora.", "Rodamiento de sopladora desgastado, reemplazo."] },
      { category: "Preventivo", service_name: "Mantenimiento preventivo", descriptions: ["Limpieza y lubricación de guías de inyectora.", "Limpieza de tolvas y secador de aire."] },
      { category: "Preventivo", service_name: "Lubricación y ajuste", descriptions: ["Engrase de reductora de extrusora.", "Ajuste de bandas de compresor."] },
      { category: "Preventivo", service_name: "Control de calidad", descriptions: ["Verificación de espesores de empaque.", "Prueba de resistencia a tensión de pellets."] },
    ],
    tasks: [
      { title: "Cambio de molde en inyectora 350T", assigned: "pl_tec1", category: "Producción", due: iso(1), important: true },
      { title: "Revisión de humedad en polipropileno", assigned: "pl_aux", category: "Calidad", due: iso(2) },
      { title: "Limpieza de secador de material", assigned: "pl_tec2", category: "Mantenimiento", due: iso(3) },
      { title: "Calibración de temperatura de extrusora", assigned: "pl_tec1", category: "Calibración", due: iso(5), important: true },
      { title: "Inspección de fuga de aire compresor", assigned: "pl_tec3", category: "Prevención", due: iso(7) },
      { title: "Preparar pedido de masterbatch", assigned: "pl_aux", category: "Inventario", due: iso(9) },
    ],
    support: [
      { subject: "Pregunta sobre estadísticas del dashboard", message: "Los números de órdenes cerradas no coinciden con lo que reporta el informe de trabajo. ¿Es correcto?", status: "abierto" },
    ],
  },