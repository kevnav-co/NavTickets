# DIRECTIVA: NOTIFICACIONES_FCM_SOP

> **ID:** 20260415_NOTIF_01
> **Script Asociado:** `src/utils/firebase-messaging-init.ts`, `src/App.tsx`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Garantizar la entrega confiable de notificaciones push a técnicos y administradores para alertas de mantenimiento y asignación de tareas.
- **Criterio de Éxito:** Cada usuario autenticado en un navegador compatible debe tener un `fcmToken` válido registrado en su documento de Firestore.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Llave VAPID:** `BED4eP1e3O95scTlqCDXrsjCwM9FOoD4Z0WURxk7H5QDUgG4v43-ik1Mpt8jqSSr9sD8qpQLko-an14f1obSyTI`.
- **Navegador:** Requiere soporte para Service Workers y Push API.

### Salidas (Outputs)
- **Token FCM:** String único por dispositivo y navegador.
- **Notificación UI:** Alerta nativa del sistema o banner en la aplicación.

## 3. Flujo Lógico (Algoritmo)

1. **Permisos:** Al iniciar sesión, el sistema solicita permisos de notificación (`Notification.requestPermission()`).
2. **Registro:** Si se otorga el permiso, se registra el Service Worker (`firebase-messaging-sw.js`).
3. **Obtención de Token:** Se llama a `getToken()` usando la llave VAPID configurada.
4. **Almacenamiento:** El token se guarda en la colección `users/{userId}` bajo el campo `fcmToken`.
5. **Recepción en Primer Plano:** El hook `onMessage` en `App.tsx` captura el payload y lanza una `new Notification()` nativa.
6. **Renovación:** Cada vez que el usuario recarga la app con internet, se verifica si el token ha cambiado para actualizar Firestore.

## 4. Herramientas y Librerías
- **Firebase:** `firebase/messaging`.
- **Web API:** `Notification API`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Incógnito/iOS:** Algunos navegadores en modo incógnito o versiones antiguas de iOS pueden no soportar `isSupported()`. El sistema debe fallar silenciosamente sin bloquear la app.
- **Tokens Caducados:** Firebase puede invalidar tokens. La app intenta refrescar el token en cada inicio de sesión exitoso.
- **Multi-dispositivo:** Actualmente solo se guarda un token por usuario. Si el usuario inicia sesión en otro dispositivo, el token anterior se sobrescribe.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Notificaciones duplicadas | Suscripción múltiple en `App.tsx` | Se movió `onMessage` a un `useEffect` con retorno de des-suscripción. |
| 15/04 | Error VAPID en local | Dominio no autorizado en Firebase | Se agregaron `localhost` y dominios de staging a la configuración de Firebase Console. |
| 16/04 | Duplicación en Backend | Activación múltiple de triggers de Firestore | Se implementó idempotencia usando IDs deterministas en `sendAndCreateNotification`. |

## 7. Ejemplos de Uso

```typescript
// Registro manual desde consola para debug
import { getFCMToken } from './utils/firebase-messaging-init';
getFCMToken().then(token => console.log(token));
```

## 8. Checklist de Pre-Ejecución
- [ ] HTTPS habilitado (Requerido por Service Workers).
- [ ] `firebase-messaging-sw.js` presente en la raíz de `/public`.

## 9. Checklist Post-Ejecución
- [ ] Campo `fcmToken` verificado en Firestore.
- [ ] Prueba de envío desde Firebase Console exitosa.
