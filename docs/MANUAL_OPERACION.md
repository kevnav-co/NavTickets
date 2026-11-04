# Manual de operación — NavTickets

Este manual describe cómo desplegar, operar y verificar la seguridad de NavTickets en producción.
No contiene valores de secretos: solo sus nombres y dónde se configuran.

## 1. Componentes

| Componente | Dónde vive | Responsabilidad |
|---|---|---|
| Frontend (PWA React) | Vercel | Interfaz, cola offline (IndexedDB) y sincronización |
| Endpoints `api/edge/*` | Vercel | Webhooks de asignación, proxy Cuenti, push de prueba |
| Base de datos Postgres | Supabase (`vhcvcbpfeiivwepdtkvu`) | Datos multiempresa protegidos con RLS |
| Edge Functions | Supabase | Tareas programadas, soporte, alta de usuarios y empresas, claves |
| Storage | Supabase | Fotos de evidencia, firmas, logos |
| Push | OneSignal | Notificaciones a dispositivos suscritos |

La seguridad real está en la base de datos (RLS y triggers). La interfaz solo oculta opciones;
nunca debe considerarse una barrera de seguridad.

## 2. Inventario de secretos

| Nombre | Dónde se configura | Uso | Debe coincidir con |
|---|---|---|---|
| `WEBHOOK_SECRET` | Vercel (env) y Supabase (`supabase secrets`) | Autentica los webhooks de asignación y `support-notify` | `app.webhook_secret` de la base de datos |
| `app.webhook_secret` | Base de datos (`ALTER DATABASE … SET`) | Lo envían los triggers 003/011 | `WEBHOOK_SECRET` |
| `CRON_SECRET` | Supabase (`supabase secrets`) y Vault (`cron_secret`) | Autentica `task-scheduler` y `daily-expiration-check` | Valor guardado en Vault |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (env); automático en Edge Functions | Acceso administrativo desde el servidor | Supabase → Settings → API |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` | Vercel (env) y Supabase (`supabase secrets`) | Envío de push | Panel de OneSignal |
| `CUENTI_API_TOKEN`, `CUENTI_EMPRESA_ID`, `CUENTI_USER_ID` | Vercel (env) | Proxy al ERP Cuenti | Cuenta Cuenti de la empresa |
| `CUENTI_COMPANY_ID` | Vercel (env) | Limita el proxy Cuenti a la empresa dueña | `companies.id` de esa empresa |

Reglas:
- Los secretos se generan con un generador criptográfico (`openssl rand -hex 32`) y se guardan en el gestor de contraseñas.
- Nunca se escriben en el repositorio, en tickets ni en chats. GitGuardian revisa cada PR.
- Las variables `VITE_*` se incrustan en el navegador: nunca deben contener secretos.

## 3. Despliegue de una versión

Orden obligatorio (lo compatible con la versión anterior va primero):

0. Desde la carpeta del repositorio, enlazar la CLI al proyecto de producción y comprobarlo:
   `npx supabase link --project-ref vhcvcbpfeiivwepdtkvu` y `npx supabase projects list`
   (el proyecto enlazado debe ser `vhcvcbpfeiivwepdtkvu`). La carpeta `supabase/.temp/` es local
   y no se versiona: nunca se debe confiar en un enlace heredado.
1. Respaldo de la base de datos (Supabase → Database → Backups, o `npx supabase db dump`).
2. Variables y secretos nuevos en Vercel y Supabase (no afectan producción hasta el despliegue).
3. Migraciones: revisar `npx supabase migration list`. Si la columna Remote está completa, usar
   `npx supabase db push`; si no, ejecutar en el SQL Editor solo las migraciones nuevas, en orden.
4. Edge Functions modificadas: `npx supabase functions deploy <nombre>`.
5. Ajustar los crons si cambió su autenticación (sección 5).
6. Mergear el PR en `main` y desplegar el frontend (`npm run deploy` si Vercel no lo hace solo).
7. Verificación (sección 6).

Reversión: en Vercel, promover el despliegue anterior; las migraciones son aditivas y cada una
documenta cómo desactivarse; restaurar el respaldo completo solo como último recurso.

## 4. Rotación de secretos

Rotar al menos una vez al año, al salir una persona con acceso o ante sospecha de filtración.

- `WEBHOOK_SECRET`: generar uno nuevo, actualizar en el mismo intervalo Vercel, `supabase secrets`
  y `ALTER DATABASE postgres SET app.webhook_secret`; redeplegar Vercel. Entre el cambio y el
  redespliegue los avisos de asignación pueden fallar (no afecta los datos).
- `CRON_SECRET`: actualizar `supabase secrets` y el valor en Vault (`vault.update_secret`).
- Service role de Supabase: regenerar en Supabase → Settings → API y actualizar Vercel.
- OneSignal y Cuenti: regenerar en cada proveedor y actualizar las variables.

## 5. Tareas programadas

| Job | Cadencia | Función |
|---|---|---|
| `task-scheduler` | `*/5 * * * *` | Recordatorios, vencimientos y tareas recurrentes |
| `daily-expiration-check` | `0 13 * * *` (08:00 Colombia) | Mantenimientos y garantías por vencer |

Ambas funciones rechazan (401) cualquier llamada sin `x-cron-secret` válido o la service role.
Los jobs de `pg_cron` leen el secreto desde Vault. Comprobación:

```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
select status_code, created from net._http_response order by created desc limit 10;
```

## 6. Verificación después de cada despliegue

Endpoints protegidos (deben responder 401 sin credenciales):

```bash
curl -i -X POST <APP_URL>/api/edge/on-order-assigned
curl -i <APP_URL>/api/edge/cuenti-proxy
curl -i -X POST https://vhcvcbpfeiivwepdtkvu.supabase.co/functions/v1/task-scheduler -H "Authorization: Bearer <ANON_KEY>"
```

Comprobaciones funcionales: iniciar sesión con cada rol, crear y cerrar una orden con equipos,
crear una tarea, enviar un push de prueba, abrir el mapa y revisar la consola del navegador.

## 7. Controles de seguridad automatizados

El CI (`.github/workflows/ci.yml`) bloquea un PR si falla cualquiera de estos controles:

- Tipos (`tsc --noEmit` en 0 errores), pruebas unitarias y build.
- Auditoría de dependencias de producción (`npm audit`).
- Migraciones 001 en adelante sobre Postgres 16 limpio y las pruebas de RLS:
  - `supabase/tests/users_rls.sql`: nadie cambia su propio rol ni salta de empresa.
  - `supabase/tests/tasks_rls.sql`: las tareas solo las modifican sus participantes.
  - `supabase/tests/accounting_rls.sql`: el libro de caja menor es inmutable y no permite fabricar saldo.
- GitGuardian: detección de secretos en cada commit.

Para ejecutar las pruebas SQL en local se sigue la cabecera de cada archivo de `supabase/tests/`.

## 8. Respaldo y restauración

- Supabase realiza respaldos diarios; verificar su retención en Database → Backups.
- Antes de cada migración, respaldo manual (sección 3).
- Restaurar en un proyecto de prueba primero y validar con la sección 6 antes de tocar producción.

## 9. Respuesta a incidentes

1. Contener: si se sospecha filtración de un secreto, rotarlo de inmediato (sección 4).
2. Acotar: revisar Supabase → Logs (API, Auth, Edge Functions) y los registros de Vercel.
3. Corregir: preparar el arreglo en un PR con prueba de regresión; no aplicar cambios directos en producción.
4. Documentar: fecha, alcance, causa, corrección y acciones preventivas.
