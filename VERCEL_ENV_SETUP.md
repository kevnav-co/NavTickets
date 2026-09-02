# Vercel Environment Variables Configuration

## Required Variables (All Environments: Production, Preview, Development)

### Supabase Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase Project URL (from Settings → API) | `https://abcdefg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (SECRET - from Settings → API) | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_ANON_KEY` | Anon/Public Key (from Settings → API) | `eyJhbGciOiJIUzI1NiIs...` |

### Frontend Variables (VITE_ prefix - exposed to client bundle)
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL | `https://abcdefg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY | `eyJhbGciOiJIUzI1NiIs...` |
| `VITE_ONESIGNAL_APP_ID` | OneSignal App ID (from Dashboard → Settings → Keys & IDs) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### Cron & Webhook Security
| Variable | Description | Generation |
|----------|-------------|------------|
| `CRON_SECRET` | (Legacy) Secret for Vercel cron job authorization. Ya no hay crons en Vercel; se conserva por compatibilidad. | `openssl rand -hex 32` |
| `WEBHOOK_SECRET` | Shared secret for Supabase pg_net webhooks. **Sí se valida**: los edges `on-order-assigned`, `on-task-assigned` y `support-notify` comprueban el header `Authorization: Bearer <WEBHOOK_SECRET>` contra esta variable. Sin ella, los dos `on-*` aceptan cualquier POST (endurecerlo: setear este env). | `openssl rand -hex 32` |

### Application URLs
| Variable | Description | Example |
|----------|-------------|---------|
| `VERCEL_API_BASE` | Production Vercel URL | `https://navticket.vercel.app` |

### OneSignal Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `ONESIGNAL_API_KEY` | OneSignal REST API Key (Settings → Keys & IDs) | `YWNiYz...` |

### Cuenti ERP Proxy (Optional - for client import feature)
| Variable | Description | Example |
|----------|-------------|---------|
| `CUENTI_API_TOKEN` | Cuenti API Token | `dEmafMDjPaYNJEY0eLlMi2OAz...` |
| `CUENTI_EMPRESA_ID` | Cuenti Empresa ID | `14507` |
| `CUENTI_USER_ID` | Cuenti User ID | `22736` |

> Las variables `VITE_FIREBASE_*` / `VITE_VAPID_KEY` quedaron **retiradas**: el push ya no usa Firebase Messaging (ver `directivas/directiva_notificaciones_fcm.md`). El push se sirve con **OneSignal** (`VITE_ONESIGNAL_APP_ID` en frontend + `ONESIGNAL_API_KEY`/`ONESIGNAL_APP_ID` como secrets del proyecto Supabase).

---

## How to Configure in Vercel

### Option 1: Via Vercel Dashboard (Recommended)
1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Click **Add New** for each variable above
3. Select **All Environments** (Production, Preview, Development)
4. Click **Save**

### Option 2: Via Vercel CLI
```bash
# Set production variables
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_ANON_KEY production
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_ONESIGNAL_APP_ID production
vercel env add CRON_SECRET production
vercel env add WEBHOOK_SECRET production
vercel env add VERCEL_API_BASE production
vercel env add ONESIGNAL_API_KEY production
vercel env add CUENTI_API_TOKEN production
vercel env add CUENTI_EMPRESA_ID production
vercel env add CUENTI_USER_ID production

# NOTA: NO agregues variables VITE_FIREBASE_* ni VITE_VAPID_KEY.
# Firebase Messaging quedó retirado; el push es OneSignal (solo VITE_ONESIGNAL_APP_ID + ONESIGNAL_API_KEY).

# Then deploy
vercel --prod
```

### Option 3: Bulk Import from .env file
```bash
# Create .env.vercel with all variables
vercel env pull .env.vercel
# Edit .env.vercel with your values
vercel env push .env.vercel
```

---

## Critical Configuration Notes

### 1. WEBHOOK_SECRET MUST Match Supabase
In **Supabase Dashboard** → **Settings** → **Database** → **Session settings**:
```
app.vercel_api_base = 'https://your-app.vercel.app'
app.webhook_secret = 'YOUR_WEBHOOK_SECRET_VALUE'
```
The `app.webhook_secret` must exactly match the `WEBHOOK_SECRET` in Vercel.

### 2. OneSignal Setup
1. Create app at [OneSignal Dashboard](https://dashboard.onesignal.com)
2. Platform: **Web Push**
3. Site URL: `https://your-app.vercel.app`
4. Copy **App ID** → `VITE_ONESIGNAL_APP_ID`
5. Copy **REST API Key** → `ONESIGNAL_API_KEY`

### 3. Supabase Auth Configuration
In **Supabase Dashboard** → **Authentication** → **URL Configuration**:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: 
  - `https://your-app.vercel.app/**`
  - `http://localhost:8080/**` (for local dev)
  - `capacitor://localhost` (for mobile)

### 4. pg_net Extension (Required for Webhooks)
In **Supabase SQL Editor**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

## Verify Configuration

After setting variables and deploying:

```bash
# Test Cuenti proxy (ahora requiere JWT de sesión con rol admin/developer/super_admin)
curl -H "Authorization: Bearer <access_token>" https://your-app.vercel.app/api/cuenti/clients

# Test OneSignal
# Login to app → Enable notifications in header → Check device for push
```
Sin header `Authorization` (o con rol no admin), `cuenti-proxy` responde 401/403.