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
  },{
    // NUEVO — creación completa
    slug: "logistica-expresa",
    name: "Logística Expresa",
    theme: { primaryColor: "#7C3AED", accentColor: "#A78BFA", secondaryColor: "#DDD6FE", titleSuffix: "Logística Expresa" },
    features: { accounting: false, maps: true, aiAssistant: false, equipmentManagement: true },
    orderTarget: 45,
    users: [
      { name: "Néstor Quiroga", username: "lo_admin", role: "admin", identification: "600000001" },
      { name: "Olga Pabón", username: "lo_sup", role: "supervisor", identification: "600000002" },
      { name: "Patricio Núñez", username: "lo_aux", role: "aux_admin", identification: "600000003" },
      { name: "Quintina Romero", username: "lo_dev", role: "developer", identification: "600000004" },
      { name: "Raúl Cabrales", username: "lo_tec1", role: "technician", identification: "600000005" },
      { name: "Silvia Medina", username: "lo_tec2", role: "technician", identification: "600000006" },
      { name: "Teodoro Aguirre", username: "lo_tec3", role: "technician", identification: "600000007" },
    ],
    clients: [
      { name: "Centro de Distribución Norte", address: "Autopista Norte km 16", contact: "Viviana Ruiz", identification: "930000001", email: "cdnorte@logexpress.co", lat: 4.7742, lng: -74.0367, neighborhood: "Usaquén", city: "Bogotá" },
      { name: "Bodega Regional Occidente", address: "Av. 68 # 75A-120", contact: "William Cárdenas", identification: "930000002", email: "bodegaocc@logexpress.co", lat: 4.6833, lng: -74.0718, neighborhood: "Engativá", city: "Bogotá" },
      { name: "Terminal de Carga Sur", address: "Carrera 30 # 105 - 50", contact: "Ximena Osorio", identification: "930000003", email: "tecargasur@logexpress.co", lat: 4.594, lng: -74.146, neighborhood: "Kennedy", city: "Bogotá" },
      { name: "Estación de Acopio Oriental", address: "Cra 7 # 116 - 30", contact: "Yolanda Serrano", identification: "930000004", email: "acopioor@logexpress.co", lat: 4.7186, lng: -74.0294, neighborhood: "Barrios Unidos", city: "Bogotá" },
      { name: "Cliente Mayorista Colombia SAS", address: "Calle 13 # 20 - 75", contact: "Zacarías Hoyos", identification: "930000005", email: "mayorista@logexpress.co", lat: 4.6029, lng: -74.0882, neighborhood: "Los Mártires", city: "Bogotá" },
    ],
    equipment: [
      { name: "Montacargas diésel 3T", brand: "Hyster", description: "Movimiento de carga pesada", serial_number: "LO-MD-001", voltage: "110V", maintenance_frequency: 3, last_maintenance_date: iso(-25) },
      { name: "Banda transportadora de paquetes", brand: "Intralox", description: "Línea de clasificación", serial_number: "LO-BP-002", voltage: "220V", maintenance_frequency: 6, last_maintenance_date: iso(-40) },
      { name: "Sistema de clasificación automática", brand: "Vanderlande", description: "Sorter de maletas", serial_number: "LO-SC-003", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(0) },
      { name: "Traspaleta eléctrica 1.8T", brand: "Jungheinrich", description: "Movimiento interno de pallets", serial_number: "LO-TE-004", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-60) },
      { name: "Apilador eléctrico 2.5T", brand: "Lind", description: "Apilado de estibas", serial_number: "LO-AE-005", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-15) },
      { name: "Grúa horquilla 4T", brand: "Toyota", description: "Carga de camiones", serial_number: "LO-GH-006", voltage: "110V", maintenance_frequency: 3, last_maintenance_date: iso(-50) },
      { name: "Motoconformadora CAT 140", brand: "Caterpillar", description: "Mantenimiento de patio", serial_number: "LO-MC-007", voltage: "110V", maintenance_frequency: 12, last_maintenance_date: iso(-180) },
      { name: "Compresor de tornillo 30HP", brand: "Sullair", description: "Aire comprimido de taller", serial_number: "LO-CT-008", voltage: "330V", maintenance_frequency: 6, last_maintenance_date: iso(-35) },
      { name: "Grupo electrógeno 500kVA", brand: "Cummins", description: "Respaldo energético", serial_number: "LO-GE-009", voltage: "330V", maintenance_frequency: 12, last_maintenance_date: iso(-100) },
      { name: "Báscula electrónica de plataforma", brand: "Avery", description: "Pesaje de mercancía", serial_number: "LO-BE-010", voltage: "110V", maintenance_frequency: 6, last_maintenance_date: iso(-5) },
    ],
    inventory: [
      { sku: "LO-A001", name: "Aceite de motor diésel (galón)", unit: "galón", quantity: 30, unit_cost: 38000, low_stock_threshold: 15 },
      { sku: "LO-A002", name: "Aceite hidráulico ISO 32", unit: "galón", quantity: 18, unit_cost: 42000, low_stock_threshold: 12 },
      { sku: "LO-G003", name: "Grasa para rodamientos (pote)", unit: "pote", quantity: 40, unit_cost: 16000, low_stock_threshold: 25 },
      { sku: "LO-F004", name: "Filtro de combustible diésel", unit: "unidad", quantity: 15, unit_cost: 27000, low_stock_threshold: 12 },
      { sku: "LO-F005", name: "Filtro de aire motor CAT", unit: "unidad", quantity: 6, unit_cost: 115000, low_stock_threshold: 8 },
      { sku: "LO-B006", name: "Batería montacargas 48V", unit: "unidad", quantity: 2, unit_cost: 3200000, low_stock_threshold: 3 },
      { sku: "LO-N007", name: "Neumático macizo 4T", unit: "unidad", quantity: 4, unit_cost: 480000, low_stock_threshold: 6 },
      { sku: "LO-EL008", name: "Contactor de potencia 3x80A", unit: "unidad", quantity: 12, unit_cost: 95000, low_stock_threshold: 10 },
      { sku: "LO-H009", name: "Refrigerante 50/50 (galón)", unit: "galón", quantity: 25, unit_cost: 22000, low_stock_threshold: 15 },
    ],
    services: [
      { category: "Correctivo", service_name: "Reparación de motor", descriptions: ["Sobrecalentamiento de motor, revisión de termostato.", "Fallo de arranque por inyectores."] },
      { category: "Correctivo", service_name: "Reparación hidráulica", descriptions: ["Caída de presión en montacargas, revisión de bomba.", "Sello de cilindro de elevación."] },
      { category: "Correctivo", service_name: "Reparación eléctrica", descriptions: ["Corto en sistema de clasificación.", "Fallo de sensor en banda transportadora."] },
      { category: "Correctivo", service_name: "Reparación mecánica", descriptions: ["Cambio de neumático macizo.", "Ajuste de frenos de montacargas."] },
      { category: "Correctivo", service_name: "Soporte en línea", descriptions: ["Atasco de paquetes en sorter, liberación.", "Reinicio y configuración de clasificador."] },
      { category: "Preventivo", service_name: "Mantenimiento preventivo", descriptions: ["Servicio programado de montacargas.", "Lubricación de banda transportadora."] },
      { category: "Preventivo", service_name: "Inspección de seguridad", descriptions: ["Verificación de paros de emergencia y barreras.", "Revisión de cableado y tierra."] },
      { category: "Preventivo", service_name: "Revisión de equipos de patio", descriptions: ["Chequeo de nivel de combustible y refrigerante.", "Inspección visual de fugas."] },
    ],
    tasks: [
      { title: "Calibración de báscula de plataforma", assigned: "lo_tec1", category: "Calibración", due: iso(1), important: true },
      { title: "Servicio técnico de grúa horquilla", assigned: "lo_tec2", category: "Mantenimiento", due: iso(2) },
      { title: "Inspección de grupo electrógeno", assigned: "lo_tec3", category: "Prevención", due: iso(4) },
      { title: "Pedido de batería de repuesto", assigned: "lo_aux", category: "Inventario", due: iso(5) },
      { title: "Revisión de sorter de maletas", assigned: "lo_tec1", category: "Sistemas", due: iso(7), important: true },
      { title: "Reemplazo de neumáticos macizos", assigned: "lo_tec2", category: "Mantenimiento", due: iso(10) },
    ],
    support: [
      { subject: "Error al exportar informe de trabajo", message: "La exportación de PDF del informe de órdenes falla cuando hay muchos datos. Revisar por favor.", status: "en_progreso" },
      { subject: "Alta de nuevo usuario en recepción", message: "Solicito se cree una cuenta de técnico para la sede de acopio con permiso de lectura.", status: "abierto" },
    ],
  },
  {
    // EXISTENTE — solo enriquecer data (reusa users ya enlazados)
    name: "Fábricas Andinas S.A.",
    orderTarget: 40,
    users: [],
    inventory: [
      { sku: "FA-A001", name: "Aceite hidráulico ISO 68 (barril)", unit: "barril", quantity: 10, unit_cost: 1850000, low_stock_threshold: 6 },
      { sku: "FA-A002", name: "Grasa para rodamientos (pote)", unit: "pote", quantity: 20, unit_cost: 18500, low_stock_threshold: 15 },
      { sku: "FA-F003", name: "Filtro de aceite GA75", unit: "unidad", quantity: 5, unit_cost: 175000, low_stock_threshold: 4 },
      { sku: "FA-M004", name: "Motor eléctrico 15HP", unit: "unidad", quantity: 2, unit_cost: 2800000, low_stock_threshold: 3 },
      { sku: "FA-R005", name: "Rodamiento SKF 6307", unit: "unidad", quantity: 30, unit_cost: 52000, low_stock_threshold: 20 },
      { sku: "FA-C006", name: "Soldadura MIG ER70S-6 (rollo)", unit: "rollo", quantity: 12, unit_cost: 145000, low_stock_threshold: 8 },
    ],
    services: [
      { category: "Preventivo", service_name: "Mantenimiento preventivo", descriptions: ["Cambio de aceite hidráulico y revisión de sellos.", "Limpieza y ajuste general de la máquina."] },
      { category: "Correctivo", service_name: "Reparación hidráulica", descriptions: ["Fuga de aceite en cilindro principal, cambio de sello.", "Presión hidráulica inestable, revisar válvula."] },
      { category: "Correctivo", service_name: "Reparación mecánica", descriptions: ["Ruido anormal en reductora, cambio de rodamiento.", "Desalineación de husillo."] },
      { category: "Correctivo", service_name: "Reparación eléctrica", descriptions: ["Contactor de arranque quemado, reemplazo.", "Fallos intermitentes en tablero de control."] },
    ],
    tasks: [
      { title: "Engrase semanal Prensa Hidráulica", assigned: "a_tec1", category: "Mantenimiento", due: iso(1), important: true },
      { title: "Inspección de seguridad Montacargas", assigned: "a_tec2", category: "Prevención", due: iso(2) },
      { title: "Preparar pedido de rodamientos", assigned: "a_aux", category: "Inventario", due: iso(4) },
      { title: "Prueba de estanqueidad compresor", assigned: "a_tec1", category: "Calidad", due: iso(6) },
      { title: "Actualizar plano de planta", assigned: "a_admin", category: "Documentación", due: iso(9) },
      { title: "Revisión de niveles de refrigerante", assigned: "a_tec2", category: "Mantenimiento", due: iso(11) },
    ],
  },
  {
    // EXISTENTE — solo enriquecer data
    name: "Hoteles Caribe LTDA",
    orderTarget: 40,
    users: [],
    inventory: [
      { sku: "HC-A001", name: "Refrigerante R410A (cilindro)", unit: "cilindro", quantity: 3, unit_cost: 450000, low_stock_threshold: 2 },
      { sku: "HC-A002", name: "Gas refrigerante R22 (cilindro)", unit: "cilindro", quantity: 2, unit_cost: 850000, low_stock_threshold: 1 },
      { sku: "HC-F003", name: "Filtro de aire chiller (set)", unit: "set", quantity: 5, unit_cost: 115000, low_stock_threshold: 6 },
      { sku: "HC-B004", name: "Bomba de sumidero 2HP", unit: "unidad", quantity: 1, unit_cost: 650000, low_stock_threshold: 2 },
      { sku: "HC-E005", name: "Contactor 3x32A", unit: "unidad", quantity: 10, unit_cost: 58000, low_stock_threshold: 8 },
      { sku: "HC-N006", name: "Neumático montacargas 2.5T", unit: "unidad", quantity: 2, unit_cost: 380000, low_stock_threshold: 4 },
    ],
    services: [
      { category: "Preventivo", service_name: "Climatización", descriptions: ["Limpieza y carga de refrigerante R410A.", "Revisión de presiones de chiller."] },
      { category: "Correctivo", service_name: "Hidráulica", descriptions: ["Revisión de capacitor y sello mecánico.", "Fuga en bomba de piscina."] },
      { category: "Correctivo", service_name: "Eléctrico", descriptions: ["Sobrecalentamiento en tablero de piscina.", "Fallo en arranque de planta eléctrica."] },
      { category: "Preventivo", service_name: "Mantenimiento preventivo", descriptions: ["Limpieza y lubricación de equipos.", "Revisión de niveles y filtros."] },
    ],
    tasks: [
      { title: "Chequeo trimestral planta CAT", assigned: "h_tec1", category: "Respaldo", due: iso(3) },
      { title: "Revisión de filtros de chiller", assigned: "h_tec1", category: "Climatización", due: iso(1), important: true },
      { title: "Inspección de bomba de piscina", assigned: "h_tec1", category: "Piscina", due: iso(5) },
      { title: "Pedido de neumáticos para montacargas", assigned: "h_aux", category: "Inventario", due: iso(8) },
    ],
  },
  {
    // EXISTENTE — solo enriquecer data
    name: "Cementos Pacífico",
    orderTarget: 40,
    users: [],
    inventory: [
      { sku: "CP-B001", name: "Blindaje de molino (set)", unit: "set", quantity: 2, unit_cost: 12500000, low_stock_threshold: 3 },
      { sku: "CP-R002", name: "Rodillo de chancadora (repuesto)", unit: "unidad", quantity: 1, unit_cost: 3800000, low_stock_threshold: 2 },
      { sku: "CP-A003", name: "Aceite de molino ISO 150", unit: "barril", quantity: 8, unit_cost: 2100000, low_stock_threshold: 5 },
      { sku: "CP-RE004", name: "Refractario de horno (kg)", unit: "kg", quantity: 1500, unit_cost: 8500, low_stock_threshold: 1000 },
      { sku: "CP-F005", name: "Filtro de mangas (bolsa)", unit: "bolsa", quantity: 60, unit_cost: 32000, low_stock_threshold: 80 },
      { sku: "CP-M006", name: "Motorreductor 3/1 (11kW)", unit: "unidad", quantity: 2, unit_cost: 5400000, low_stock_threshold: 2 },
    ],
    services: [
      { category: "Preventivo", service_name: "Molienda", descriptions: ["Reemplazo de blindajes del molino.", "Revisión de carga de bolas."] },
      { category: "Correctivo", service_name: "Trituración", descriptions: ["Sobrecalentamiento de cojinetes.", "Revisión de alineación de chancadora."] },
      { category: "Correctivo", service_name: "Clinkerización", descriptions: ["Revisión de refractario del horno.", "Ajuste de quemadores."] },
      { category: "Preventivo", service_name: "Inspección de seguridad", descriptions: ["Verificación de guardas.", "Control de polvo en planta."] },
    ],
    tasks: [
      { title: "Inspección de refractario Horno", assigned: "c_tec1", category: "Alta temperatura", due: iso(3), important: true },
      { title: "Cambio de filtros de mangas", assigned: "c_tec1", category: "Mantenimiento", due: iso(2) },
      { title: "Revisión de carga de bolas molino", assigned: "c_tec1", category: "Molienda", due: iso(5) },
      { title: "Pedido de blindajes de molino", assigned: "c_aux", category: "Inventario", due: iso(7) },
    ],
  },
];// ─── Ejecutor: concat de SEED (Arrays en _p1+_p2) + este bloque  ─────────────
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