# Contract — NavTicket API functions

Contrato que el fix de tipos NO debe alterar en runtime. Verificación estática: compilación limpia bajo esta interface.

## Edge functions (`api/edge/*.ts`)

- Cada módulo **MUST** exportar `config = { runtime: 'edge' }`.
- Cada módulo **MUST** exportar un handler por defecto `(req: Request) => Promise<Response>`.
- `process.env.*` **MUST** resolver en typecheck (tipos Node disponibles).
- CORS: responder `OPTIONS` con 200 + CORS headers; métodos no permitidos → `405`.

| Endpoint | Método | Propsósito |
|----------|--------|-----------|
| `on-task-assigned` | POST | Webhook de trigger: notifica al asignado/creador de una tarea |
| `on-order-assigned` | POST | Webhook: notifica asignación de orden |
| `daily-expiration-check` | GET/trigger | Alerta mantenimiento/garantía por vencer + envía email/notificación |
| `send-test-notification` | POST | Envía push de prueba (OneSignal) |
| `update-user-password` | POST | Cambio admin de contraseña de usuario |
| `cuenti-proxy` | GET | Proxy de datos de clientes (Cuenti ERP) |

## Node functions (`api/*.ts`, `api/cron/*.ts`)

- Leen variables de entorno `process.env.*` (Supabase URL/keys, Twilio, Gmail, Cuenti).
- `api/cron/*` expuestos como endpoint invocable por scheduler (Vercel Cron).

## Dependencia de tipos

`api/tsconfig.json` **MUST** declarar `"types": ["node", "@vercel/node"]` para que `process`, `Request`, `Response` resuelvan en todos los módulos.