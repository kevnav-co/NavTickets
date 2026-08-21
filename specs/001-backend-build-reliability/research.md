# Research — Backend Build Reliability

Propósito: resolver todas las incógnitas técnicas del spec antes de diseñar.

## R1. ¿Por qué Vercel reporta `Cannot find name 'process'` si `@types/node` está instalado?

- **Diagnóstico**: `@types/node` **sí** está como devDependency. El problema es que el `tsconfig.json` raíz incluye **solo `src`** (frontend, `lib: ["ESNext","DOM",...]`), y `api/` no queda bajo ninguna configuración que cargue los tipos de Node. Vercel typecheckea cada función de `api/` con una config por defecto que no resuelve `process`.
- **Decisión**: Crear `api/tsconfig.json` dedicado a las funciones serverless con `"types": ["node", "@vercel/node"]` e incluir `./**/*.ts`. Así tanto el `tsc` local como el chequeo de Vercel resuelven `process`, `Request`, `Response`.
- **Racional**: config por carpeta que cubre el dominio Node/serverless, sin contaminar el tsconfig del frontend (`noUnusedLocals`/`jsx` de React no aplican a `api/`).
- **Alternativas consideradas**: añadir `@types/node` al tsconfig raíz (contaminaría la compilación del frontend con DOM+Node mezclados y no cubre correctamente las funciones edge); añadir `types` al `tsconfig.json` raíz (aplica a `src`, inútil para `api`).

## R2. ¿Por qué falla `Property 'serial_number'/'location' does not exist` si `supabase/types.ts` ya los define?

- **Diagnóstico**: `api/edge/daily-expiration-check.ts` crea su cliente `createClient(url, key)` **sin** el generic `createClient<Database>` (importa los tipos del frontend `supabase/types`). Además su `.select('id, name, brand, last_maintenance_date, ...')` **no pide** `serial_number` ni `location`. Supabase-js infiere un tipo inline a partir de la lista de columnas seleccionadas; al no pedirlas, las omite → acceso a `eq.serial_number`/`eq.location` falla.
- **Decisión**: Añadir `serial_number` y `location` a la lista de `.select()` (línea 182). La base de datos **sí** tiene esas columnas (`001_schema.sql` líneas 118-119). No tocar `supabase/types.ts` (ya está correcto).
- **Alternativa desestimada**: castear `eq as any` — oculta el error en runtime y viola el principio III de la constitución.

## R3. ¿Por qué falla el módulo `@react-email/components` y `TS6133`?

- **Diagnóstico**: `daily-expiration-check.ts` importa `import { render } from '@react-email/components'` (línea 2) pero **nunca llama a `render(`** (los correos usan HTML inline). El paquete no está instalado → `TS2307 Cannot find module`. Por no usarse → `TS6133 'render' declared but never read`.
- **Decisión**: Eliminar el import. No instalar el paquete (no se necesita).
- **Alternativa desestimada**: instalar `@react-email/components` — añade peso y no se usa.

## R4. Error de parseo en `api/edge/on-task-assigned.ts`

- **Diagnóstico**: línea 3 `export const config, {` — sintaxis inválida (`TS2451`, `TS7031`, `TS1003`, `TS1005`). Debe ser `export const config = {`.
- **Decisión**: Corregir a `export const config = { runtime: 'edge' };`.
- **Nota**: es un defecto real (el modulo nunca compilaba). Es un webhook clave de notificaciones de tarea.

## R5. Variables declaradas y sin usar (si `api/tsconfig` activa `noUnusedLocals`)

- **Diagnóstico**: `send-test-notification.ts:142` `const appUrl` no se usa; `daily-expiration-check.ts` `html`/`render`. Con strict + noUnusedLocals, estos rompen.
- **Decisión**: limpiar las variables sin uso que reporte el build; habilitar `noUnusedLocals`/`noUnusedParameters` en `api/tsconfig.json` solo si no introduce ruido (se decide en implementación; meta: build limpio).

## Dependencias confirmadas (ya presentes)

| Dependencia | Estado |
|-------------|--------|
| `@types/node` | ✔ present (devDependency) |
| `@vercel/node` | ✔ present (devDependency) |
| `typescript` 5.9.3 | ✔ present |