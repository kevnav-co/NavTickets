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

### Backend (Vercel Serverless Functions)

Node.js 20, Vercel Serverless Functions (`api/` directory) using Supabase client for data access.

| Function | Path | Purpose |
|----------|------|---------|
| `api` | `/api/*` | Proxy to Cuenti ERP for client data and test push endpoint |
| `taskScheduler` | (Supabase Edge Function, schedule `*/5 * * * *`) | Sends task reminders and due‑date alerts every 5 min. Lives in `supabase/functions/task-scheduler/` (migrated off Vercel Cron — Vercel Hobby only allows 1 cron/day) |
| `dailyExpirationCheck` | (cron via Vercel scheduler, daily `0 8 * * *`) | Checks warranty/maintenance expirations, sends email/WhatsApp/notification (within Vercel Hobby limits, stays on Vercel for now) |
| `triggerExpirationCheck` | `/api/triggerExpirationCheck` (POST) | Manual trigger for expiration check |
| `updateUserPassword` | `/api/updateUserPassword` (POST) | Admin‑only password update via Supabase Auth |
| `sendTestNotification` | `/api/sendTestNotification` (POST) | Developer/admin sends test push (OneSignal) |

### Communication Channels (`communicationChannels.js`)

- **WhatsApp**: Twilio (stubs out gracefully if no credentials configured)
- **Email**: Nodemailer via Gmail SMTP with branded HTML templates
- **Internal Notification**: Supabase `notifications` table + OneSignal push

### Data Model (Supabase Collections)

- `users` — Technicians, supervisors, admins, developers. Role-based access control via `src/permissions.ts`.
- `clients` — Industrial clients with GPS coordinates for mapping
- `equipment` — Machines per client, with maintenance frequency and status tracking
- `orders` — Service orders with workflow: Pendiente → En Progreso → Cerrado (with warranty tracking)
- `tasks` — Personal tasks with reminders, assignment, file attachments
- `notifications` — System notifications with deep-link paths

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
| `src/utils/imageCompression.ts` | Browser-side image compression |
| `src/utils/gpsCache.ts` | GPS coordinate caching |
| `src/utils/date.ts` | Date formatting helpers |

### Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EMAIL_DOMAIN=navas.com        # Dominio de login (username@dominio). Fallback "navas.com"
ONESIGNAL_APP_ID=
VITE_GOOGLE_MAPS_API_KEY=        # For Maps JavaScript API (currently unused — using Leaflet)
```

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
- Push notifications use **OneSignal**; Firebase Cloud Messaging is no longer used.
- Supabase keeps data offline-friendly via the client cache (IndexedDB/Dexie) driving `useSupabaseQuery`; no pagination is applied on the main collection queries.
- Images are compressed client-side before upload to Supabase Storage.