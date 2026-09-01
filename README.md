# NavTickets — Sistema de Gestión de Mantenimiento Industrial (FSM PWA)

Aplicación profesional de **Field Service Management** para mantenimiento de equipos industriales, multi-tenant, offline-first y desplegada como PWA. React 18 + TypeScript + Vite + Tailwind + **Supabase** (Postgres) + OneSignal.

---

## 🚀 Stack y Estado

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18 + TypeScript + Vite 6 |
| **Estilos** | Tailwind CSS v4 (`@tailwindcss/vite`) |
| **Backend / Base de datos** | **Supabase** (Postgres + Auth + Realtime + Storage) |
| **PWA** | `vite-plugin-pwa` (Workbox, inject-manifest), service worker en `src/sw.ts` |
| **Push** | OneSignal (server-side vía Edge Functions) |
| **Mapas** | Leaflet (`react-leaflet`) |
| **Reportes (PDF)** | jsPDF + jspdf-autotable (import dinámico) |
| **Export (CSV)** | Helper propio con BOM UTF-8 (`src/utils/csv.ts`) |
| **Offline-first** | IndexedDB vía Dexie (`useOfflineCache`) + Workbox |

> **Nota:** El proyecto migró de Firebase a Supabase. No usa Firestore/Auth/Messaging de Firebase; todo vive en Supabase. Los restos de configuración Firebase (`.firebaserc`, `firestore.*`) son residuos, no se usan.

---

## 📱 Instalación en Móviles (PWA)

- **Android (Chrome):** menú (⋮) → *Instalar aplicación*.
- **iOS (Safari):** botón Compartir → *Agregar al inicio*.

---

## 🧠 Multi-tenant y Roles

Cada **empresa** (`companies`) aísla sus datos por `company_id`. La seguridad a nivel de base de datos (RLS) es la fuente de verdad:

- El helper `public.current_company_id()` (SECURITY DEFINER) lee `users.company_id` del usuario autenticado (`supabase_auth_id` → `auth.users`).
- El helper `public.current_user_role()` y `public.user_can(permiso)` (de la migración 009) controlan la escritura por rol **en la DB**, no solo en la UI.

**6 roles:** `technician` · `supervisor` · `aux_admin` · `admin` · `developer` · `super_admin`.

| Rol | Resumen |
|-----|---------|
| `technician` | Ve sus órdenes/tareas, inicia/completa; **lee** inventario (no edita stock) |
| `supervisor` | Ve/asigna todas las órdenes, gestiona clientes/equipos/mapa de técnicos |
| `aux_admin` | Igual que supervisor |
| `admin` | Control total de **SU** empresa (branding self-serve, datos, inventario, informes) |
| `developer` | Igual que admin + utilidades de depuración |
| `super_admin` | Multi-empresa: Panel Admin completo, gestión de empresas/usuarios, soporte |

### Fuente única de visibilidad de pestañas (Fase 5)

Toda la visibilidad de tabs built-in está centralizada en `src/permissions.ts` (`TAB_PERMISSION_MAP`, `TAB_FEATURE_MAP` y `isTabVisible`). Ambos navs (`MobileNavigation` y `DesktopSidebar`) filtran por **permiso del rol** Y **flag de feature de la empresa**. No dupliques esa lógica en componentes.

Flags de feature de empresa (`companies.features`): `accounting`, `maps`, `equipmentManagement` (+ flags de Fase 6 para inventario/reportes).

---

## 📦 Entidades (Supabase / Postgres)

| Entidad | Tabla | Notas |
|---------|-------|-------|
| **Usuario** | `users` | Vinculado a Supabase Auth por `supabase_auth_id`; `role`, `company_id`, `email` (recuperación), `onesignal_player_id` |
| **Cliente** | `clients` | Coordenadas GPS para el mapa |
| **Equipo** | `equipment` | Frecuencia/estado de mantenimiento; pertenece a un `client_id` |
| **Orden de servicio** | `orders` | Workflow Pendiente → En Progreso → Cerrado (+ reapertura por garantía) |
| **Tarea personal** | `tasks` | Recordatorios, asignación, archivos |
| **Repuesto / Inventario** | `inventory_items` | Catálogo por empresa; stock y umbral bajo |
| **Línea de repuestos en orden** | `order_inventory_lines` | M:N orden↔repuesto con cantidad y costo capturado |
| **Notificación** | `notifications` | Internas, con deep-link |
| **Empresa** | `companies` | `name`, `slug`, `theme`, `features`, `tabs`, `auth` |

> Tablas business **no almacenan `company_id` a nivel de línea M:N** (`order_inventory_lines`, `equipment_orders`): el tenant se resuelve por las claves foráneas de la fila padre (clientes/órdenes).

---

## 🔨 Worker flow de Órdenes

```
Pendiente → En Progreso → Cerrado (firmas, fotos, datos de cierre)
                              ↓
              Reapertura por garantía (si warrantyPeriod configurado)
```

Una orden cerrada puede adjuntar **repuestos usados** (`order_inventory_lines`): lista de ítems del inventario con cantidad y costo unitario capturado.

---

## 🧩 Características por Fase (roadmap 1–6, ya integradas en `main`)

| Fase | Qué aportó |
|------|-----------|
| **1 — RLS por rol** | Migración 009: control de escritura por rol en la DB (`user_can`, políticas granulares) |
| **2 — Auth real** | Migración 010: se elimina `users.password` (texto plano); login 100% por Supabase Auth; edge `update-user-password`; campo `must_reset_password` |
| **7 — Recuperación de clave** | Migración 019: `users.email` (correo real de recuperación) + username único global + tabla `password_reset_tokens` (token de un solo uso, 30 min); edges públicos `request-password-reset` / `reset-password-with-token`; links "¿Olvidaste tu clave?" → `/forgot-password` y `/reset-password`. Login = solo usuario (el `@dominio` es interno) |
| **3 — Higiene** | Un solo scheduler (Supabase Edge); sync offline idempotente (UUID cliente + upsert); `support-notify` por trigger de BD; push OneSignal end-to-end |
| **4 — Branding self-serve** | Migración 012: el admin/developer edita solo **su** empresa (theme/tabs/features, nunca identidad) |
| **5 — Features & tabs** | Migración 013: visibilidad de tabs por permiso Y flag; `isTabVisible` como única fuente |
| **6 — Informes + Inventario** | Migraciones 014/015/016: tablas `inventory_items`/`order_inventory_lines`; módulo de reportes (CSV/PDF); tabs nuevos |

---

## 🗄️ Schedules y Edge Functions (Supabase)

| Función | Plataforma | Cadencia / Trigger | Propósito |
|---------|-----------|--------------------|-----------|
| `task-scheduler` | Supabase Edge | Cada 5 min (`*/5 * * * *`) | Recordatorios, vencimientos y tareas recurrentes |
| `daily-expiration-check` | Supabase Edge | Diaria `0 8 * * *` | Mantenimiento/garantías por vencer + notificaciones |
| `support-notify` | Supabase Edge | pg_net trigger (migración 011) | Push OneSignal al super_admin ante consulta nueva |
| `create-company` | Supabase Edge | Llamada | Crear empresa nueva (multi-tenant) |
| `create-user` | Supabase Edge | Llamada | Crea la cuenta Auth + fila `users` vinculada |
| `update-user-password` | Supabase Edge | Llamada | Cambio/reset de clave por `access_token` |
| `request-password-reset` | Supabase Edge | Llamada (público) | Genera token y manda link al `users.email` del username (olvidé mi clave) |
| `reset-password-with-token` | Supabase Edge | Llamada (público) | Valida el token de un solo uso y aplica la nueva clave |

> Los schedules viven **solo en Supabase Edge Functions**. Vercel `api/*` queda únicamente para endpoints live (webhooks de triggers y proxies), sin crons ni stubs.

---

## 📡 Canales de Comunicación

- **WhatsApp:** Twilio (stubs out si no hay credenciales).
- **Email:** Nodemailer vía Gmail SMTP con plantillas HTML.
- **Push:** Supabase `notifications` + **OneSignal** (solo a usuarios suscritos por PWA instalada).

---

## 🔐 Variables de Entorno

```env
# Cliente (se hornea al buildar, p. ej. en Vercel)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EMAIL_DOMAIN=navas.com        # Dominio de login (username@dominio); fallback "navas.com"
VITE_ONESIGNAL_APP_ID=             # Push (front). Sin esto, oneSignal.ts no suscribe
VITE_GOOGLE_MAPS_API_KEY=          # No usado actualmente (se usa Leaflet)

# Funciones Supabase (secretos a nivel de proyecto, `npx supabase secrets set`)
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=                 # REST key os_v2_app_…
EMAIL_DOMAIN=                      # fallback navas.com

# En `supabase/functions/.env` (ediciones locales)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
GMAIL_USER=
GMAIL_APP_PASSWORD=
CUENTI_API_TOKEN=
CUENTI_EMPRESA_ID=
CUENTI_USER_ID=
```

---

## 🧱 Arquitectura Frontend

### Rutas (HashRouter + `React.lazy` por ruta)

| Ruta | Componente |
|------|-----------|
| `/` | Dashboard |
| `/tasks` · `/orders` · `/orders/new` · `/orders/:id` | Tareas y órdenes |
| `/clients` · `/clients/new` · `/clients/:id` · `/clients/:id/edit` | Clientes |
| `/equipment` · `/equipment/new` · `/equipment/:id` · `/equipment/:id/edit` | Equipos |
| `/inventory` · `/inventory/new` · `/inventory/:id` · `/inventory/:id/edit` | Inventario (gated `VIEW_INVENTORY`) |
| `/reports` | Informes/Export (gated `VIEW_REPORTS`) |
| `/accounting` | Módulo contable (flag de feature) |
| `/map` | Mapa de clientes (Leaflet) |
| `/users` · `/users/new` · `/users/:id` · `/users/:id/edit` | Usuarios |
| `/admin` · `/admin/stats` · `/admin/support` | Panel Admin (super_admin; /admin role-aware para admin/dev) |

### Contextos

- **`AuthContext`** — Supabase Auth + mapeo al modelo `User` (login `username@EMAIL_DOMAIN`).
- **`DataContext`** — capa de datos única: expone las colecciones + acciones CRUD + subidas.
- **`ModalContext`** — estado de modales globales.

### Hooks clave

| Hook | Propósito |
|------|-----------|
| `useValidatedActions` | CRUD con validación Zod (`addValidated`/`updateValidated`) + `useSupabaseActions` |
| `useSupabaseQuery` | Query reactiva con caché offline (Dexie) + Realtime |
| `useSyncManager` | Cola de escritura offline, drena al reconectar (máx. 3 reintentos) |
| `useOfflineStatus` / `useOrderActions` / `useFileHandler` / `useOneSignal` | Conectividad, operaciones complejas, evidencia, push |

> **Regla de creates (crítica para RLS):** `useSupabaseActions.addItem` **no inyecta `companyId`**. La RLS exige `company_id = current_company_id()` en el INSERT, así que **todo create de tabla business debe incluir `companyId` en el payload** y validar contra `Schema.omit({ id: true })` (no contra `omit({ id, companyId })`, que lo descartaría). Ver `ClientForm`, `EquipmentForm`, `InventoryForm`.

---

## 🧪 Tests

Vitest; los `*.test.ts` viven junto a su fuente. Ejemplos: `warranty.test.ts`, `productUtils.test.ts`, `csv.test.ts`, `permissions.test.ts`, `schemas/inventory.schema.test.ts`.

```bash
npm test                    # toda la suite
npx vitest run src/utils/warranty.test.ts   # un archivo
```

---

## 🛠️ Comandos

```bash
npm run dev       # Vite dev en :8080 (host: true)
npm run build     # Build de producción a dist/
npm run preview   # Previsualizar el build
npm test          # Suíte de tests
npm run deploy    # Build + deploy a Vercel (producción)
npm run serve     # Alias de npm run dev
vercel --prod     # Deploy alternativo
```

---

## 📚 Documentación adicional

- `CLAUDE.md` — pautas del proyecto para Claude Code (arquitectura, datos, env).
- `DEPLOYMENT_GUIDE.md` — guía de despliegue (edges, secrets, RLS).
- `VERCEL_ENV_SETUP.md` — env vars de Vercel.
- `directivas/` — business rules (órdenes, tareas, evidencia, permisos, offline).
- Memory del desarrollador: Vault Obsidian (`SecondBrain/`, dentro de `OneDrive\Documentos`).

---

## 🏷️ Versión

- **Actual:** 1.0.0 — roadmap 1–6 integrado en `main` (2026-08).