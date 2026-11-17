# DIRECTIVA: NOTIFICACIONES_PUSH_SOP (antes FCM, después OneSignal)

> **ID:** 20260415_NOTIF_01 (revisado)
> **Script Asociado:** `src/utils/webPush.ts`, `src/hooks/useWebPush.ts`, `src/sw.ts`, edge `send-push` y `supabase/functions/_shared/push.ts`, migración 040
> **Última Actualización:** 17/11/2026
> **Estado:** ACTIVO

> **Cambio de proveedor:** el push pasó por Firebase Cloud Messaging y después por OneSignal; hoy usa el estándar **Web Push con claves VAPID**, sin intermediarios. Las suscripciones viven en la tabla `push_subscriptions` (migración 040). La columna `users.onesignal_player_id` conserva su nombre heredado y guarda el endpoint de la suscripción; renombrarla requiere migración. No queda código, variable de entorno ni host de OneSignal en uso.

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Garantizar la entrega confiable de notificaciones push a técnicos y administradores para alertas de mantenimiento, asignación de órdenes y tareas, y **soporte**.
- **Criterio de Éxito:** Cada usuario que concedió el permiso en un navegador o PWA recibe el push correspondiente (por ejemplo, el aviso de consulta de soporte al super_admin).

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Clave pública VAPID (cliente):** `VITE_VAPID_PUBLIC_KEY`, variable de Vercel incrustada al compilar.
- **Secrets server-side (proyecto Supabase):** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (un `mailto:` de contacto), leídos por el edge `send-push`.
- **Suscripción:** una fila en `push_subscriptions` por navegador (`endpoint` único, con `user_id` y `company_id`).

### Salidas (Outputs)
- **Notificación push:** alerta nativa entregada por el servicio de push del navegador a cada suscripción del destinatario.

## 3. Flujo Lógico (Algoritmo)

1. **Suscripción (cliente):** `useWebPush` (montado desde `Header`) pide permiso ante un gesto del usuario, suscribe con `VITE_VAPID_PUBLIC_KEY` y `webPush.ts` guarda la suscripción en `push_subscriptions`.
2. **Disparo (server):** un evento de negocio dispara el envío. Los avisos de soporte, asignación de órdenes y tareas salen de Edge Functions activadas por **triggers de BD** (pg_net); recordatorios y vencimientos, de los edges programados.
3. **Envío:** todas esas funciones delegan en el helper `_shared/push.ts`, que llama al edge `send-push` con la service role. `send-push` lee las suscripciones del destinatario (por `userId` o `companyId`) y firma cada envío con las claves VAPID.
4. **Recepción (PWA):** el service worker (`src/sw.ts`) maneja el evento `push` nativo, fiable también en iOS con la PWA instalada.

## 4. Herramientas y Librerías
- **Cliente:** API estándar `PushManager` del navegador (`webPush.ts`, `useWebPush`).
- **Server:** Edge Functions de **Supabase**; `send-push` usa el paquete `web-push` de npm. pg_net para los triggers.
- **Service Worker:** API nativa `push`.

## 5. Restricciones y Casos Borde
- **Permiso:** solo reciben push los navegadores donde el usuario concedió el permiso; sin suscripción no llega nada.
- **iOS:** exige la PWA instalada en la pantalla de inicio; en Safari como pestaña no hay push.
- **Alcance:** el aviso de soporte va dirigido a `super_admin` (selecciona por rol, no a toda la empresa).
- **Ubicación de credenciales:**
  - Frontend: `VITE_VAPID_PUBLIC_KEY` (env var de Vercel, incrustada al compilar).
  - Server: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` como **secrets del proyecto Supabase** (`npx supabase secrets set`).
  - Las dos claves públicas deben ser el mismo valor; si no coinciden, las suscripciones nuevas no aceptan los envíos.
- **Sin botón de prueba:** el antiguo push de prueba del panel (edge Vercel `send-test-notification`) se retiró. La prueba se hace con un evento real, según el checklist del final.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 19/04 | Notificaciones duplicadas | Suscripción múltiple en `App.tsx` | `useEffect` único con des-suscripción |
| 25/08 | Push de soporte no llegaba | Secrets solo en Vercel, edge en Supabase | Secrets a nivel de proyecto Supabase |
| 25/08 | Player id no avanzaba | Campo `fcm_token` heredado | Renombrar a `onesignal_player_id` (migración 010) + backfill |
| 10/11 | El service worker nunca se instalaba | `icon-app.png` entraba dos veces en la precaché y Workbox abortaba | `includeManifestIcons: false` en `vite.config.ts` |
| 17/11 | El push de prueba del panel no llegaba nunca | La edge seguía hablando con OneSignal mientras la columna ya guardaba endpoints VAPID | Edge, botón y reescritura retirados |

## 7. Ejemplos de Uso

```typescript
// Cliente: pedir permiso y registrar la suscripción (desde un gesto del usuario)
const { enableNotifications } = useWebPush(currentUser, updatePushToken);
await enableNotifications(); // → fila en push_subscriptions

// Server (Edge Function): enviar a un usuario vía el helper compartido
import { sendPush } from '../_shared/push.ts';
await sendPush({ userId, title: 'Nueva orden', body: 'Te asignaron la orden 42', data: { path: `/orders/${orderId}` } });
```

## 8. Checklist de Pre-Ejecución
- [ ] `VITE_VAPID_PUBLIC_KEY` configurada en Vercel y la app recompilada.
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` configurados como secrets del proyecto Supabase, con la pública igual a la del cliente.
- [ ] Service worker registrado (en DevTools → Application → Service Workers).

## 9. Checklist Post-Ejecución
- [ ] Tras activar notificaciones en el encabezado, existe una fila en `push_subscriptions` para el usuario.
- [ ] Prueba real: crear un `support_ticket` y confirmar que al super_admin suscrito le llega el push.
