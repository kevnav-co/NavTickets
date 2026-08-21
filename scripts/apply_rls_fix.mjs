// scripts/apply_rls_fix.mjs
// Aplica supabase/migrations/004_fix_rls_recursion.sql a la DB de producción
// vía pooler. Requiere: DB_PASSWORD (env) y pg instalado en /tmp/ntpg.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('C:/Users/Nvas/AppData/Local/Temp/ntpg/');
const pg = require('pg');

const password = process.env.DB_PASSWORD;
if (!password) { console.error('Falta DB_PASSWORD'); process.exit(1); }

const sql = readFileSync('C:/Users/Nvas/Free Claude/NavTicket/supabase/migrations/004_fix_rls_recursion.sql', 'utf8');

const client = new pg.Client({
  host: 'aws-0-us-east-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.hvysnxvuyexacktlwsbm',
  password,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Conectado ✔');
  await client.query(sql);
  console.log('Migración aplicada ✔ (004_fix_rls_recursion.sql)');
  // Verificación: comprobar que la policy ya no recusre
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  // (la verificación del cliente se hace después aparte)
} catch (e) {
  console.error('ERROR aplicando:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}