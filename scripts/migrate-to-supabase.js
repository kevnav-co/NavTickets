// =============================================================================
// NavTicket - Script de migración de datos: Firestore → Supabase
// =============================================================================
// Uso:
//   1. Configurar variables de entorno o .env:
//      - FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
//      - SUPABASE_URL=https://xxxxx.supabase.co
//      - SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   2. node scripts/migrate-to-supabase.js
//
// Este script LEE desde Firestore y ESCRIBE en Supabase PostgreSQL.
// No modifica ni elimina datos de Firestore.
// =============================================================================

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// ─── Configuración ───────────────────────────────────────────────────────────

// Cargar .env si existe
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH))
  : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!FIREBASE_SERVICE_ACCOUNT) {
  console.warn('⚠️  No se encontró FIREBASE_SERVICE_ACCOUNT_PATH. Usando aplicación por defecto...');
  console.warn('   Asegúrate de tener configuradas las credenciales de Gcloud/ Firebase.');
}

// ─── Inicializar clientes ─────────────────────────────────────────────────────

// Firestore Admin
if (!admin.apps.length) {
  if (FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT),
    });
  } else {
    admin.initializeApp(); // Usa gcloud default auth
  }
}
const db = admin.firestore();

// Supabase Admin (con service_role key para bypass RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Mapeo colección → tabla ──────────────────────────────────────────────────

const COLLECTION_MAP = {
  companies:    { table: 'companies',    idField: 'id' },
  users:        { table: 'users',        idField: 'id' },
  clients:      { table: 'clients',      idField: 'id' },
  equipment:    { table: 'equipment',    idField: 'id' },
  orders:       { table: 'orders',       idField: 'id' },
  tasks:        { table: 'tasks',        idField: 'id' },
  notifications: { table: 'notifications', idField: 'id' },
};

// ─── Transformaciones camelCase → snake_case ──────────────────────────────────

const SNAKE_CASE_MAP = {
  companyId: 'company_id',
  clientId: 'client_id',
  clientName: 'client_name',
  technicianId: 'technician_id',
  equipmentIds: 'equipment_ids',
  scheduledDate: 'scheduled_date',
  timeSlot: 'time_slot',
  scheduledEndTime: 'scheduled_end_time',
  actualStartDate: 'actual_start_date',
  orderType: 'order_type',
  serviceName: 'service_name',
  warrantyPeriod: 'warranty_period',
  warrantyExpiration: 'warranty_expiration',
  isUnderWarrantyReview: 'is_under_warranty_review',
  warrantyJobs: 'warranty_jobs',
  warrantyStartTime: 'warranty_start_time',
  warrantyEndTime: 'warranty_end_time',
  closingData: 'closing_data',
  warrantyNotificationSent: 'warranty_notification_sent',
  lastUpdatedBy: 'last_updated_by',
  serialNumber: 'serial_number',
  gasType: 'gas_type',
  imageUrl: 'image_url',
  lastMaintenanceDate: 'last_maintenance_date',
  maintenanceFrequency: 'maintenance_frequency',
  nextMaintenanceNotificationSent: 'next_maintenance_notification_sent',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  completedAt: 'completed_at',
  dueDate: 'due_date',
  reminderNotificationSent: 'reminder_notification_sent',
  dueDateNotificationSent: 'due_date_notification_sent',
  assignedTo: 'assigned_to',
  createdBy: 'created_by',
  fcmToken: 'fcm_token',
  locationUpdatedAt: 'location_updated_at',
  supabaseAuthId: 'supabase_auth_id',
  timeAgo: 'time_ago',
  orderNumber: 'order_number',
};

/**
 * Convierte un objeto de Firestore (camelCase) a snake_case para PostgreSQL.
 * - Convierte Timestamps de Firestore a strings ISO
 * - Convierte arrays/blobs a JSONB donde aplica
 * - Elimina campos que no existen en PostgreSQL
 */
function toSnakeCase(doc) {
  const result = {};
  const deleteFields = ['equipmentIds', 'password', 'fcmToken'];

  for (const [key, value] of Object.entries(doc)) {
    // Saltar campos a eliminar
    if (deleteFields.includes(key)) continue;

    // Saltar valores Blob (no se pueden migrar directamente)
    if (typeof value === 'object' && value !== null && value.constructor?.name === 'Blob') {
      console.warn(`  ⚠️  Campo '${key}': Blob omitido (no migrable directamente)`);
      continue;
    }

    // Convertir Timestamp de Firestore a ISO string
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      result[toSnake(key)] = value.toDate().toISOString();
      continue;
    }

    // Convertir Date a ISO string
    if (value instanceof Date) {
      result[toSnake(key)] = value.toISOString();
      continue;
    }

    // Arrays de strings → JSONB
    if (Array.isArray(value)) {
      // Si contiene Blobs, convertir a URLs vacías (no migrables)
      if (value.some(v => v && typeof v === 'object' && v.constructor?.name === 'Blob')) {
        result[toSnake(key)] = JSON.stringify([]);
        continue;
      }
      // Si contiene objetos WarrantyJob/closingData, convertir a JSONB
      result[toSnake(key)] = JSON.stringify(value);
      continue;
    }

    // Objetos → JSONB (closingData, etc.)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[toSnake(key)] = JSON.stringify(value);
      continue;
    }

    // Valores simples
    result[toSnake(key)] = value;
  }

  return result;
}

function toSnake(camel) {
  if (SNAKE_CASE_MAP[camel]) return SNAKE_CASE_MAP[camel];
  // Fallback: convertir camelCase a snake_case automáticamente
  return camel.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

function formatCount(c) {
  const plural = c === 1 ? '' : 's';
  return `${c} documento${plural}`;
}

function summarizeErrors(errors) {
  const byTable = {};
  for (const e of errors) {
    if (!byTable[e.table]) byTable[e.table] = [];
    byTable[e.table].push(e);
  }

  console.log('\n📊 RESUMEN DE ERRORES:');
  for (const [table, errs] of Object.entries(byTable)) {
    console.log(`  ${table}: ${errs.length} error(es)`);
    errs.slice(0, 3).forEach(e => {
      console.log(`    - ${e.id}: ${e.error}`);
    });
    if (errs.length > 3) {
      console.log(`    ... y ${errs.length - 3} más`);
    }
  }
}

async function migrateCollection(collectionName) {
  const mapping = COLLECTION_MAP[collectionName];
  if (!mapping) {
    console.log(`  ↪ Saltando (sin mapeo definido)`);
    return { success: 0, errors: [] };
  }

  const { table } = mapping;
  console.log(`\n📦 Migrando ${collectionName} → ${table}...`);

  let successCount = 0;
  const errors = [];

  try {
    const snapshot = await db.collection(collectionName).get();
    const totalDocs = snapshot.size;
    console.log(`   ${formatCount(totalDocs)} encontrados en Firestore`);

    if (totalDocs === 0) {
      console.log(`   ✅ Sin datos que migrar`);
      return { success: 0, errors: [] };
    }

    // Procesar en lotes de 50 para evitar timeouts
    const BATCH_SIZE = 50;
    const docs = snapshot.docs;
    let completed = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      const records = batch.map(doc => {
        const data = doc.data();
        const record = toSnakeCase({ id: doc.id, ...data });
        return record;
      });

      const { error } = await supabase
        .from(table)
        .upsert(records, { onConflict: 'id' });

      if (error) {
        // Intentar uno por uno para identificar registros problemáticos
        console.error(`   ⚠️  Error en lote, intentando individualmente...`);
        for (const record of records) {
          const { error: singleError } = await supabase
            .from(table)
            .upsert(record, { onConflict: 'id' });

          if (singleError) {
            errors.push({
              table,
              id: record.id,
              error: singleError.message,
            });
          } else {
            successCount++;
          }
        }
      } else {
        successCount += batch.length;
      }

      completed += batch.length;
      const pct = Math.round((completed / totalDocs) * 100);
      process.stdout.write(`\r   Progreso: ${completed}/${totalDocs} (${pct}%)`);
    }

    console.log(`\n   ✅ ${formatCount(successCount)} migrados exitosamente`);
    if (errors.length > 0) {
      console.log(`   ❌ ${formatCount(errors.length)} con errores`);
    }
  } catch (err) {
    console.error(`   ❌ Error crítico migrando ${collectionName}:`, err.message);
    errors.push({ table, id: 'N/A', error: err.message });
  }

  return { success: successCount, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   NavTicket — Migración Firestore → Supabase ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Firestore project: ${admin.instanceId ? 'Conectado' : 'No conectado'}`);
  console.log('');

  const collections = Object.keys(COLLECTION_MAP);
  let totalSuccess = 0;
  const allErrors = [];

  for (const collection of collections) {
    const result = await migrateCollection(collection);
    totalSuccess += result.success;
    allErrors.push(...result.errors);
  }

  // ─── Migrar relaciones M:N ──────────────────────────────────────────────────

  console.log('\n📦 Migrando equipmentIds (relación M:N orders → equipment)...');
  try {
    const ordersSnapshot = await db.collection('orders').get();
    let eqOrderCount = 0;
    for (const doc of ordersSnapshot.docs) {
      const data = doc.data();
      const equipmentIds = data.equipmentIds || [];
      if (equipmentIds.length > 0) {
        const eqOrderRecords = equipmentIds.map(eqId => ({
          equipment_id: eqId,
          order_id: doc.id,
        }));
        const { error } = await supabase
          .from('equipment_orders')
          .upsert(eqOrderRecords, { onConflict: 'equipment_id,order_id' });

        if (error) {
          console.error(`   ⚠️  Error en equipment_orders para order ${doc.id}:`, error.message);
        } else {
          eqOrderCount += equipmentIds.length;
        }
      }
    }
    console.log(`   ✅ ${eqOrderCount} relaciones equipment_orders migradas`);
  } catch (err) {
    console.error(`   ❌ Error migrando equipment_orders:`, err.message);
  }

  console.log('\n📦 Migrando participants (tasks → task_participants)...');
  try {
    const tasksSnapshot = await db.collection('tasks').get();
    let tpCount = 0;
    for (const doc of tasksSnapshot.docs) {
      const data = doc.data();
      const participants = data.participants || [];
      if (participants.length > 0) {
        const tpRecords = participants.map(uid => ({
          task_id: doc.id,
          user_id: uid,
        }));
        const { error } = await supabase
          .from('task_participants')
          .upsert(tpRecords, { onConflict: 'task_id,user_id' });

        if (error) {
          console.error(`   ⚠️  Error en task_participants para task ${doc.id}:`, error.message);
        } else {
          tpCount += participants.length;
        }
      }
    }
    console.log(`   ✅ ${tpCount} relaciones task_participants migradas`);
  } catch (err) {
    console.error(`   ❌ Error migrando task_participants:`, err.message);
  }

  // ─── Resumen final ──────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════');
  console.log('📊 RESUMEN FINAL:');
  console.log(`  ✅ Total documentos migrados: ${totalSuccess}`);
  if (allErrors.length > 0) {
    summarizeErrors(allErrors);
  } else {
    console.log('  ✅ Sin errores');
  }
  console.log('══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});