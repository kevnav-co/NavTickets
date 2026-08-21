# Tasks: Backend Build Reliability

**Input**: Design documents from `/specs/001-backend-build-reliability/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Tests**: No se piden pruebas unitarias (definido en Assumptions del spec). La validación es por typecheck (`tsc`), `npm run build` y deploy — ver quickstart.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files)
- **[Story]**: US1 (P1), US2 (P2), US3 (P3) de spec.md

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create `api/tsconfig.json` con `{"target":"ESNext","module":"ESNext","moduleResolution":"bundler","types":["node","@vercel/node"],"skipLibCheck":true,"strict":true,"esModuleInterop":true,"noEmit":true}` e `"include":["./**/*.ts"]`. Hace que todas las funciones de `api/` resuelvan `process`, `Request`, `Response`. (FR-001, EC3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No se requiere fase foundational separada**: no hay infraestructura nueva (sin migraciones, sin auth). El setup (T001) es el único bloqueo para todos los user stories. El trabajo por-story ya es accionable tras T001.

---

## Phase 3: User Story 1 — Despliegues sin errores de tipo (Priority: P1) 🎯 MVP

**Goal**: `api/` compila y despliega en Vercel sin `error TS####`, eliminando los defectos P1 de parseo y columnas.
**Independent Test**: `npx tsc -p api/tsconfig.json --noEmit` exit 0 tras T001+T010+T011+T012.

### Implementation for User Story 1

- [X] T002 [P] [US1] Corregir `api/edge/on-task-assigned.ts:3`: `export const config, {` → `export const config = { runtime: 'edge' };`. (FR-002, R4 — es webhook clave de notificaciones)
- [X] T003 [P] [US1] `api/edge/daily-expiration-check.ts:2`: eliminar `import { render } from '@react-email/components'` (sin uso, paquete no instalado). (FR-003, R3)
- [X] T004 [P] [US1] `api/edge/daily-expiration-check.ts:182`: añadir `serial_number` y `location` a la lista de `.select()` de equipos. (FR-004, R2 — cliente creado sin generic)
- [X] T005 [US1] Ejecutar `npx tsc -p api/tsconfig.json --noEmit` y resolver los `error TS####` restantes de `api/edge/*.ts` y `api/**/*.ts` reportados (ver research R1: el tsconfig nuevo debería resolver la mayoría).

**Checkpoint**: US1 listo — V1 (typecheck) exit 0. MVP desplegable.

---

## Phase 4: User Story 2 — Operaciones admin/notificación fiables (Priority: P2)

**Goal**: Webhooks/endpoints de notificación y admin se compilan y ejecutan con datos completos (serie/ubicación en alertas).
**Independent Test**: V4 de quickstart: disparar `on-task-assigned` (POST → 200, no 500 por parseo) y revisar alertas de expiración con "Ubicación"/serie correctos.

### Implementation for User Story 2

- [X] T006 [P] [US2] Verificar `on-task-assigned.ts` compila y que la firma/parámetros de notificación se preservan (regresión del webhook tras T002). (EC4, contrato en contracts/api-functions.md)
- [X] T007 [P] [US2] Verificar `daily-expiration-check.ts` usa correctamente `eq.serial_number` y `eq.location` en las alertas tras T003+T004 (los datos llegan). (SC-002)

**Checkpoint**: US1 y US2 funcionan; webhooks responden 200 con datos completos.

---

## Phase 5: User Story 3 — Confianza del desarrollador (Priority: P3)

**Goal**: Limpieza tipo-level y validación reproducible local.
**Independent Test**: V1 (`tsc --noEmit`) + V2 (`npm run build`) limpios.

### Implementation for User Story 3

- [X] T008 [P] [US3] Eliminar variables/imports sin uso detectados (p.ej. `const appUrl` en `api/edge/send-test-notification.ts:142`). Eliminar si finalmente se aplica `noUnusedLocals` en `api/tsconfig.json` sin ruido. (FR-005, R5)
- [X] T009 [P] [US3] Correr `npm run build` y confirmar frontend + service worker OK (`✓ built`, `code 0`). (FR-006, SC-003)
- [X] T010 [P] [US3] Re-ejecutar V1 y confirmar `tsc` exit 0. (SC-004)

**Checkpoint**: build local limpio + typecheck reproducible.

---

## Phase N: Polish & Cross-Cutting Concerns

- [X] T011 [P] Deploy a Vercel (`npx vercel --prod`) y confirmar en el log de Build que **no** hay bloques `error TS####` para `api/`. (SC-001, V3 de quickstart)
- [X] T012 Regresión de runtime: login `admin@navas.com` + perfil carga (auth + users sin recursión RLS), y webhooks responden como en V4. (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: no dependencies — primary gate.
- **US1 (T002-T005)**: dependen de T001.
- **US2 (T006-T007)**: dependen de T001 (y de la corrección T002/T003/T004).
- **US3 (T008-T010)**: dependen de T001 (limpieza de tipos); T009/T010 independientes de US1/US2.
- **Polish (T011-T012)**: dependen de todos los stories.

### Parallel Opportunities

- T002, T003, T004 marcan [P]: archivos distintos de `api/edge/`, sin dependencias.
- T006/T007 [P]: solo verificación, archivos distintos.
- T008/T009/T010 [P]: distinto propósito (edición vs build vs tsc).

### Within Each User Story

- Corrección de defecto real antes de la validación (T002/T003/T004) y luego typecheck global (T005).
- T009/T010 validan lo hecho en T001-T008 mediante gates objetivos (V1/V2 de quickstart).

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 (Setup) → 2. T002-T004 (P1 fixes) → 3. T005 (typecheck) → **STOP y VALIDATE** con V1 → deploy/demo (elimina los `error TS####` de despliegue, US1).

### Incremental Delivery

1. Setup (T001) → MVP: US1 (T002-T005) → VALIDATE → deploy si listo.
2. US2 (T006-T007) → VALIDATE (webhooks 200 con datos completos).
3. US3 (T008-T010) → VALIDATE (build + tsc limpio).
4. Polish (T011-T012) → deploy final + regresión.

---

## Notes

- [P] tasks = different files, no dependencies.
- No se toca `src/` ni `supabase/types.ts` ni hay migraciones (Assumptions del spec).
- Validación = typecheck + build + deploy (V1-V4 de quickstart.md).
- Tareas verificar que los contracts de contracts/api-functions.md se preservan (EC4).