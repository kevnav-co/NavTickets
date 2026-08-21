# Feature Specification: Backend Build Reliability

**Branch**: `001-backend-build-reliability` | **Created**: 2026-08-19

## User Stories

### US1 (P1) — Despliegues sin errores de tipo
Como desarrollador, quiero que `api/` compile y se despliegue en Vercel **sin `error TS####`** en el log, para que ningún defecto de tipos enmascarado bloquee o arriesgue un release.

### US2 (P2) — Operaciones admin/notificación fiables
Como supervisor/desarrollador, quiero que los webhooks y endpoints de notificación y de administración (asignación de tareas, expiración, push de prueba, cambio de contraseña) se compilen y ejecuten con los datos correctos (p.ej. `serial_number`/`location` de los equipos), para que las alertas lleven la info completa.

### US3 (P3) — Confianza del desarrollador
Como desarrollador, quiero un `tsc` local limpio sobre `api/` para iterar con confianza sin que "ya me avisarán en producción".

## Edge Cases

- EC1: funciones con variables/un imports declarados pero sin uso (no deben bloquear ni dejarse muertos).
- EC2: funciones que crean cliente Supabase sin generic y seleccionan columnas parciales (deben tipar bien o pelear con casteos feos).
- EC3: el tsconfig de `api/` no debe contaminar el del frontend (`src/`) ni viceversa.
- EC4: el cambio no debe alterar el contrato runtime de ningún endpoint (mismas firmas, mismas respuestas).

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | `api/` tiene un `tsconfig.json` propio que declara `types: ["node", "@vercel/node"]` y cubre `./**/*.ts`. | P1 |
| FR-002 | `api/edge/on-task-assigned.ts`: `export const config = { runtime: 'edge' };` válido. | P1 |
| FR-003 | `api/edge/daily-expiration-check.ts`: elimina el import `@react-email/components` sin usar. | P1 |
| FR-004 | `api/edge/daily-expiration-check.ts`: el `.select()` de equipos incluye `serial_number` y `location`. | P1 |
| FR-005 | Se eliminan las variables sin uso (`appUrl`, etc.) que reporte el typecheck. | P2 |
| FR-006 | `tsc -p api/tsconfig.json --noEmit` devuelve exit 0 y `npm run build` termina limpio. | P1 |

## Key Entities

- `equipment` (Supabase Postgres): columnas `serial_number`, `location` ya existen en esquema (001_schema.sql L118-119) y en `supabase/types.ts`. Sin cambios.
- Funciones en `api/` (Node 20 / edge): 12 archivos, sin cambios de firma.

## Success Criteria

| ID | Criterion | US |
|----|-----------|----|
| SC-001 | No aparece ningún `error TS####` para funciones de `api/` en el log del build/despliegue de Vercel. | US1 |
| SC-002 | Los webhooks/endpoints siguen respondiendo correctamente con datos completos (serie/ubicación en alertas). | US2 |
| SC-003 | `npm run build` local termina limpio. | US1/US3 |
| SC-004 | `npx tsc -p api/tsconfig.json --noEmit` termina con exit 0 localmente. | US3 |

## Assumptions

- No se requieren migraciones de esquema ni cambios de RLS.
- No se toca `src/` (frontend).
- Los packages `@types/node` y `@vercel/node` ya están como devDependencies.
- La validación de runtime se hace por typecheck + build + deploy (no por pruebas unitarias de las funciones).