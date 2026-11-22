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
| `WEBHOOK_SECRET` | Supabase (`supabase secrets`) | Autentica las Edge Functions que llaman los triggers (`on-*-assigned`, `support-*`, `service-request-notify`, `service-request-customer-notify`) y `send-push`. Sin él rechazan todo | Secreto `webhook_secret` de Vault |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Supabase (`supabase secrets`) | Correo saliente: recuperación de clave, códigos del chat y aviso al cliente al confirmar o rechazar. **Configurados en producción el 18/11/2026** (envío real comprobado); sin ellos las funciones quedan en modo simulado | Cuenta de Gmail con verificación en dos pasos y contraseña de aplicación |
| `webhook_secret` (Vault) | Base de datos, Supabase Vault (`vault.create_secret` / `vault.update_secret`) | Lo envían los triggers a través de `public.webhook_secret()` (migración 044). En Supabase no se puede usar `ALTER DATABASE … SET app.webhook_secret` (permiso denegado) | `WEBHOOK_SECRET` |
| `CRON_SECRET` | Supabase (`supabase secrets`) | Autentica `task-scheduler` y `daily-expiration-check` | Secreto `cron_secret` de Vault |
| `cron_secret` (Vault) | Base de datos, Supabase Vault | Lo envían los jobs de `pg_cron` como `x-cron-secret` a través de `public.cron_secret()` (migración 047) | `CRON_SECRET` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (env); automático en Edge Functions | Acceso administrativo desde el servidor | Supabase → Settings → API |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Supabase (`supabase secrets`) | Envío de Web Push (VAPID) | Generados con `web-push generate-vapid-keys` |
| `CUENTI_API_TOKEN`, `CUENTI_EMPRESA_ID`, `CUENTI_USER_ID` | Vercel (env) | Proxy al ERP Cuenti | Cuenta Cuenti de la empresa |
| `CUENTI_COMPANY_ID` | Vercel (env) | Limita el proxy Cuenti a la empresa dueña | `companies.id` de esa empresa |

Retirados el 18/11/2026 por no usarse (comprobado en el código y en los paquetes desplegados): `ONESIGNAL_API_KEY`, `ONESIGNAL_APP_ID` y las siete `VITE_FIREBASE_*` de los secretos de Supabase, y las inyecciones de `VITE_FIREBASE_*` y `VITE_VAPID_KEY` de `vite.config.ts`. `SUPABASE_SERVICE_ROLE_KEY` de Vercel **sí** se usa (proxy de Cuenti, `api/edge/cuenti-proxy.ts`).

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

- `WEBHOOK_SECRET`: generar uno nuevo y actualizar en el mismo intervalo `supabase secrets set WEBHOOK_SECRET=…`
  y Vault (`select vault.update_secret(id, '<nuevo>') from vault.secrets where name = 'webhook_secret';`).
  Entre ambos cambios los avisos pueden fallar (no afecta los datos: los triggers nunca bloquean la
  escritura). Para comprobar que coinciden sin ver el valor: la API de secretos de Supabase devuelve el
  SHA-256 del valor, que se compara con `encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')`
  de `vault.decrypted_secrets`. El valor no se guarda en ningún otro sitio: si se pierde, se rota.
- `CRON_SECRET`: actualizar `supabase secrets set CRON_SECRET=…` y Vault
  (`select vault.update_secret(id, '<nuevo>') from vault.secrets where name = 'cron_secret';`). Se
  comprueba igual que `WEBHOOK_SECRET`, comparando los SHA-256.
- Service role de Supabase: regenerar en Supabase → Settings → API y actualizar Vercel.
- VAPID keys: regenerar con `npx web-push generate-vapid-keys` y actualizar en Supabase secrets.
- Cuenti: regenerar en el proveedor y actualizar las variables.

## 5. Tareas programadas

| Job | Cadencia | Función |
|---|---|---|
| `task-scheduler` | `*/5 * * * *` | Recordatorios, vencimientos y tareas recurrentes |
| `daily-expiration-check` | `0 13 * * *` (08:00 Colombia) | Mantenimientos y garantías por vencer |

Los programa `pg_cron` (migración 047, jobs `task-scheduler` y `daily-expiration-check` en
`cron.job`). Cada job ejecuta `public.invoke_scheduled_function('<nombre>')`, que llama a la Edge
Function vía pg_net con `x-cron-secret` tomado de Vault; esa función solo admite estos dos nombres y
no es ejecutable desde la API. Las dos Edge Functions tienen `verify_jwt = false` y rechazan (401)
cualquier llamada sin `x-cron-secret` válido o la service role.

Para lanzar una ejecución a mano: `select public.invoke_scheduled_function('daily-expiration-check');`.

Historia: hasta el 17/11/2026 nunca se habían ejecutado en producción (pg_cron sin instalar, sin
jobs ni `CRON_SECRET`; la clave `schedule` de `config.toml` no la aplica la CLI). Además
`daily-expiration-check` pedía columnas inexistentes (`companies.whatsapp_number`,
`orders.equipment_name`). La primera ejecución avisó a los administradores de lo acumulado
(9 mantenimientos y 13 garantías). El correo y el WhatsApp a clientes siguen simulados.

Comprobación:

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

Estado: fases 1 (datos y reglas) y 2 (bandeja del administrador) **en producción desde el 17/11/2026**
(migraciones 042–046); fase 3 (chat web público, §10.6) **en producción desde el 18/11/2026** con el
proveedor simulado (migración 050 y Edge Function `assistant-chat`); fase 4 (configuración del
asistente y aviso al cliente, §10.7) **en producción desde el 18/11/2026** (migración 051 y Edge
Function `service-request-customer-notify`). Todo el código está en `main`. La pestaña y el chat solo
funcionan en empresas con `features.aiAssistant = true` (hoy, Plásticos del Sur). Plan completo:
documento «Asistente de ventas y servicio técnico» en Claude Docs.

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
| `confirm_service_request` tolerante al tipo de `orders.equipment_ids` | 045 | En producción es `text[]` (033 local) y en el repo `jsonb` (036); inserta con `jsonb_populate_record` |
| Pestaña «Solicitudes» (`/requests`) | 046 | Bandeja para gestores; visible con el permiso `MANAGE_SERVICE_REQUESTS` y la bandera `aiAssistant` |
| Trigger `trg_service_request_notify_webhook` + Edge Function `service-request-notify` | 046 | Push a admin, supervisor y aux_admin cuando una solicitud queda pendiente |

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

### 10.4 Aplicación en producción (17/11/2026)

1. Respaldo puntual previo (no hay respaldos descargables en el plan actual): `companies` (`tabs`,
   `features`) y la definición de `default_built_in_tabs()`, guardados fuera del repositorio.
2. Migraciones 042, 043, 044, 045 y 046 por la API de administración, cada una en su transacción
   junto con su fila en `supabase_migrations.schema_migrations`.
3. Edge Functions: `service-request-notify` desplegada; `on-order-assigned` y `on-task-assigned`
   redesplegadas desde el repositorio; `verify_jwt = false` en esas tres y en `send-push`.
4. Frontend desplegado en Vercel producción (despliegue anterior para revertir:
   `dpl_6djgv9QRcJiC26SFZqgCpfbs1ESx`).
5. Prueba de extremo a extremo en Plásticos del Sur (empresa de demostración): solicitud
   «Prueba asistente (Claude)» confirmada como `pl_admin` → orden #46 para `pl_tec1` (24/11, 08:00)
   → `on-order-assigned` 200 → notificación interna y `send-push` 200. Solicitud «Prueba push
   gestores (Claude)» → `service-request-notify` 200 → `send-push` para los 3 gestores; después
   rechazada. Ambos registros se conservan como evidencia.

Verificación rápida:

```sql
select version from supabase_migrations.schema_migrations where version >= '042' order by 1;
select has_function_privilege('service_role', 'public.confirm_service_request(uuid,date,time,integer,uuid)', 'execute'),
       has_function_privilege('authenticated', 'public.webhook_secret()', 'execute');   -- ambas false
select status_code, left(content::text, 120) from net._http_response order by created desc limit 5;
```

Reversión: promover el despliegue anterior en Vercel; las migraciones son aditivas (la 044 solo
cambia de dónde leen el secreto las funciones de trigger). Apagar `aiAssistant` oculta la bandeja.

### 10.5 Avisos por webhook y push: fallos encontrados y corregidos (17/11/2026)

Ninguno de los avisos que salen de un trigger llegaba en producción, ni podía llegar un push a un
teléfono. Causas encontradas y corrección aplicada:

| Fallo | Corrección |
|---|---|
| `app.webhook_secret` sin configurar; Supabase no deja fijarlo (`permission denied to set parameter`) | Migración 044: el secreto vive en Vault (`webhook_secret`) y los triggers lo leen con `public.webhook_secret()`, que la API no puede ejecutar. Secreto nuevo en Vault y en `WEBHOOK_SECRET`, comprobado por SHA-256 |
| `on-order-assigned`, `on-task-assigned` y `send-push` con `verify_jwt = true`: el gateway cortaba las llamadas | `verify_jwt = false` (las funciones ya exigen el secreto); fijado también en `supabase/config.toml` |
| El paquete desplegado de `on-order-assigned` no conseguía llamar a `send-push` | Redespliegue desde el repositorio; la respuesta incluye ahora `pushStatus` para diagnosticar desde `net._http_response` |
| La tabla `push_subscriptions` no existía, aunque la 040 constaba como aplicada | Se volvió a aplicar la 040 (tabla, RLS y 3 políticas) |
| La app nunca creaba la suscripción del navegador ni la guardaba en `push_subscriptions` (solo copiaba el endpoint en `users.onesignal_player_id`) | `useWebPush` crea la suscripción con la clave VAPID y la guarda con el cliente de Supabase (idempotente por endpoint) |
| Las funciones de trigger de producción no tenían `search_path` fijo pese a la 039 | La 044 lo fija al recrearlas |

Pendiente: que cada usuario vuelva a activar las notificaciones (botón de campana del encabezado; en
iPhone, con la app instalada en la pantalla de inicio), porque hasta hoy ninguna suscripción se
guardaba. Después, `select count(*) from push_subscriptions;` debe crecer y el siguiente aviso llegará
al teléfono.

### 10.6 Chat web público (fase 3)

Estado: **en producción desde el 18/11/2026 con el proveedor simulado** (sin costo de modelo) para
Plásticos del Sur. La migración 050 está aplicada, `assistant-chat` desplegada con `verify_jwt = false`
y el frontend publicado (`dpl_DB3ZK2o1UEJJkc2NfMn6hgtmiJLq`; el anterior, para revertir, es
`dpl_AjsxiV4ioTaZAAKCktafiqLgMKoF`). Falta `ANTHROPIC_API_KEY`: hasta que se configure, cualquier
empresa que no sea de prueba recibe «no disponible» (503).

- **Enlace para clientes:** `https://navtickets.vercel.app/#/asistente/<slug>`. Solo responde para
  empresas con `features.aiAssistant = true`; para las demás muestra «Asistente no disponible», sin
  revelar si la empresa existe. La página se monta fuera de la sesión de la app.
- **Aviso de datos personales** antes del primer mensaje (Ley 1581 de 2012), con la retención de la
  empresa. **Pendiente: revisión del texto por quien lleve lo legal.**
- **Herramientas del modelo:** `consultar_disponibilidad` (solo fechas y horas libres, máximo 14 días),
  `identificar_cliente` (solo con correo verificado; devuelve el nombre del cliente y sus equipos) y
  `guardar_solicitud` (borrador o pendiente; nunca crea órdenes; una propuesta de hueco se vuelve a
  comprobar contra `available_slots`). La empresa y el cliente los fija el servidor.
- **Verificación de correo:** código de 6 dígitos por correo, guardado con hash (tabla
  `assistant_verification_codes`, sin acceso desde la API), 10 minutos de vigencia, 3 envíos por
  conversación y 5 intentos por código. Sin `GMAIL_USER`/`GMAIL_APP_PASSWORD` el correo queda en
  modo simulado y el código solo aparece en los logs de la función.
- **Límites:** 2.000 caracteres por mensaje; 30 mensajes y 300.000 tokens por conversación; 10
  conversaciones nuevas por IP y 300 por empresa en 24 horas; 4 rondas de herramientas por turno. La
  IP se guarda solo como hash con sal.
- **Retención:** pg_cron ejecuta `purge_assistant_transcripts()` a diario (09:00 UTC) y borra las
  conversaciones más antiguas que la retención de la empresa y los códigos vencidos.

Secretos y variables de la Edge Function (Supabase):

| Nombre | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic. Sin ella, las empresas reales reciben «no disponible» (503) |
| `LLM_MODEL` | Opcional; por defecto `claude-haiku-5-5` |
| `ASSISTANT_SALT` | Sal para el hash de IP y de los códigos (`openssl rand -hex 32`). Si falta se usa `WEBHOOK_SECRET` |
| `ASSISTANT_ALLOWED_ORIGINS` | Orígenes extra permitidos por CORS, separados por comas (además de `APP_URL`) |
| `LLM_TEST_COMPANY_IDS` | Ids de empresas de prueba (separados por comas) |
| `LLM_TEST_PROVIDER` | `mock` (simulado, sin costo) u `openai-compatible`, solo para esas empresas. Una empresa real nunca usa un proveedor de pruebas |
| `LLM_TEST_BASE_URL`, `LLM_TEST_API_KEY`, `LLM_TEST_MODEL` | Solo con `openai-compatible` |

Configuración en producción (18/11/2026), comprobada comparando el SHA-256 de cada valor con el que
devuelve la API de secretos, sin mostrar los valores:

| Nombre | Valor configurado |
|---|---|
| `LLM_TEST_COMPANY_IDS` | `bb08edb1-3b01-4dcd-9ef5-03c7260883b5` (Plásticos del Sur) |
| `LLM_TEST_PROVIDER` | `openai-compatible` desde el 19/11/2026 (antes `mock`). Para volver al simulado: `mock` |
| `LLM_TEST_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_TEST_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` desde el 19/11/2026 (antes `openrouter/free`, que elegía un modelo distinto en cada llamada) |
| `LLM_TEST_API_KEY` | Clave de OpenRouter, guardada por el dueño directamente en Supabase |
| `ASSISTANT_SALT` | Generada con `openssl rand -hex 32` dentro del contenedor; solo existe en Supabase |
| `APP_URL` | `https://navtickets.vercel.app` (ya existía; es el origen permitido por CORS) |
| `ANTHROPIC_API_KEY` | **Sin configurar** |

**Prueba con OpenRouter gratuito (19/11/2026).** Tres turnos en el chat de Plásticos del Sur:

| Turno | Resultado |
|---|---|
| Pregunta por los servicios | Contestó con los servicios configurados |
| Pide disponibilidad | Llamó a `consultar_disponibilidad` y ofreció los huecos reales de la agenda (8–17 s por turno) |
| Deja los datos de la solicitud | La primera vez agotó los 2.048 tokens de salida y el asistente respondió con su mensaje de «respuesta incompleta», sin guardar nada a medias. Al repetirlo guardó la solicitud `3a881e62` en `pendiente`, con el hueco validado |

Esa variación se debe a que `openrouter/free` elige un modelo distinto en cada llamada. Para una demo más estable conviene fijar un modelo `:free` concreto que admita herramientas.

**Prueba con `nvidia/nemotron-3-ultra-550b-a55b:free` (19/11/2026), el modelo que queda configurado.** Los mismos tres turnos salieron bien a la primera:

| Turno | Resultado |
|---|---|
| Servicios | 5 s |
| Disponibilidad | 15 s, con huecos reales vía `consultar_disponibilidad` |
| Datos de la solicitud | 18 s. Guardó la solicitud `6086aee9` en `pendiente` con el hueco validado, y el resumen al cliente aclara que un administrador confirma la cita |

La conversación entera usó unos 14.900 tokens de entrada y 1.900 de salida.

Los modelos gratuitos pueden registrar o usar los mensajes, así que el código solo los permite en empresas de `LLM_TEST_COMPANY_IDS`. Con este proveedor la respuesta llega completa, sin streaming.

Procedimiento de despliegue seguido (repetible):

1. Comprobar que producción está en la 049 y que no existe `assistant_verification_codes`.
2. Aplicar la 050 en una sola transacción junto con
   `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('050','assistant_web')`.
3. Verificar: RLS activo y sin políticas en `assistant_verification_codes`, `anon` sin `EXECUTE` sobre
   `purge_assistant_transcripts()`, job `assistant-purge` (`0 9 * * *`) en `cron.job` y los 3 índices.
4. Fijar los secretos de la tabla anterior (`npx supabase secrets set …` o la API de secretos).
5. `npx supabase functions deploy assistant-chat --project-ref hvysnxvuyexacktlwsbm --no-verify-jwt`.
6. Desplegar el frontend (`npm run deploy`) y comprobar que se sirve el chunk
   `assets/js/PublicAssistantChat-*.js`.

Verificación de extremo a extremo hecha en producción:

| Prueba | Resultado |
|---|---|
| `init` con un slug inexistente | 404 «El asistente no está disponible» |
| Preflight CORS desde un origen ajeno | Sin `Access-Control-Allow-Origin` (el navegador bloquea) |
| `init` con `plasticos-del-sur` | 200, marca de la empresa y aviso de datos |
| «¿Qué disponibilidad tienen?» | Huecos reales de `available_slots` (solo fecha y hora) |
| Mensaje con nombre, teléfono y descripción | Solicitud en `pendiente`; `service-request-notify` respondió 200 y avisó a 3 gestores |
| IP de la conversación | Guardada solo como hash de 64 caracteres |
| Rechazo como `pl_admin` con `reject_service_request` | Solicitud de prueba en `rechazada` |
| Página `/#/asistente/plasticos-del-sur` en un iPhone emulado | Aviso, envío y respuesta correctos, sin errores de consola |

Para pasar al modelo real: guardar `ANTHROPIC_API_KEY` como secreto de Supabase y, si Plásticos del Sur
también debe usarlo, quitar su id de `LLM_TEST_COMPANY_IDS`. No hace falta redesplegar: la función lee
los secretos en cada arranque.

**Respuestas en streaming** (rama `feature/asistente-streaming`, sin desplegar). El chat pide
`stream: true` y la respuesta llega por partes, en NDJSON (un objeto JSON por línea,
`Content-Type: application/x-ndjson`):

| Evento | Significado |
|---|---|
| `{"type":"delta","text":"…"}` | Texto que el modelo va escribiendo (vista previa) |
| `{"type":"done","reply":"…","request":…}` | Respuesta definitiva; **reemplaza** lo transmitido (un rechazo, una respuesta cortada o el texto previo a una herramienta cambian el resultado) |
| `{"type":"error","status":503,"error":"…"}` | El turno falló; el chat quita el texto parcial y muestra el error |

- Cada respuesta termina con exactamente un `done` o un `error`.
- Los errores anteriores al turno (límites, conversación cerrada, proveedor no disponible) siguen llegando como JSON normal con su código HTTP.
- Si el cliente cierra la página a mitad, el turno termina y se guarda igual.
- Las peticiones sin `stream` reciben el JSON de siempre, así que el cambio es compatible con versiones anteriores.
- **Anthropic:** `messages.stream` del SDK.
- **Simulado:** emite por palabras, con 25 ms entre una y otra, para que se vea en la demo.
- **Proveedor compatible con OpenAI:** no transmite y entrega la respuesta completa al final.

Despliegue: redesplegar `assistant-chat` (`--no-verify-jwt`) y el frontend. No hay migración. Después,
comprobar con `curl -N` que los `delta` llegan separados en el tiempo; si el gateway los agrupa, el
chat sigue funcionando, solo que sin el efecto de escritura.

**Formato de las respuestas.** El chat muestra negrita, cursiva, viñetas y listas numeradas con
`src/components/assistant/ChatMarkdown.tsx`:

- construye nodos de React, nunca HTML, así que el texto del modelo no puede inyectar etiquetas;
- los enlaces de Markdown se muestran como texto, no como enlaces;
- quita las comillas invertidas;
- convierte los títulos en una línea en negrita.

El mensaje del cliente se sigue mostrando como texto plano. El prompt (reglas 8 y 9) pide ese formato y prohíbe mostrar al cliente los identificadores internos de los servicios.

Pendiente para fases siguientes: captcha invisible. La configuración y el correo al cliente son la fase 4 (§10.7).

### 10.7 Configuración del asistente y aviso al cliente (fase 4)

Estado: **en producción desde el 18/11/2026**:

- migración 051 aplicada;
- `service-request-customer-notify` desplegada con `verify_jwt = false`;
- frontend publicado.

`GMAIL_USER`/`GMAIL_APP_PASSWORD` configurados el 18/11/2026: los correos salen de verdad. Prueba: una solicitud rechazada como `pl_admin` devolvió `sent: true, stub: false`. Si faltan, los correos quedan en modo simulado y el gestor recibe el aviso en la campana.

**Sección «Asistente»** (Configuración de mi empresa → pestaña «Asistente», o el engranaje de la
bandeja de solicitudes; enlace directo `/#/admin?seccion=asistente`). Solo la ven admin y developer
de empresas con `features.aiAssistant = true`, y el super_admin en vista previa. Edita la fila de
`assistant_settings` (migración 042), que la Edge Function `assistant-chat` y `available_slots` leen en
cada mensaje: **al guardar, el chat ofrece de inmediato el horario y los servicios nuevos**, sin
redesplegar nada.

| Bloque | Qué controla | Columna |
|---|---|---|
| Enlace para tus clientes | Enlace público `https://<app>/#/asistente/<slug>`, botón de copiar y código QR descargable en PNG | — (usa `companies.slug`) |
| Mensaje de bienvenida | Primer mensaje del chat (hasta 1.000 caracteres) | `welcome_message` |
| Horario de atención | Franjas por día (hasta 6 por día, sin cruces) y zona horaria | `working_hours`, `timezone` |
| Servicios | Nombre, tipo de orden (Correctivo/Preventivo) y duración que se reserva (15 min a 12 h). Un servicio guardado conserva su identificador interno al renombrarlo | `service_types` |
| Reglas de la agenda | Antelación mínima (0–720 h), intervalo entre huecos (15, 30 o 60 min), días hacia adelante (1–180) y días bloqueados | `min_lead_hours`, `slot_step_minutes`, `max_days_ahead`, `blocked_dates` |
| Técnicos | Quiénes atienden solicitudes; sin ninguno marcado, todos los asignables | `technician_ids` |
| Privacidad | Días que se conservan las conversaciones (7–730); aparece en el aviso de datos del chat | `retention_days` |
| Vista previa | Huecos que ofrecería hoy el asistente para un servicio, con la configuración guardada (RPC `available_slots`) | — |

La app valida lo mismo que los `CHECK` de la base antes de guardar (y algunas reglas más, como franjas
que se cruzan o un servicio más largo que cualquier franja) y la base vuelve a validarlo. La RLS de la 042
solo deja escribir a admin y developer de la empresa (`can_configure_assistant`).

**Aviso al cliente por correo.** Cuando una solicitud pasa a `confirmada` o `rechazada`, el trigger
`trg_service_request_customer_notify_webhook` (migración 051) llama por pg_net a
`service-request-customer-notify`, firmado con el secreto de Vault como el resto de webhooks. La función
relee la solicitud con la service role y envía al correo de la solicitud (o, si no lo tiene, al del
cliente registrado):

- al confirmar: servicio, fecha, hora de llegada, duración, técnico, número de orden y referencia;
- al rechazar: el motivo que escribió el gestor (la bandeja avisa de que lo leerá el cliente) y la
  referencia.

Si el cliente no dejó correo, si `GMAIL_USER`/`GMAIL_APP_PASSWORD` no están configurados (modo simulado)
o si el envío falla, deja una notificación en la campana a quien revisó la solicitud («Avisa al cliente
de la cita / del rechazo… Avísale por teléfono»). La app nunca afirma que el correo salió. Los datos del
correo se escapan y el asunto no admite saltos de línea; en los logs el correo aparece enmascarado.

Para desplegar (en este orden):

1. Comprobar que producción está en la 050 y que no existe el trigger
   `trg_service_request_customer_notify_webhook`.
2. Aplicar la 051 en una sola transacción con su `INSERT` en `supabase_migrations.schema_migrations`
   (`'051', 'service_request_customer_notify'`).
3. `npx supabase functions deploy service-request-customer-notify --project-ref hvysnxvuyexacktlwsbm --no-verify-jwt`.
4. Desplegar el frontend (`npm run deploy`).
5. Probar: cambiar el horario en la sección, ver la vista previa y preguntar disponibilidad en el chat;
   rechazar una solicitud de prueba con correo y revisar `net._http_response` (200, `stub: true` mientras
   no haya Gmail) y la notificación en la campana.

Verificación de extremo a extremo hecha en producción (18/11/2026, Plásticos del Sur):

| Prueba | Resultado |
|---|---|
| Producción antes del despliegue | En la 050, sin el trigger de la 051 |
| Trigger de la 051 | Activo, `search_path` fijo, firma con `public.webhook_secret()`; `anon` y `authenticated` no lo ejecutan |
| `service-request-customer-notify` sin secreto / con GET | 401 / 405 |
| Un técnico (`pl_tec1`) intenta cambiar la configuración | 0 filas: no la ve ni la modifica |
| `pl_admin` deja el horario en «solo sábado 14:00–18:00» | El chat pasa de ofrecer el jueves 19 a las 08:00 a ofrecer el sábado 21 desde las 14:00, sin redesplegar (salida de la fase 4) |
| Solicitud de prueba con correo `@example.com`, rechazada como `pl_admin` | La función respondió 200 con `stub: true` y `pl_admin` recibió en la campana «Avisa al cliente del rechazo… Avísale por teléfono» |
| Horario original restaurado | El chat vuelve a ofrecer el jueves 19 a las 08:00 |
| Pestaña «Asistente» entrando como `pl_admin` | Pestañas Empresa/Asistente, enlace `https://navtickets.vercel.app/#/asistente/plasticos-del-sur`, QR, técnicos reales y huecos reales en la vista previa, sin errores de consola |

Para enviar correos de verdad: guardar `GMAIL_USER` y `GMAIL_APP_PASSWORD` (contraseña de aplicación de
Google) como secretos de Supabase. Sirven también para la recuperación de clave y los códigos del chat.
No hace falta redesplegar: las funciones leen los secretos en cada arranque.

## 10.8 Fotos y archivos: acotados a la empresa (migración 052, paso 1 de 2)

**Hallazgo (22/11/2026).** En producción, `order-photos` y `equipment-photos` tenían una política de
lectura para el rol `public`: cualquiera con la clave anónima de la app (que va en el navegador) podía
**listar y descargar las fotos de todas las empresas**. Las políticas de subida solo comprobaban el dueño,
no la empresa. Esas políticas venían de la 034 local, que nunca llegó al repositorio.

**Qué cambia**

- **Buckets.** La 052 los crea o ajusta:
  - fotos, públicas por enlace, hasta 10 MB, solo JPEG/PNG/WebP/GIF;
  - `company-assets`, público por enlace (los logos se ven antes de iniciar sesión), hasta 5 MB, solo PNG/JPEG/WebP;
  - ningún bucket admite SVG ni PDF.
- **Sin listado.** Se quitan las políticas `public`. La URL pública de cada archivo sigue funcionando (incluida la caché sin conexión), pero ya nadie puede listar ni leer por la API los objetos de otra empresa.
- **Rutas por empresa.** Las fotos nuevas se guardan como `{company_id}/orders/…` o `{company_id}/equipment/…`; el prefijo lo pone `useSupabaseStorage` con `companyScopedPath` (`src/utils/storagePath.ts`). Los logos van en `companies/{company_id}/…`.
- **Rutas antiguas sin empresa** (`orders/{id}/…`, `equipment/{id}/…`, `equipment_photos/{id}/…`). Se aceptan solo si la orden o el equipo es de la empresa de quien llama. Así no se rompen las fotos existentes ni las subidas que quedaron pendientes sin conexión.
- **Permisos.**
  - Leer, subir y reemplazar: solo dentro de la propia empresa.
  - Borrar: el dueño del archivo o un admin/developer/super_admin, también dentro de su empresa.
  - Logos: solo admin/developer/super_admin.
- **Validación en la app.** Antes de subir se comprueba el tipo real del archivo (sin SVG). La extensión del logo sale del tipo, no del nombre del archivo.

**Despliegue, en este orden**

1. Desplegar el frontend: las rutas nuevas ya las aceptan las políticas viejas.
2. Aplicar la 052 con su registro en `schema_migrations`.
3. Verificar:
   - con la clave anónima, `GET /storage/v1/object/list/order-photos` no devuelve objetos;
   - una foto antigua sigue abriendo por su URL pública;
   - subir una foto nueva la deja en `{company_id}/…`.

Una PWA instalada que aún no se haya actualizado sigue usando rutas sin empresa. Esas rutas se aceptan para órdenes ya guardadas, pero no para una orden nueva creada sin conexión: hay que actualizar la app (el aviso «Nueva versión» de la PWA).

**Paso 2 (pendiente).** Buckets privados con URLs firmadas. Afecta a unos 13 componentes, al PDF y a la caché sin conexión, porque los enlaces firmados caducan.

Prueba SQL: `supabase/tests/storage_rls.sql` (20 comprobaciones).

## 11. Diferencias conocidas entre el repositorio y la base de producción (18/11/2026)

`supabase_migrations.schema_migrations` no es una fuente fiable del esquema real: varias migraciones
constan como aplicadas sin que existan sus objetos, y hay objetos que no crea ninguna migración del
repositorio. Antes de cualquier cambio de esquema, comprobar el objeto concreto en la base, no solo la
tabla de migraciones.

| Diferencia | Estado |
|---|---|
| La 040 constaba como aplicada pero `push_subscriptions` no existía | Corregido el 17/11/2026 (se volvió a aplicar la 040) |
| La 035 consta como aplicada (39 sentencias) pero no existían `transactions`, `expenses`, `incomes` ni las funciones `accounting_*` | Corregido el 18/11/2026: la migración 048 crea el módulo y añade la pestaña «Contable» (visible con `features.accounting = true`: Hoteles Caribe, Metalmecánica Andina, Plásticos del Sur) |
| Existían `expense_vat`, `invoices`, `tax_parameters` y `tax_profiles` (vacías, con RLS sin políticas, columnas en camelCase y terminología fiscal de IVA/IRPF/RUT) que no crea ninguna migración ni usa ningún archivo del repositorio | Borradas el 18/11/2026 con la migración 049 (solo si vacías y sin `CASCADE`), tras respaldar su definición. Parecían de otro proyecto (posiblemente Dual-Balance) |
| `orders.equipment_ids` es `text[]` (033 local) en vez de `jsonb` (036 del repositorio) | El código nuevo admite ambos tipos (migración 045) |
| `default_built_in_tabs()` no incluía la entrada `accounting` | Corregido por la 048 (la añade a la lista existente) |
| La versión desplegada de `support-reply-notify` todavía enviaba por OneSignal | Redesplegada desde el repositorio (Web Push vía `send-push`) el 18/11/2026 |
