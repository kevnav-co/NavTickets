# NavTicket - Deployment Guide & Checklist

## Pre-requisitos
- Cuenta en [Supabase](https://supabase.com)
- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [OneSignal](https://onesignal.com) para push notifications

---

## 1. CONFIGURACIÓN DE SUPABASE

### 1.1 Crear Proyecto
1. Ir a [Supabase Dashboard](https://app.supabase.com)
2. "New Project" → Organización → Nombre: `navticket`
3. Región: `us-east-1` (o la más cercana a tus usuarios)
4. Guardar contraseña de la base de datos

### 1.2 Ejecutar Migraciones
En **SQL Editor** del dashboard, ejecutar en orden:

```sql
-- 01_habilitar_extensiones.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";  -- CRÍTICO para webhooks
```

Luego copiar y ejecutar el contenido de:
- `supabase/migrations/001_schema.sql`
- `supabase/migrations/002_seed.sql`
- `supabase/migrations/003_triggers.sql`
- `supabase/migrations/004_fix_rls_recursion.sql` — **OBLIGATORIO**: corrige la recursión RLS infinita en la policy de `users` (sin esto, ninguna consulta del cliente funciona y el dashboard se queda cargando).

### 1.3 Configurar Variables de Sesión (para pg_net)
En **Settings → Database → Session settings**:

```
app.vercel_api_base = 'https://tu-proyecto.vercel.app'
app.webhook_secret = 'tu-secreto-seguro-generado-con-openssl-rand-hex-32'
```

Generar el secret:
```bash
openssl rand -hex 32
```

### 1.4 Configurar URLs permitidas (CORS/Auth)
En **Authentication → URL Configuration**:
- Site URL: `https://tu-proyecto.vercel.app`
- Redirect URLs: `https://tu-proyecto.vercel.app/**`, `capacitor://localhost`, `http://localhost:8080`

### 1.5 Obtener Credenciales
En **Settings → API**:
- Project URL: `https://xxxx.supabase.co`
- Service Role Key: `eyJhbGciOi...` (¡MANTENER SECRETO!)
- Anon Key: `eyJhbGciOi...`

---

## 2. CONFIGURACIÓN DE VERCEL

### 2.1 Importar Repositorio
1. Conectar GitHub repo a Vercel
2. Framework Preset: **Vite**
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Install Command: `npm install`

### 2.2 Variables de Entorno (Settings → Environment Variables)

| Variable | Valor | Entorno |
|----------|-------|---------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (service role) | All |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon key) | All |
| `CRON_SECRET` | `openssl rand -hex 32` | All |
| `WEBHOOK_SECRET` | **Mismo que en Supabase** | All |
| `VERCEL_API_BASE` | `https://tu-proyecto.vercel.app` | All |
| `ONESIGNAL_APP_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | All |
| `ONESIGNAL_API_KEY` | `YWNiYz...` (REST API Key) | All |

### 2.3 Variables de Supabase para Frontend (prefijo VITE_)
| Variable | Valor |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon key) |
| `VITE_ONESIGNAL_APP_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

> **NOTA**: Las variables con prefijo `VITE_` se exponen al bundle del cliente.

### 2.4 Deploy
```bash
vercel --prod
```

---

## 3. CONFIGURACIÓN DE ONESIGNAL

### 3.1 Crear App
1. [OneSignal Dashboard](https://dashboard.onesignal.com) → "New App"
2. Nombre: `NavTicket`
3. Platform: **Web Push** (Chrome, Firefox, Safari, Edge)
4. Configurar Site URL: `https://tu-proyecto.vercel.app`
5. Copiar **App ID** y **REST API Key** (Settings → Keys & IDs)

### 3.2 Configurar en Vercel
Agregar `ONESIGNAL_APP_ID` y `ONESIGNAL_API_KEY` como variables de entorno.

### 3.3 Configurar en Frontend
En `src/services/oneSignal.ts`, el `appId` se toma de `import.meta.env.VITE_ONESIGNAL_APP_ID`.

---

## 4. MIGRACIÓN DE USUARIOS Y AUTH

### 4.1 Exportar usuarios de Firebase
Script para exportar usuarios:
```javascript
// En Functions emulator o Cloud Shell
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const users = await db.collection('users').get();
for (const doc of users.docs) {
  console.log(JSON.stringify({ id: doc.id, ...doc.data() }));
}
```

### 4.2 Importar a Supabase
1. Insertar en tabla `users` (sin `supabase_auth_id` por ahora)
2. Crear usuarios en Supabase Auth vía Admin API:
```javascript
const { data, error } = await supabase.auth.admin.createUser({
  email: 'user@navas.com',
  password: 'temporal123',
  email_confirm: true,
  user_metadata: { role: 'technician', company_id: 'xxx' }
});
```
3. Vincular: `UPDATE users SET supabase_auth_id = '${data.user.id}' WHERE username = 'user';`

### 4.3 Login
Los usuarios usan: `username@navas.com` como email + password.
El código en `AuthContext` ya maneja esto.

---

## 5. MIGRACIÓN DE DATOS (Firestore → Supabase)

Ejecutar scripts de migración por colección:
- `companies` → `companies`
- `users` → `users`
- `clients` → `clients`
- `equipment` → `equipment` + `equipment_orders` (M:N)
- `orders` → `orders`
- `tasks` → `tasks` + `task_participants` (M:N)
- `notifications` → `notifications`

---

## 6. VERIFICACIÓN POST-DEPLOY

### 6.1 Health Checks
| Comando | Esperado |
|---------|----------|
| `GET https://tu-proyecto.vercel.app/api/edge/cuenti-proxy` | JSON de clientes o error 500 (si sin credenciales Cuenti) |
| `GET https://tu-proyecto.vercel.app/sw.js` | Service worker JS |
| Login con usuario real | Dashboard carga configuración |

### 6.2 Test Notificaciones
1. Login como admin
2. Ir a panel admin → "Enviar Notificación de Prueba"
3. Verificar push en dispositivo

### 6.3 Test Webhooks
```bash
# Desde Supabase SQL Editor:
INSERT INTO orders (company_id, order_number, name, technician_id, ...)
VALUES ('xxx', 9999, 'Test', '<user-id>', ...);

-- Debería crear notificación en tabla notifications
```

### 6.4 Tareas programadas (schedules)
> **Fuente única de schedules = Supabase Edge Functions programadas.** No hay crons en Vercel.
> El endpoint de Vercel `daily-expiration-check` se movió a una Supabase Edge Function nativa
> (`supabase/functions/daily-expiration-check`, programada `0 8 * * *`), que convive con
> `task-scheduler` (`*/5 * * * *`) en la misma plataforma.

| Función | Cadencia | En | Ejecutar a mano |
|---------|----------|----|-----------------|
| `task-scheduler` (recordatorios/vencimientos/recurrentes) | Cada 5 min | Supabase Edge | `curl -X POST "$(supabase functions deploy ...)"` |
| `daily-expiration-check` (mantenimiento/garantías) | Diaria 08:00 | Supabase Edge | Dashboard → Edge Functions → Invoke |

Los webhooks por eventos (`on-order-assigned`, `on-task-assigned`, `support-notify`) se disparan
desde triggers de la BD (pg_net), no son crons.

---

## 7. COMANDOS ÚTILES

```bash
# Desarrollo local con Supabase
npm run dev

# Build y análisis de bundle
npm run build:analyze

# Tests
npm test

# Deploy manual
vercel --prod

# Ver logs cron
vercel logs --scope=cron
```

---

## 8. ROLLBACK

Si algo falla:
1. Vercel: `vercel rollback [deployment-url]`
2. Supabase: Restaurar snapshot de base de datos (Dashboard → Backups)
3. DNS: Cambiar DNS a Firebase Hosting temporal si es crítico

---

## 9. CONTACTOS Y SOPORTE

- Supabase: https://supabase.com/support
- Vercel: https://vercel.com/support
- OneSignal: https://onesignal.com/support