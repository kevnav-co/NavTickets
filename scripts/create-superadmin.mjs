#!/usr/bin/env node
// =============================================================================
// NavTicket - Crear una cuenta super_admin (acceso total multi-tenant).
// =============================================================================
// Uso:
//   node scripts/create-superadmin.mjs [username] [password] [nombreMostrar]
//
// Configuración: lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env (raíz) o entorno.
// Pasos con service-role key (salta RLS):
//   1) createUser de Supabase Auth (email=username@navas.com, pw) -> UID
//   2) INSERT users(company <semilla>, name, role='super_admin', username, supabase_auth_id)
// =============================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

function loadEnv() {
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const idx = t.indexOf('=');
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const [username = 'super', password = 'SuperAdmin#2026', displayName = 'Super Admin'] = process.argv.slice(2);
const email = `${username}@navas.com`;
if (password.length < 6) {
  console.error('❌ La contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}

const headers = (json = false) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

// --- 1. Crear cuenta en Supabase Auth ---
const authRes = await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: headers(true),
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const authBody = await authRes.json();
if (!authRes.ok) {
  console.error('❌ Paso 1 (auth user) falló:', authRes.status, JSON.stringify(authBody));
  process.exit(1);
}
const uid = authBody.id;
console.log(`✅ 1) Cuenta Auth creada: ${email} (uid=${uid})`);

// --- 2. Vincular como super_admin en users ---
const usersRes = await fetch(`${URL}/rest/v1/users`, {
  method: 'POST',
  headers: { ...headers(true), Prefer: 'return=representation' },
  body: JSON.stringify({
    company_id: SEED_COMPANY_ID,
    name: displayName,
    role: 'super_admin',
    username,
    supabase_auth_id: uid,
  }),
});
const usersBody = await usersRes.json();
if (!usersRes.ok) {
  // Rollback del auth user si falla el vínculo
  await fetch(`${URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers });
  console.error('❌ Paso 2 (vincular users) falló:', usersRes.status, JSON.stringify(usersBody));
  process.exit(1);
}
const user = Array.isArray(usersBody) ? usersBody[0] : usersBody;
console.log(`✅ 2) Super admin vinculado: users id=${user.id}, username=${user.username}, role=${user.role}`);
console.log('\n🎉 Listo. Inicia sesión en https://navtickets.vercel.app con:');
console.log('   Usuario:', username, '| Contraseña:', password, '| (email', email + ')');