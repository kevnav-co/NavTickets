#!/usr/bin/env node
// =============================================================================
// NavTicket - Crear una empresa nueva (tenant) y su administrador en Supabase.
// =============================================================================
// Uso:
//   node scripts/create-company.mjs "<Nombre Empresa>" "<admin@correo.com>" "<password>"
//   [username] [nombreMostrar] [rol]
//
// Argumentos (posición): 1=nombre empresa, 2=email admin, 3=password admin,
//                        4=username (default 'admin'), 5=nombre mostrar (default 'Administrador'),
//                        6=rol (default 'admin').
//
// Realiza 3 pasos con la service-role key (salta RLS):
//   1) INSERT companies(name)                -> obtiene el id de la empresa
//   2) createUser de Supabase Auth (email,pw) -> obtiene el UID del auth user
//   3) INSERT users(company_id,name,role,username,supabase_auth_id) -> vincula admin al tenant
//
// Configuración: lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env (raíz) o variables de entorno.
// No modifica package.json ni instala dependencias (usa fetch global de Node 20+).
// =============================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Cargar .env (raíz) de forma mínima si no están en el entorno ---
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
  } catch {
    // .env ausente -> depender de variables de entorno ya definidas
  }
}
loadEnv();

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (en .env o entorno).');
  process.exit(1);
}

const [companyName, adminEmail, adminPassword, username = 'admin', displayName = 'Administrador', role = 'admin'] = process.argv.slice(2);

if (!companyName || !adminEmail || !adminPassword) {
  console.error('❌ Uso: node scripts/create-company.mjs "<Nombre Empresa>" "<admin@correo.com>" "<password>" [username] [nombreMostrar] [rol]');
  process.exit(1);
}

const headers = (json = false) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

// --- 1. Crear empresa ---
const companyRes = await fetch(`${URL}/rest/v1/companies`, {
  method: 'POST',
  headers: { ...headers(true), Prefer: 'return=representation' },
  body: JSON.stringify({ name: companyName }),
});
const companyBody = await companyRes.json();
if (!companyRes.ok) {
  console.error('❌ Paso 1 (empresa) falló:', companyRes.status, JSON.stringify(companyBody));
  process.exit(1);
}
const company = Array.isArray(companyBody) ? companyBody[0] : companyBody;
console.log(`✅ 1) Empresa creada: "${company.name}" (id=${company.id})`);

// --- 2. Crear usuario admin en Supabase Auth ---
const authRes = await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: headers(true),
  body: JSON.stringify({ email: adminEmail, password: adminPassword, email_confirm: true }),
});
const authBody = await authRes.json();
if (!authRes.ok) {
  console.error('❌ Paso 2 (auth user) falló:', authRes.status, JSON.stringify(authBody));
  process.exit(1);
}
const uid = authBody.id;
console.log(`✅ 2) Cuenta Auth creada: ${adminEmail} (uid=${uid})`);

// --- 3. Vincular admin al tenant en users ---
const usersRes = await fetch(`${URL}/rest/v1/users`, {
  method: 'POST',
  headers: { ...headers(true), Prefer: 'return=representation' },
  body: JSON.stringify({
    company_id: company.id,
    name: displayName,
    role,
    username,
    supabase_auth_id: uid,
  }),
});
const usersBody = await usersRes.json();
if (!usersRes.ok) {
  console.error('❌ Paso 3 (vincular users) falló:', usersRes.status, JSON.stringify(usersBody));
  process.exit(1);
}
const user = Array.isArray(usersBody) ? usersBody[0] : usersBody;
console.log(`✅ 3) Admin vinculado: users id=${user.id}, username=${user.username}, role=${user.role}`);

console.log('\n🎉 Empresa lista. Inicia sesión con:', adminEmail);
console.log('   (Los datos quedan bajo company_id', company.id, '— visibles solo dentro de ese tenant.)');