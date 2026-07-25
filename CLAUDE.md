# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server on port 8080 (host: true)
- `npm run build` — Production build via Vite (output to `dist/`)
- `npm run preview` — Preview the production build locally
- `npm test` — Run all tests with Vitest (single test: `npx vitest run src/utils/warranty.test.ts`)
- `npm run deploy` — Build + `firebase deploy --only hosting`
- `cd functions && npm run serve` — Run Firebase Cloud Functions emulator
- `cd functions && npm run deploy` — Deploy only functions
- `firebase deploy` — Deploy everything (hosting + functions)

## Architecture Overview

This is a **Field Service Management** (FSM) PWA for industrial equipment maintenance, built with React 18 + TypeScript + Vite + Firebase. It is **offline-first** using Firestore persistent local cache + Workbox service worker.

### Frontend Structure

- **Routing**: `HashRouter` in `App.tsx` with `React.lazy` code-splitting per route. All routes wrapped in `Suspense` with `<LoadingFallback />`.
- **State Management**: Three React Contexts drive the app:
  - `AuthContext` — Firebase Auth + mapping to the app's `User` model (login via `username@navas.com` email convention)
  - `DataContext` — Central data layer exposing all collections (clients, orders, equipment, users, notifications) + CRUD actions + file uploads
  - `ModalContext` — UI modal state management
- **Styling**: Tailwind CSS v4 (using `@tailwindcss/vite` plugin)
- **PWA**: `vite-plugin-pwa` with inject-manifest strategy. Service worker at `src/sw.ts` handles push notifications and precaching.
- **Maps**: Leaflet via `react-leaflet` for client geo-location display

### Backend (Cloud Functions in `functions/`)

Node.js 20, `firebase-functions/v2`, `firebase-admin`:

| Function | Trigger | Purpose |
|----------|---------|---------|
| `api` | `onRequest` (Express) | Proxy to Cuenti ERP for client data + test push endpoint |
| `onorderassigned` | Firestore `onDocumentWritten("orders/{id}")` | Notifies technician on order assignment/change |
| `ontaskassigned` | Firestore `onDocumentWritten("tasks/{id}")` | Notifies user on task assignment/change |
| `taskScheduler` | `onSchedule` (cron) | Sends task reminders and due-date alerts (runs every 5 min) |
| `dailyExpirationCheck` | `onSchedule` (cron, 8:00 AM daily) | Checks warranty/maintenance expirations, sends email/WhatsApp/notification |
| `triggerExpirationCheck` | `onCall` | Manual trigger for expiration check |
| `updateUserPassword` | `onCall` | Admin-only password update via Firebase Auth Admin SDK |
| `sendTestNotification` | `onCall` | Developer/admin sends test push to a specific user |

### Communication Channels (`communicationChannels.js`)

- **WhatsApp**: Twilio (stubs out gracefully if no credentials configured)
- **Email**: Nodemailer via Gmail SMTP with branded HTML templates
- **Internal Notification**: Firestore `notifications` collection + FCM push

### Data Model (Firestore Collections)

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
| `useDataFetching` | `src/hooks/useDataFetching.ts` | Centralized Firestore collection subscriptions with reactive state |
| `useFirestoreActions` | `src/hooks/useFirestoreActions.ts` | Generic CRUD (addItem, updateItem, deleteItem) |
| `useStorage` | `src/hooks/useStorage.ts` | File uploads with browser-image-compression |
| `useOfflineStatus` | `src/hooks/useOfflineStatus.ts` | Connectivity detection + sync state |
| `useOrderActions` | `src/hooks/useOrderActions.ts` | Complex order operations (close, reopen warranty) |
| `useCollection` | `src/hooks/useCollection.ts` | Reactive Firestore collection subscription hook |
| `useFileHandler` | `src/hooks/useFileHandler.ts` | Manages evidence files (photos) with online/offline support |

### Key Services

| File | Purpose |
|------|---------|
| `src/services/firebase.ts` | Firebase init with persistent local cache + lazy FCM messaging singleton |
| `src/services/authService.ts` | Auth helpers |
| `src/services/userService.ts` | `getUserDataById` — fetches app user from Firestore by UID |
| `src/services/data.ts` | `deleteOrderWithEvidence` — cascading delete of order + storage files |
| `src/permissions.ts` | RBAC: 5 roles (technician, supervisor, aux_admin, admin, developer) with granular permission strings |

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
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_GOOGLE_MAPS_API_KEY=        # For Maps JavaScript API (currently unused — using Leaflet)
VITE_VAPID_KEY=                   # For Firebase Cloud Messaging push notifications
```

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

- Firebase Messaging uses a **lazy singleton** (`getMessagingInstance`) to avoid iOS Safari crashes at module load time — always use this instead of direct `getMessaging()` calls.
- The service worker (`src/sw.ts`) handles push notifications via the native `push` event, NOT Firebase's `onBackgroundMessage` — the latter doesn't fire reliably on iOS PWA.
- VAPID key is hardcoded in `App.tsx:45`.
- Firestore uses `persistentLocalCache({})` for offline support — no pagination on collection queries.
- Images are compressed client-side before upload to Firebase Storage.