# DIRECTIVA: NOTIFICACIONES_PUSH_SOP (antes FCM)

> **ID:** 20260415_NOTIF_01 (revisado)
> **Script Asociado:** `src/hooks/useOneSignal.ts`, `src/sw.ts`, edge `support-notify`, migraciones 010/011
> **Última Actualización:** 29/08/2026
> **Estado:** ACTIVO

> **Cambio de proveedor:** las notificaciones push ya **no** usan Firebase Cloud Messaging. Se migraron a **OneSignal** (cliente + server-side). El campo `users.onesignal_player_id` reemplaza al viejo `fcm_token` (backfill en migración 010). Esta directiva documenta el flujo actual.

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Garantizar la entrega confiable de notificaciones push a técnicos y administradores para alertas de mantenimiento, asignación de tareas y **soporte**.
- **Criterio de Éxito:** Cada usuario suscrito por PWA instalada recibe el push correspondiente (ej. aviso de consulta de soporte al super_admin).

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **OneSignal App ID (cliente):** `VITE_ONESIGNAL_APP_ID` (frontend, horneado al buildar).
- **Secrets server-side (proyecto Supabase):** `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` (REST key `os_v2_app_…`), leídos por el edge `support-notify`.
- **Player ID:** `users.onesignal_player_id`, guardado tras la suscripción del dispositivo.

### Salidas (Outputs)
- **Notificación push:** alerta nativa entregada por OneSignal al/los dispositivo(s) suscrito(s).

## 3. Flujo Lógico (Algoritmo)

1. **Suscripción (cliente):** `useOneSignal.ts` (montado desde `Header`) suscribe con `VITE_ONESIGNAL_APP_ID` y guarda `onesignal_player_id` en el `users` del usuario.
2. **Disparo (server):** un evento de negocio dispara el envío. Soporte usa el edge `support-notify`, activado por un **trigger de BD** (pg_net, migración 011) en `INSERT` de `support_tickets`.
3. **Envío:** el edge manda el push a OneSignal con sus secrets (`ONEOSIGNAL_APP_ID/API_KEY`) autenticando contra los `player_id` de los destinatarios (super_admins suscritos).
4. **Recepción (PWA):** el service worker (`src/sw.ts`) maneja el evento `push` nativo — fiable en iOS PWA.

## 4. Herramientas y Librerías
- **Cliente:** `@onesignal/react-native` / OneSignal Web SDK (`useOneSignal`).
- **Server:** Edge Functions de **Supabase** (`fetch` a la REST API de OneSignal) + pg_net para el trigger.
- **Service Worker:** API nativa `push` (no FCM).

## 5. Restricciones y Casos Borde
- **Solo PWA instalada:** el push alcanza a usuarios **suscritos** por PWA instalada; quien no suscriba no recibe nada.
- **iOS:** en iOS la entrega llega vía push nativo del SW, no `isSupported()` de FCM.
- **Alcance:** el aviso de soporte va dirigido a `super_admin` (selecciona por rol, no a toda la empresa).
- **Landing de credenciales**: 
  - Frontend: `VITE_ONESIGNAL_APP_ID` (env var de Vercel, horneada al buildar).
  - Server: `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` como **secrets de proyecto Supabase** (`npx supabase secrets set`).
  - Botón de prueba del panel admin: el edge Vercel `send-test-notification` usa las mismas, pero desde las env vars de **Vercel**.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 19/04 | Notificaciones duplicadas | Suscripción múltiple en `App.tsx` | `useEffect` único con des-suscripción |
| 25/08 | Push de soporte no llegaba | Secrets solo en Vercel, edge en Supabase | Setearse secrets ONESIGNAL a nivel de proyecto Supabase |
| 25/08 | Player id no avanzaba | Campo `fcm_token` heredado | Renombrar a `onesignal_player_id` (migración 010) + backfill |

## 7. Ejemplos de Uso

```typescript
// Cliente: suscribir y persistir el player id
const { errors } = useOneSignal();
// → persiste users.onesignal_player_id

// Server (edge): enviar push a un player id
// POST a https://api.onesignal.com/notifications con headers:
//   Authorization: Basic <ONESIGNAL_API_KEY>
```

## 8. Checklist de Pre-Ejecución
- [ ] `VITE_ONESIGNAL_APP_ID` seteadO en el frontend (Vercel) para que suscriba.
- [ ] `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` seteados como secrets del proyecto Supabase.
- [ ] PWA instalada en el dispositivo de prueba.

## 9. Checklist Post-Ejecución
- [ ] `users.onesignal_player_id` verificado tras login.
- [ ] Edad de prueba: crear un `support_ticket` y confirmar que al super_admin suscrito le llega el push.