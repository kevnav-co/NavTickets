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
| `VITE_VAPID_PUBLIC_KEY` | Web Push VAPID public key (must equal `VAPID_PUBLIC_KEY` in Supabase secrets) | `BEl62iUYgUivxIkv69yViEuiBIa-Ib9...` |

### Cron & Webhook Security
| Variable | Description | Generation |
|----------|-------------|------------|
| `WEBHOOK_SECRET` | Ya no se usa en Vercel: los webhooks de asignación viven en Supabase Edge (migración 029). Se configura como secret de Supabase y en `app.webhook_secret` (ver `docs/MANUAL_OPERACION.md`). | `openssl rand -hex 32` |

### Application URLs
| Variable | Description | Example |
|----------|-------------|---------|
| `VERCEL_API_BASE` | Production Vercel URL | `https://navticket.vercel.app` |
| `APP_URL` | URL pública de la app (deep-links de push) | `https://navtickets.vercel.app` |

### Cuenti ERP Proxy (Optional - for client import feature)
| Variable | Description | Example |
|----------|-------------|---------|
| `CUENTI_API_TOKEN` | Cuenti API Token | `<token de Cuenti>` |
| `CUENTI_EMPRESA_ID` | Cuenti Empresa ID | `<id empresa>` |
| `CUENTI_USER_ID` | Cuenti User ID | `<id usuario>` |
| `CUENTI_COMPANY_ID` | UUID de la empresa NavTickets dueña de las credenciales Cuenti (solo ella y super_admin pueden importar) | `<uuid de companies.id>` |

> Push: **Web Push con claves VAPID** (ver `directivas/directiva_notificaciones_fcm.md`). En Vercel solo va `VITE_VAPID_PUBLIC_KEY`; la clave privada, `VAPID_SUBJECT` y la pública del servidor son **secrets del proyecto Supabase**, nunca variables de Vercel. Quedaron **retiradas** y no deben volver a añadirse: `VITE_FIREBASE_*`, `VITE_VAPID_KEY` (nombre antiguo), `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID` y `ONESIGNAL_API_KEY`. Si alguna sigue en el panel de Vercel, se puede borrar.

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
vercel env add VITE_VAPID_PUBLIC_KEY production
vercel env add CRON_SECRET production
vercel env add WEBHOOK_SECRET production
vercel env add VERCEL_API_BASE production
vercel env add APP_URL production
vercel env add CUENTI_API_TOKEN production
vercel env add CUENTI_EMPRESA_ID production
vercel env add CUENTI_USER_ID production
vercel env add CUENTI_COMPANY_ID production

# NOTA: NO agregues VITE_FIREBASE_*, VITE_VAPID_KEY ni ninguna variable ONESIGNAL_*.
# El push es Web Push con VAPID: aquí solo VITE_VAPID_PUBLIC_KEY; el resto son secrets de Supabase.

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

### 2. Web Push (VAPID) Setup
1. Generate a key pair once: `npx web-push generate-vapid-keys`
2. Public key → `VITE_VAPID_PUBLIC_KEY` in Vercel, then redeploy (it is baked in at build time)
3. In Supabase: `npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<contact>`
4. Both public keys must be the same value, or browsers will reject the pushes

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
# Cuenti: sin token debe responder 401; con token de un rol permitido, 200
curl -i https://your-app.vercel.app/api/cuenti/clients

# Los schedules (task-scheduler, daily-expiration-check) y los webhooks de
# asignación viven en Supabase, no en Vercel (ver docs/MANUAL_OPERACION.md)

# Test Web Push
# Login → enable notifications in the header → a row appears in push_subscriptions
# → create a support ticket and check the super_admin's device receives the push
```
Sin header `Authorization` (o con rol no admin), `cuenti-proxy` responde 401/403.