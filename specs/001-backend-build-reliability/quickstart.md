# Quickstart / Validación — Backend Build Reliability

Guía de validación end-to-end. No es implementación; valida que el fix de tipos funciona.

## Prerrequisitos

- Node 20+ y dependencias instaladas: `npm install` (`@types/node` y `@vercel/node` ya en devDependencies).
- `api/tsconfig.json` creado (parte de la implementación).

## Validaciones

### V1. Typecheck local de `api/` (sin errores)

```bash
npx tsc -p api/tsconfig.json --noEmit
```

**Esperado**: exit 0, sin `error TS####`. Antes del fix falla con docenas de `TS2580 process`, `TS2307 react-email`, `TS2451/TS1003/TS1005 on-task-assigned`, `TS2339 serial_number/location`.

### V2. Build de producción completo

```bash
npm run build
```

**Esperado**: `✓ built` (frontend) + service worker OK, `code 0`. El build de Vite no llega a `tsc` de api; el gate real de api es V1 + V3.

### V3. Deploy a Vercel sin errores de tipo en logs

```bash
npx vercel --prod
```

**Esperado**: en la salida del paso "Build" **no** aparecen bloques `error TS####` para ninguna función de `api/`. Estado final `READY`.

### V4. Regresión de runtime (nada se rompió)

- `login admin@navas.com / <pw>` → perfil carga (Auth + users sin RLS recursión).
- Disparar el webhook `on-task-assigned` (POST) → responde 200 y procesa notificación; no 500 por parseo.
- Chequeo `daily-expiration-check` con un equipo con `serial_number`/`location` → alerta incluye "Ubicación" y serie (no `N/A` por columnas no seleccionadas).

## Criterios de éxito medibles

- V1 exit 0 y V3 sin `error TS` → SC-001/SC-004 cumplidos.
- V4 sin fallos → SC-002 cumplido (operaciones admin/notificaciones con datos correctos).
- V2 limpio → SC-003 cumplido (dev build limpio local).

Refs: [contracts/api-functions.md](contracts/api-functions.md), [data-model.md](data-model.md).