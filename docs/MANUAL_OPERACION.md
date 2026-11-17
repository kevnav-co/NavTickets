# Manual de operación — NavTickets

Este manual describe cómo desplegar, operar y verificar la seguridad de NavTickets en producción.
No contiene valores de secretos: solo sus nombres y dónde se configuran.

## 1. Componentes

| Componente | Dónde vive | Responsabilidad |
|---|---|---|
| Frontend (PWA React) | Vercel | Interfaz, cola offline (IndexedDB) y sincronización |
| Endpoints `api/edge/*` | Vercel | Proxy Cuenti |
| Base de datos Postgres | Supabase (`hvysnxvuyexacktlwsbm`) | Datos multiempresa protegidos con RLS |
| Edge Functions | Supabase | Tareas programadas, avisos de asignación y soporte, alta de usuarios y empresas, claves |
| Storage | Supabase | Fotos de evidencia, firmas, logos |
| Push | Web Push (VAPID) via Edge Function `send-push` | Notificaciones a dispositivos suscritos |

La seguridad real está en la base de datos (RLS y triggers). La interfaz solo oculta opciones;
nunca debe considerarse una barrera de seguridad.

## 2. Inventario de secretos

| Nombre | Dónde se configura | Uso | Debe coincidir con |
|---|---|---|---|
| `WEBHOOK_SECRET` | Supabase (`supabase secrets`) | Autentica las Edge Functions que llaman los triggers (`on-*-assigned`, `support-*`). Sin él rechazan todo | `app.webhook_secret` de la base de datos |
| `app.webhook_secret` | Base de datos (`ALTER DATABASE … SET`) | Lo envían los triggers (024–029) | `WEBHOOK_SECRET` |
| `CRON_SECRET` | Supabase (`supabase secrets`) y Vault (`cron_secret`) | Autentica `task-scheduler` y `daily-expiration-check` | Valor guardado en Vault |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (env); automático en Edge Functions | Acceso administrativo desde el servidor | Supabase → Settings → API |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Supabase (`supabase secrets`) | Envío de Web Push (VAPID) | Generados con `web-push generate-vapid-keys` |
| `CUENTI_API_TOKEN`, `CUENTI_EMPRESA_ID`, `CUENTI_USER_ID` | Vercel (env) | Proxy al ERP Cuenti | Cuenta Cuenti de la empresa |
| `CUENTI_COMPANY_ID` | Vercel (env) | Limita el proxy Cuenti a la empresa dueña | `companies.id` de esa empresa |

Reglas:
- Los secretos se generan con un generador criptográfico (`openssl rand -hex 32`) y se guardan en el gestor de contraseñas.
- Nunca se escriben en el repositorio, en tickets ni en chats. GitGuardian revisa cada PR.
- Las variables `VITE_*` se incrustan en el navegador: nunca deben contener secretos.

## 3. Despliegue de una versión

Orden obligatorio (lo compatible con la versión anterior va primero):

0. Desde la carpeta del repositorio, enlazar la CLI al proyecto de producción y comprobarlo:
   `npx supabase link --project-ref hvysnxvuyexacktlwsbm` y `npx supabase projects list`
   (el proyecto enlazado debe ser `hvysnxvuyexacktlwsbm`). La carpeta `supabase/.temp/` es local
   y no se versiona: nunca se debe confiar en un enlace heredado.
1. Respaldo de la base de datos (Supabase → Database → Backups, o `npx supabase db dump`).
2. Variables y secretos nuevos en Vercel y Supabase (no afectan producción hasta el despliegue).
3. Migraciones: revisar `npx supabase migration list` (o en el SQL Editor:
   `select version, name from supabase_migrations.schema_migrations order by version;`). Si la columna Remote está completa, usar
   `npx supabase db push`; si no, ejecutar en el SQL Editor solo las migraciones nuevas, en orden.
4. Edge Functions modificadas: `npx supabase functions deploy <nombre>`.
5. Ajustar los crons si cambió su autenticación (sección 5).
6. Mergear el PR en `main` y desplegar el frontend (`npm run deploy` si Vercel no lo hace solo).
7. Verificación (sección 6).

Reversión: en Vercel, promover el despliegue anterior; las migraciones son aditivas y cada una
documenta cómo desactivarse; restaurar el respaldo completo solo como último recurso.

## 4. Rotación de secretos

Rotar al menos una vez al año, al salir una persona con acceso o ante sospecha de filtración.

- `WEBHOOK_SECRET`: generar uno nuevo y actualizar en el mismo intervalo `supabase secrets` y
  `ALTER DATABASE postgres SET app.webhook_secret`. Entre ambos cambios los avisos pueden fallar
  (no afecta los datos: los triggers nunca bloquean la escritura).
- `CRON_SECRET`: actualizar `supabase secrets` y el valor en Vault (`vault.update_secret`).
- Service role de Supabase: regenerar en Supabase → Settings → API y actualizar Vercel.
- VAPID keys: regenerar con `npx web-push generate-vapid-keys` y actualizar en Supabase secrets.
- Cuenti: regenerar en el proveedor y actualizar las variables.

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
curl -i <APP_URL>/api/cuenti/clients
curl -i -X POST https://hvysnxvuyexacktlwsbm.supabase.co/functions/v1/on-order-assigned
curl -i -X POST https://hvysnxvuyexacktlwsbm.supabase.co/functions/v1/task-scheduler -H "Authorization: Bearer <ANON_KEY>"
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
  - `supabase/tests/notifications_rls.sql`: nadie fabrica avisos a nombre de otro usuario.
  - `supabase/tests/service_requests_rls.sql`: el asistente nunca confirma; solo los gestores de la
    empresa ven, confirman y rechazan solicitudes; la disponibilidad respeta horario, días bloqueados,
    antelación y órdenes existentes.
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

## 10. Asistente de ventas y servicio técnico

Estado: fases 1 (datos y reglas) y 2 (bandeja del administrador) en la rama
`feature/asistente-ventas-servicio`, **sin aplicar en producción**. Plan completo: documento «Asistente de ventas y servicio técnico» en Claude Docs.

### 10.1 Qué agrega la fase 1

| Objeto | Migración | Función |
|---|---|---|
| `service_requests` | 042 | Solicitud que deja el asistente o un gestor (llamada). Estados `borrador` → `pendiente` → `confirmada` / `rechazada` / `cancelada` |
| `assistant_conversations`, `assistant_messages` | 042 | Transcripción de cada conversación; retención por empresa (180 días por defecto) |
| `assistant_settings` | 042 | Horario laboral, servicios y duraciones, días bloqueados, antelación mínima, técnicos que atienden y zona horaria (`America/Bogota` por defecto) |
| `available_slots(empresa, desde, hasta, duración[, técnico])` | 043 | Huecos libres por técnico; rango máximo 31 días |
| `confirm_service_request(solicitud, fecha, hora, duración, técnico)` | 043 | Crea la orden en una sola transacción y marca la solicitud como confirmada |
| `reject_service_request(solicitud, motivo)` | 043 | Rechaza con motivo obligatorio |
| `purge_assistant_transcripts()` | 042 | Borra transcripciones vencidas (solo service role) |
| Pestaña «Solicitudes» (`/requests`) | 044 | Bandeja para gestores; visible con el permiso `MANAGE_SERVICE_REQUESTS` y la bandera `aiAssistant` |
| Trigger `trg_service_request_notify_webhook` + Edge Function `service-request-notify` | 044 | Push a admin, supervisor y aux_admin cuando una solicitud queda pendiente |

### 10.2 Controles de seguridad

- **El asistente nunca crea órdenes.** La service role (Edge Function del asistente) no tiene permiso
  de ejecución sobre `confirm_service_request` ni `reject_service_request`, y además esas funciones
  exigen un usuario con sesión. El trigger `service_requests_guard` impide marcar una solicitud como
  confirmada o rechazada fuera de ellas, incluso con la service role.
- **Gestores** = admin, supervisor, aux_admin, developer y super_admin en vista previa
  (`can_manage_service_requests()`), espejo del permiso `MANAGE_SERVICE_REQUESTS` de
  `src/permissions.ts`. Los técnicos no ven solicitudes ni transcripciones.
- **Sin UPDATE ni DELETE por la API** sobre solicitudes. Desde el navegador solo se crean solicitudes
  manuales en `pendiente` y a nombre propio. Una solicitud cerrada no admite cambios.
- **Disponibilidad sin fugas:** `available_slots` devuelve fecha, hora y técnicos libres, nunca datos
  de las órdenes que ocupan un hueco. La Edge Function del asistente debe reenviar al modelo solo
  fecha y hora.
- **Doble reserva:** la confirmación toma un candado por técnico y vuelve a comprobar el hueco; si
  otra orden lo ocupa, falla con «El técnico ya tiene una orden en ese horario».
- **Configuración:** solo admin y developer de la empresa la cambian; horario, servicios y zona
  horaria se validan en la base de datos.

### 10.3 Bandeja del administrador (fase 2)

- Pestaña «Solicitudes»: lista por estado (pendientes, confirmadas, rechazadas, en curso), detalle
  con los datos recogidos y la conversación con el asistente.
- Confirmar: el gestor elige técnico, fecha, hora y duración (puede abrir la agenda del técnico) y
  pulsa «Confirmar y crear la orden». La app avisa antes si el técnico ya tiene una orden en ese
  horario; la base de datos lo vuelve a comprobar. Al terminar abre la orden creada.
- Rechazar: exige motivo.
- «Nueva»: registra una solicitud recibida por teléfono, que queda pendiente.
- Confirmar, rechazar y registrar requieren conexión.
- La Edge Function `service-request-notify` recibe del trigger solo el id de la solicitud y la relee
  con la service role; no confía en el contenido de la petición.

### 10.4 Aplicar en producción (cuando se apruebe)

1. Respaldo (sección 3, paso 1) y comprobar que la última migración aplicada es la 041:
   `select version from supabase_migrations.schema_migrations order by version desc limit 3;`
2. Aplicar 042, 043 y 044 en ese orden (`npx supabase db push` con el proyecto enlazado y
   comprobado, o el SQL Editor). Son idempotentes y aditivas; la 044 solo redefine
   `default_built_in_tabs()` para añadir la pestaña.
3. Desplegar las Edge Functions con la configuración de `supabase/config.toml`:
   `npx supabase functions deploy service-request-notify on-order-assigned on-task-assigned`.
4. Resolver los avisos por webhook (10.5); sin eso no llega ningún push que salga de un trigger.
5. Verificar:

```sql
-- Tablas con RLS activa
select relname, relrowsecurity from pg_class
where relname in ('service_requests','assistant_conversations','assistant_messages','assistant_settings');

-- La service role y anon no pueden confirmar (ambas deben ser false)
select has_function_privilege('service_role', 'public.confirm_service_request(uuid,date,time,integer,uuid)', 'execute'),
       has_function_privilege('anon', 'public.available_slots(uuid,date,date,integer,uuid)', 'execute');
```

Reversión: las tablas nuevas están vacías hasta que se active la bandera `aiAssistant` de una
empresa; para retirar la función basta con dejar la bandera apagada. Borrarlas no afecta a órdenes
ya creadas (la orden no depende de la solicitud).

### 10.5 Avisos por webhook: corrección pendiente en producción (17/11/2026)

Revisión de solo lectura del proyecto `hvysnxvuyexacktlwsbm`:

- `app.webhook_secret` **no está configurado** en la base de datos (ni por base ni por rol). Los
  triggers de las migraciones 024–029 lo leen para firmar las llamadas a las Edge Functions, así que
  envían la cabecera vacía y las funciones, que son fail-closed, responden 401. El secreto
  `WEBHOOK_SECRET` sí existe en las Edge Functions.
- `on-order-assigned` y `on-task-assigned` están desplegadas con `verify_jwt = true`. El trigger
  envía el secreto, que no es un JWT, y el gateway lo rechaza antes de llegar a la función.

Efecto: no llegan los avisos de asignación de órdenes y tareas (ni la notificación interna ni el
push) ni los push de soporte que salen de triggers. Corrección (requiere aprobación):

1. Generar un secreto nuevo con `openssl rand -hex 32` y guardarlo en el gestor de contraseñas.
2. `npx supabase secrets set WEBHOOK_SECRET=<valor>`.
3. En el SQL Editor: `ALTER DATABASE postgres SET app.webhook_secret = '<valor>';` (aplica a las
   conexiones nuevas). Si Supabase lo rechaza, se prepara una migración que lea el secreto de Vault.
4. Redesplegar `on-order-assigned` y `on-task-assigned` (ya tienen `verify_jwt = false` en
   `supabase/config.toml`), junto con `service-request-notify`.
5. Comprobar: asignar una orden de prueba en la empresa demo y revisar
   `select status_code, created from net._http_response order by created desc limit 5;`
   (debe responder 200) y que el técnico reciba el push.
