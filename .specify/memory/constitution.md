<!-- Sync Impact Report
Version change: (initial draft) → 1.0.0
Modified principles: n/a (initial ratification)
Added sections: Core Principles (I–VI), Platform & Constraints, Development Workflow & Quality Gates, Governance
Removed sections: n/a
Deferred TODOs: RATIFICATION_DATE confirmed as 2026-08-19 (date repo governance adopted); no other placeholders left unresolved.
-->
# NavTicket Constitution

## Core Principles

### I. Offline-First (NON-NEGOTIABLE)

NavTicket must keep working without connectivity. Every user action that persists data MUST write to the local IndexedDB cache (Dexie) first and enqueue for sync; reads MUST serve from the offline cache before hitting the network. When the connection returns, the `useSyncManager` write queue MUST drain pending operations (max 3 retries) and reconcile with Supabase. No feature MAY block on the network when an offline path is available.

### II. Tests for Business Logic

All pure business logic MUST ship with unit tests using Vitest, colocated as `*.test.ts`. Mandatory coverage at minimum for: warranty computation (`src/utils/warranty.ts`), date/expiry helpers (`src/utils/date.ts`), and Excel import parsing (`src/utils/productUtils.ts`). Red-Green-Refactor is preferred: write the failing test, get user sign-off, then implement. No regression MAY land without a test for the affected calculation.

### III. Type Safety (Strict TypeScript)

Production code MUST be typed and compile cleanly. Typed Supabase row models MUST be used for all table access; `any` is forbidden in app source. API route module and row field mismatches (e.g. `process`, missing columns like `serial_number`/`location`) MUST be fixed at the type level — a type-only error that blocks `tsc` in `api/` is a defect, not a convenience. Unknown response shapes MUST be validated before use.

### IV. Security & Secrets

Credentials MUST never be committed. Environment keys (Supabase, OneSignal, Cuenti) live only in gitignored env files; service-role and admin keys NEVER appear in the client bundle (only `VITE_`-prefixed anon keys). Supabase RLS MUST be enabled and MUST NOT recurse — any policy that queries `users` MUST route through the `current_company_id()` SECURITY DEFINER helper (see `004_fix_rls_recursion.sql`). Passwords MUST NOT be stored in plaintext columns; auth belongs to Supabase Auth with `supabase_auth_id` linkage.

### V. Observability & Correct Data

State changes MUST be tracked: every mutable table MUST have an `updated_at` trigger, and technician geolocation MUST ping at the app GPS interval. Notification delivery (OneSignal) and scheduled checks (task-scheduler, expiration check) MUST be idempotent and resist duplicates across the 5-minute Supabase scheduler and any Vercel cron overlap.

### VI. Simplicity & YAGNI

Build the smallest solution that satisfies the spec. Do not introduce libraries, abstractions, or schema fields before a real need exists. Matches, lists, and charts stay within the existing stack (Leaflet, Recharts, TanStack Query, Dexie) rather than adding new frameworks.

## Platform & Constraints

- **Frontend**: React 18 + TypeScript + Vite. Routing via `HashRouter` with `React.lazy` code-splitting.
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage) and Vercel Serverless functions (`api/`).
- **PWA**: `vite-plugin-pwa` + Workbox; service worker `src/sw.ts` precaches the app and handles OneSignal pushes (native `push` event, reliable on iOS).
- **Maps**: Leaflet via `react-leaflet` for client geo-location.
- **RBAC**: 6 roles (technician, supervisor, aux_admin, admin, super_admin, developer) enforced by `src/permissions.ts`; the UI and every data path MUST honor permission granularity.
- **Data model**: `users`, `companies`, `clients`, `equipment`, `equipment_orders`, `orders`, `tasks`, `task_participants`, `notifications`.
- **Order workflow**: Pendiente → En Progreso → Cerrado (signature + photos + closing data) → warranty re-open when `warrantyPeriod` is set.

## Development Workflow & Quality Gates

- Commands follow `CLAUDE.md` (`npm run dev`, `npm test`, `npm run build`, `npm run deploy`).
- Supabase migrations MUST be applied in order, including `004_fix_rls_recursion.sql`; the live DB MUST match the migration set.
- The production build (`npm run build`) MUST succeed (Vite + `tsc`) before any deploy to Vercel.
- After a deploy, verify with a real login (Supabase Auth) and a hard refresh so the service worker cache does not serve a stale/broken app.
- Every change that touches behavior, schema, or types MUST be reviewed for RLS, offline-sync, and PWA-registration impact before merging.

## Governance

This constitution supersedes any ad-hoc practice not written here. Amendments REQUIRE documentation of the change, explicit approval, and a semantic-version bump: MAJOR for removed/redefined principles, MINOR for added or materially expanded guidance, PATCH for clarifications and wording. Each amended section records its changes in the Sync Impact Report. Compliance is reviewed at every plan/implement cycle: reject scope that violates a non-negotiable principle unless the amendment is ratified first.

**Version**: 1.0.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-19