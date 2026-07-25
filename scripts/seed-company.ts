// scripts/seed-company.ts
// Creates a new company with admin user, default tabs, and branding configuration.
//
// Usage:
//   npx ts-node scripts/seed-company.ts
//
// Environment:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json (or use Firebase login)

import * as admin from 'firebase-admin';
import { createInterface } from 'readline';

// ─── Initialize Firebase Admin ──────────────────────────────────
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (e) {
    console.error(
      '❌ Error initializing Firebase Admin SDK.\n' +
      'Make sure you have set GOOGLE_APPLICATION_CREDENTIALS or run `firebase login`.\n'
    );
    process.exit(1);
  }
}

const db = admin.firestore();
const auth = admin.auth();

// ─── Prompt Helper ──────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 === Seed: Crear Nueva Empresa ===\n');

  const name = await ask('🏢 Nombre de la empresa: ');
  if (!name.trim()) { console.error('❌ El nombre es obligatorio.'); rl.close(); return; }

  const slug = await ask(`🔗 Slug (URL) [${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}]: `);
  const finalSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const companyId = finalSlug;

  const emailDomain = await ask(`📧 Dominio de email [@${finalSlug}.com]: `);
  const finalDomain = emailDomain.trim() || `@${finalSlug}.com`;

  const adminName = await ask('👤 Nombre del admin: ');
  if (!adminName.trim()) { console.error('❌ El nombre del admin es obligatorio.'); rl.close(); return; }

  const adminUsername = await ask(`👤 Usuario del admin [admin]: `);
  const finalUsername = adminUsername.trim() || 'admin';

  const adminEmail = `${finalUsername}${finalDomain}`;
  const adminPassword = await ask('🔑 Contraseña (mín. 6 caracteres) [admin123]: ');
  const finalPassword = adminPassword.trim() || 'admin123';

  const primaryColor = await ask(`🎨 Color primario [#7b1113]: `);
  const finalColor = primaryColor.trim() || '#7b1113';

  console.log('\n📋 === Resumen ===');
  console.log(`  Empresa:     ${name}`);
  console.log(`  Slug:        ${finalSlug}`);
  console.log(`  Company ID:  ${companyId}`);
  console.log(`  Dominio:     ${finalDomain}`);
  console.log(`  Admin:       ${adminName} (${adminEmail})`);
  console.log(`  Contraseña:  ${'•'.repeat(finalPassword.length)}`);
  console.log(`  Color:       ${finalColor}`);
  console.log('');

  const confirm = await ask('¿Confirmar creación? (s/N): ');
  if (confirm.toLowerCase() !== 's') {
    console.log('❌ Cancelado.');
    rl.close();
    return;
  }

  try {
    // ─── 1. Create Company Document ─────────────────────────────
    console.log('\n📝 Creando empresa en Firestore...');
    const companyData = {
      name,
      slug: finalSlug,
      theme: {
        primaryColor: finalColor,
        logoUrl: '',
        iconUrl: '',
      },
      features: {
        accounting: false,
        maps: true,
        aiAssistant: false,
        equipmentManagement: true,
      },
      auth: {
        emailDomain: finalDomain,
        allowedRoles: ['technician', 'supervisor', 'admin', 'aux_admin'],
      },
      tabs: [
        { id: 'dashboard', label: 'Inicio', icon: 'LayoutDashboard', route: '/', type: 'built-in', builtInComponent: 'dashboard', enabled: true, order: 0, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
        { id: 'tasks', label: 'Tareas', icon: 'CheckSquare', route: '/tasks', type: 'built-in', builtInComponent: 'tasks', enabled: true, order: 1, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
        { id: 'orders', label: 'Órdenes', icon: 'ClipboardList', route: '/orders', type: 'built-in', builtInComponent: 'orders', enabled: true, order: 2, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
        { id: 'clients', label: 'Clientes', icon: 'Users', route: '/clients', type: 'built-in', builtInComponent: 'clients', enabled: true, order: 3, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
        { id: 'equipment', label: 'Máquinas', icon: 'Settings2', route: '/equipment', type: 'built-in', builtInComponent: 'equipment', enabled: true, order: 4, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
        { id: 'users', label: 'Equipo', icon: 'UserCog', route: '/users', type: 'built-in', builtInComponent: 'users', enabled: true, order: 5, roles: ['admin'] },
        { id: 'map', label: 'Mapa', icon: 'Map', route: '/map', type: 'built-in', builtInComponent: 'map', enabled: true, order: 6, roles: ['technician', 'supervisor', 'admin', 'aux_admin'] },
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('companies').doc(companyId).set(companyData);
    console.log(`  ✅ Empresa "${name}" creada (ID: ${companyId})`);

    // ─── 2. Create Firebase Auth User ──────────────────────────
    console.log('\n👤 Creando usuario admin en Firebase Auth...');
    const userRecord = await auth.createUser({
      email: adminEmail,
      password: finalPassword,
      displayName: adminName,
      emailVerified: true,
    });
    console.log(`  ✅ Usuario creado: ${userRecord.uid}`);

    // ─── 3. Set Custom Claims ──────────────────────────────────
    console.log('\n🔐 Asignando custom claims...');
    await auth.setCustomUserClaims(userRecord.uid, {
      companyId: companyId,
      role: 'admin',
    });
    console.log(`  ✅ companyId="${companyId}", role="admin"`);

    // ─── 4. Create User Document in Firestore ──────────────────
    console.log('\n📄 Creando documento de usuario en Firestore...');
    await db.collection('users').doc(userRecord.uid).set({
      id: userRecord.uid,
      name: adminName,
      username: finalUsername,
      role: 'admin',
      companyId: companyId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ Documento de usuario creado.');

    // ─── 5. Done ───────────────────────────────────────────────
    console.log('\n✅ === EMPRESA CREADA EXITOSAMENTE ===');
    console.log(`  🏢 Empresa:      ${name}`);
    console.log(`  🆔 ID:           ${companyId}`);
    console.log(`  👤 Admin:        ${adminName}`);
    console.log(`  📧 Email login:  ${adminEmail}`);
    console.log(`  🔑 Contraseña:   ${'•'.repeat(finalPassword.length)}`);
    console.log(`  🌐 URL app:      https://${adminEmail.split('@')[1]?.replace('.', '-') || companyId}.web.app`);
    console.log('\n💡 Recomendaciones:');
    console.log('   1. Despliega las reglas de Firestore: firebase deploy --only firestore:rules');
    console.log('   2. Sube logos desde el panel de administración (/admin)');
    console.log('   3. Crea usuarios adicionales desde el panel');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'auth/email-already-exists') {
      console.error('   El email del admin ya está registrado. Prueba con otro username.');
    }
    if (error.code === 'auth/weak-password') {
      console.error('   La contraseña debe tener al menos 6 caracteres.');
    }
    console.error('   Detalles:', JSON.stringify(error.errorInfo || error, null, 2));
  }

  rl.close();
}

main();