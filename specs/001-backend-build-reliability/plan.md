# Implementation Plan: Backend Build Reliability

**Branch**: `001-backend-build-reliability` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-backend-build-reliability/spec.md`

**Note**: Design artifacts generados por `/speckit-plan` (research, data-model, contracts, quickstart).

## Summary

Hacer que el backend serverless (`api/`) compile y despliegue **sin errores de tipo**, cumpliendo el principio III (Type Safety) de la constitución. El trabajo es: dar a `api/` su propio `tsconfig.json` con tipos Node/Vercel (resuelve los ~20 errores `process`), y corregir defectos reales concretos: `export const config` inválido en `on-task-assigned.ts`, import `@react-email/components` sin usar y `.select()` incompleto en `daily-expiration-check.ts`, y variables sin uso (p.ej. `appUrl`). Sin cambios de esquema ni de comportamiento en runtime.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (local), runtime Node 20 (Vercel)

**Primary Dependencies**: `@types/node` (ya presente), `@vercel/node` (ya presente), `@supabase/supabase-js`

**Storage**: Supabase (Postgres). Tipos generados en `supabase/types.ts` (ya correctos para `equipment`)

**Testing**: Validación por typecheck (`tsc -p api/tsconfig.json --noEmit`) + build + logs de deploy. (Vitest cubre el frontend, no las funciones.)

**Target Platform**: Vercel Serverless + Edge Functions (Node 20)

**Project Type**: PWA (frontend React/Vite) + serverless functions

**Performance Goals**: n/a — cambio de salud de compilación, no de rendimiento

**Constraints**: sin cambio de comportamiento en runtime; tocar solo `api/` y config; no romper el contrato de los webhooks/endpoints

**Scale/Scope**: 11 archivos en `api/`, 1 archivo nuevo de config, 0 migraciones

## Constitution Check

*GATE: Debe pasar antes de Phase 0 research; re-check tras design.*

- **Principio III — Type Safety**: este cambio hace cumplir la constitución: `tsc` limpio en `api/`, sin `any` a la fuerza, sin errores de tipos que enmascaren columnas reales. **PASS**.
- **Principio II — Tests**: sin lógica pura nueva que testear; la validación es por typecheck/build (V1–V3 en quickstart). **PASS** (sin lógica adicional).
- **Principio IV — Seguridad**: no se tocan credenciales ni RLS; solo se elimina código muerto. **PASS**.
- **Principio I / V / VI**: sin impacto. **PASS**.

Re-check tras diseño: PASS (ningún cambio de esquema, de RLS ni de runtime).

## Project Structure

### Documentación (este feature)

```text
specs/001-backend-build-reliability/
├── spec.md              # Especificación (/speckit-specify)
├── plan.md              # Este plan (/speckit-plan)
├── research.md          # Phase 0 — decisiones técnicas (/speckit-plan)
├── data-model.md        # Phase 1 — modelos (sin cambio de esquema)
├── quickstart.md        # Phase 1 — guía de validación
├── contracts/
│   └── api-functions.md # Phase 1 — contrato de las funciones
└── tasks.md             # Phase 2 (/speckit-tasks — aún no creado)
```

### Código (raíz del repo)

```text
api/
├── tsconfig.json                  # NUEVO — tipos node + @vercel/node, includes ./**/*.ts
├── edge/
│   ├── daily-expiration-check.ts  # quitar import react-email; añadir serial_number,location al .select()
│   ├── on-task-assigned.ts        # corregir `export const config = {`
│   ├── on-order-assigned.ts       # (types via tsconfig)
│   ├── send-test-notification.ts  # eliminar `appUrl` sin uso (y otros unused)
│   ├── update-user-password.ts    # (types via tsconfig)
│   └── cuenti-proxy.ts            # (types via tsconfig)
├── cron/
│   ├── expiration-check.ts        # (types via tsconfig)
│   └── task-reminders.ts          # (types via tsconfig)
├── cuenti.ts                      # (types via tsconfig)
├── send-push.ts                   # (types via tsconfig)
└── update-password.ts             # (types via tsconfig)

supabase/types.ts                  # NO se modifica (equipment ya es correcto)
package.json                       # sin cambios de dependencias (ya las tiene)
```

**Structure Decision**: Sin nueva arquitectura. Un `api/tsconfig.json` único cubre todas las funciones; ediciones puntuales y mínimas en los archivos con defectos reales. No se toca `src/` (fuera de alcance del spec).

## Complexity Tracking

Sin violaciones a la constitución → tabla vacía.

## Artefactos generados

- `research.md` — decisiones R1–R5 (cause de `process`, `serial_number/location`, react-email, parseo on-task-assigned, unused vars).
- `data-model.md` — sin cambios de esquema; ajuste de `.select()`.
- `contracts/api-functions.md` — contrato de las funciones a preservar.
- `quickstart.md` — validaciones V1–V4 y criterios SC.

**Siguiente paso**: `/speckit-tasks` para generar las tareas accionables.