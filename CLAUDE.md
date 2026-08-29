# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server on port 8080 (host: true)
- `npm run build` — Production build via Vite (output to `dist/`)
- `npm run preview` — Preview the production build locally
- `npm test` — Run all tests with Vitest (single test: `npx vitest run src/utils/warranty.test.ts`)
- `npm run deploy` — Build + deploy to Vercel (production)
- `npm run serve` — Run local Vite dev server (alias for `npm run dev`)
- `vercel --prod` — Deploy the built app to Vercel (alternative to the `npm run deploy` script)

## Architecture Overview

This is a **Field Service Management** (FSM) PWA for industrial equipment maintenance, built with React 18 + TypeScript + Vite + Supabase (Postgres) + OneSignal. It is **offline-first** using IndexedDB via Dexie and Workbox service worker.

### Frontend Structure

- **Routing**: `HashRouter` in `App.tsx` with `React.lazy` code-splitting per route. All routes wrapped in `Suspense` with `<LoadingFallback />`.
- **State Management**: Three React Contexts drive the app:
  - `AuthContext` — Supabase Auth + mapping to the app's `User` model (login via `username@navas.com` email convention)
  - `DataContext` — Central data layer exposing all collections (clients, orders, equipment, users, notifications) + CRUD actions + file uploads
  - `ModalContext` — UI modal state management
- **Styling**: Tailwind CSS v4 (using `@tailwindcss/vite` plugin)
- **PWA**: `vite-plugin-pwa` with inject-manifest strategy. Service worker at `src/sw.ts` handles push notifications and precaching.
- **Maps**: Leaflet via `react-leaflet` for client geo-location display

### Backend — Schedules y Edge Functions

**Single source of schedules = Supabase Edge Functions programadas** (no hay crons en Vercel).
Vercel `api/*` queda solo para endpoints live (webhooks de triggers y proxies), sin stubs muertos.

| Función | Plataforma | Cadencia / Trigger | Propósito |
|---------|-----------|--------------------|-----------|
| `taskScheduler` | Supabase Edge | Cada 5 min (`*/5 * * * *`) | Recordatorios, vencimientos y tareas recurrentes (`supabase/functions/task-scheduler/`) |
| `dailyExpirationCheck` | Supabase Edge | Diaria `0 8 * * *` | Mantenimiento/garantías por vencer + notificaciones y stubs de email/WhatsApp (`supabase/functions/daily-expiration-check/`, movido desde Vercel cron) |
| `supportNotify` | pg_net trigger → Supabase Edge | En INSERT de `support_tickets` (migración 011) | Push OneSignal a super_admin de consulta nueva (`supabase/functions/support-notify/`) |
| `onOrderAssigned` / `onTaskAssigned` | pg_net trigger → Vercel edge | En INSERT/UPDATE de orders/tasks (migración 003) | Notificación interna de asignación (`api/edge/on-*.ts`) |
| `cuentiProxy` | Vercel edge | GET | Proxy de clientes Cuenti ERP (`api/edge/cuenti-proxy.ts`) |
| `sendTestNotification` | Vercel edge | POST (admin/dev) | Push OneSignal de prueba (`api/edge/send-test-notification.ts`) |
| `updateUserPassword` | Vercel edge | POST | Reset/self-service de clave vía Supabase Auth (`api/edge/update-user-password.ts`) |

### Communication Channels (`communicationChannels.js`)

- **WhatsApp**: Twilio (stubs out gracefully if no credentials configured)
- **Email**: Nodemailer via Gmail SMTP with branded HTML templates
- **Internal Notification**: Supabase `notifications` table + OneSignal push

### Data Model (Supabase Tables)

Multi-tenant: every business table is scoped by `company_id`; RLS (helpers `public.current_company_id()` / `public.current_user_role()` / `public.user_can(permiso)`, from migrations 004/005/009) is the real security layer. **`useSupabaseActions.addItem` does NOT inject `companyId` — creates must include it in the payload** or the RLS blocks them (0 rows silently).

- `users` — Technicians, supervisors, admins, developers, super_admin. Login via Supabase Auth (linked by `supabase_auth_id`); `role`, `company_id`, `onesignal_player_id`.
- `clients` — Industrial clients with GPS coordinates for mapping
- `equipment` — Machines per client, with maintenance frequency and status tracking
- `orders` — Service orders with workflow: Pendiente → En Progreso → Cerrado (with warranty tracking)
- `tasks` — Personal tasks with reminders, assignment, file attachments
- `inventory_items` — Spare-parts catalog per company (stock + low-stock threshold). Technician is read-only; admin/developer/super_admin edit stock (migration 014)
- `order_inventory_lines` — M:N order↔part with `quantity_out` and `unit_cost_snapshot` (migration 014; tenant via parent FK)
- `notifications` — System notifications with deep-link paths
- `companies` — Tenants: `name`, `slug`, `theme` (branding), `features`, `tabs`, `auth`. Admin/developer edit only their own company (self-serve, migration 012)
- `support_tickets` — Internal support tickets+chat per company, notified to super_admin (migration 011)

### Multi-tenant visibility (Fase 5) — single source

`src/permissions.ts` is the ONLY place that decides tab visibility: `TAB_PERMISSION_MAP` (permission per built-in tab, incl. `inventory`→`VIEW_INVENTORY`, `reports`→`VIEW_REPORTS`), `TAB_FEATURE_MAP` (feature flag), and `isTabVisible(component, role, features)`. Both navs must use `isTabVisible`, never duplicate it. Feature flags live in `companies.features` (`accounting`, `maps`, `equipmentManagement`). New built-in tabs surface in existing tenants via `default_built_in_tabs()` + the `normalize_company_config` trigger (migrations 015/016).

### Order Workflow

```
Pendiente → En Progreso → Cerrado (with signature, photos, closing data)
                                       ↓
                              Warranty re-open (if warrantyPeriod set)
```

### GPS Tracking

Technician location updates every 10 minutes (`GPS_UPDATE_INTERVAL` in `App.tsx`), written to the user's `latitude`/`longitude` fields.

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useValidatedActions` | `src/hooks/useValidatedActions.ts` | Zod-validated CRUD wrapper over `useSupabaseActions` (`addValidated`/`updateValidated`). Reminder: creates must include `companyId` |
| `useSupabaseQuery` | `src/hooks/useSupabaseQuery.ts` | Reactive Supabase query with offline cache (IndexedDB via Dexie) + Realtime subscriptions |
| `useSupabaseActions` | `src/hooks/useSupabaseActions.ts` | Generic CRUD (addItem, updateItem, deleteItem) via Supabase |
| `useSupabaseStorage` | `src/hooks/useSupabaseStorage.ts` | File uploads with browser-image-compression |
| `useSyncManager` | `src/hooks/useSyncManager.ts` | Offline write queue — drena pendientes al reconectar (máx. 3 reintentos) |
| `useOfflineStatus` | `src/hooks/useOfflineStatus.ts` | Connectivity detection + sync state |
| `useOrderActions` | `src/hooks/useOrderActions.ts` | Complex order operations (close, reopen warranty) |
| `useFileHandler` | `src/hooks/useFileHandler.ts` | Manages evidence files (photos) with online/offline support |
| `useOneSignal` | `src/hooks/useOneSignal.ts` | Push notifications via OneSignal |

### Key Services

| File | Purpose |
|------|---------|
| `src/services/supabase.ts` | Supabase client init (Postgres + Auth + Realtime + Storage) + `authAccessToken()` |
| `src/services/data.ts` | `deleteOrderWithEvidence` — cascading delete of order + storage files |
| `src/config.ts` | `EMAIL_DOMAIN` — dominio de login extraído a env (`VITE_EMAIL_DOMAIN`, fallback `navas.com`) |
| `src/permissions.ts` | RBAC: 6 roles (technician, supervisor, aux_admin, admin, super_admin, developer) with granular permission strings |

### Utility Files

| File | Purpose |
|------|---------|
| `src/utils/warranty.ts` | Warranty calculation utilities |
| `src/utils/productUtils.ts` | Excel import helpers (SheetJS) |
| `src/utils/pdfGenerator.ts` | PDF report generation (jsPDF) |
| `src/utils/csv.ts` | CSV export helpers (UTF-8 BOM for Excel) |
| `src/utils/reportPdf.ts` | Generic table→PDF (jsPDF + jspdf-autotable, dynamic import) |
| `src/utils/imageCompression.ts` | Browser-side image compression |
| `src/utils/gpsCache.ts` | GPS coordinate caching |
| `src/utils/date.ts` | Date formatting helpers |

### Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EMAIL_DOMAIN=navas.com        # Dominio de login (username@dominio). Fallback "navas.com"
VITE_ONESIGNAL_APP_ID=            # App ID de push (frontend). Sin esta, oneSignal.ts no suscribe
VITE_GOOGLE_MAPS_API_KEY=        # For Maps JavaScript API (currently unused — using Leaflet)
```

Push **OneSignal**: `VITE_ONESIGNAL_APP_ID` (cliente) se hornea al buildar (Vercel).
Los secrets `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` (REST API key `os_v2_app_…`,
server-side, para los edges) están seteados a nivel de **proyecto Supabase**
(`npx supabase secrets set …`) — los lee `support-notify`. Para el botón de push de
prueba del panel admin, `send-test-notification` (edge Vercel) también los usa, pero
desde las env vars de **Vercel**, no de Supabase.

Edge Functions (Supabase) leen `EMAIL_DOMAIN` (fallback "navas.com"). `users.password`
(texto plano) fue eliminada en la migración 010 — la autenticación vive 100% en Supabase
Auth (`auth.users`), vinculado por `users.supabase_auth_id`. Cambio/reset de clave va por
la Edge Function `update-user-password` (identifica al usuario por su access_token, nunca
por la anon key).

Functions env (in `functions/.env`):
```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
GMAIL_USER=
GMAIL_APP_PASSWORD=
CUENTI_API_TOKEN=
CUENTI_EMPRESA_ID=
CUENTI_USER_ID=
```

### Tests

Test files live next to their source files (`*.test.ts`). Uses Vitest with `vi.useFakeTimers()` for deterministic date testing. Example:
- `src/utils/warranty.test.ts` — Warranty info computation
- `src/utils/productUtils.test.ts` — Excel parsing helpers

### Known Technical Notes

- The service worker (`src/sw.ts`) handles push notifications via the native `push` event — this works reliably on iOS PWA.
- Push notifications use **OneSignal**; Firebase Cloud Messaging is no longer used. **Flujo completo cableado (Fase 3):** el cliente suscribe con `VITE_ONESIGNAL_APP_ID` y guarda `onesignal_player_id` en `users` (`useOneSignal`→`Header`); el edge `support-notify` (disparado por trigger BD, migración 011) manda el push con `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` seteados como secrets de proyecto Supabase. El push solo alcanza a super_admins **suscritos** por PWA instalada.
- Supabase keeps data offline-friendly via the client cache (IndexedDB/Dexie) driving `useSupabaseQuery`; no pagination is applied on the main collection queries.
- Images are compressed client-side before upload to Supabase Storage.
- **Sync offline idempotente (Fase 3):** los creates offline ya no usan PK `offline_<timestamp>` sino un **UUID estable generado por el cliente** (`crypto.randomUUID()`), que viaja dentro de `data` y se inserta con `upsert(onConflict:'id')`. Así los retries no duplican y los vínculos/evidencia que referencian ese id sobreviven al sync (`useSupabaseActions.ts` + `useSyncManager.ts`).
- **Todos los schedules viven en Supabase Edge Functions** (task-scheduler cada 5 min, daily-expiration-check a las 08:00). Vercel `api/*` no tiene crons ni stubs; solo endpoints vivos (webhooks de triggers y proxies).
- **Fase 6 — Inventario y Reportes:** módulo de inventario (`src/components/inventory/*`: Manager/Form/Detail + `InventorySelectorModal`) y sección "Repuestos" en `OrderWorkflow` (replace-set sobre `order_inventory_lines`); rutas `/inventory*` gated por `VIEW_INVENTORY` (técnico lee, no edita stock). Reportes (`src/components/reports/Reports.tsx`) con export CSV (`csv.ts`) y PDF (`reportPdf.ts`); ruta `/reports` gated por `VIEW_REPORTS`. Tabs `inventory`/`reports` en `DEFAULT_BUILT_IN_TABS` (`src/types/company.ts`).
- **Ramificación (2026-08):** el roadmap (Fases 1–6) está **integrado y mergeado en `main`**; las ramas `feat/fase*` locales fueron borradas. `main` en sintonía con `origin/main`. El deploy de producción va por `npm run deploy`.