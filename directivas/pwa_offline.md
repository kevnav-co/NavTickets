# DIRECTIVA: PWA_OFFLINE_OPERATIONS_SOP

> **ID:** 20260415_PWA_01
> **Script Asociado:** `public/sw.js`, `src/hooks/useOfflineStatus.ts`, `src/services/messaging.ts`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Garantizar la operatividad del sistema en zonas con conectividad limitada o nula, permitiendo a los técnicos completar órdenes de servicio offline.
- **Criterio de Éxito:** La aplicación debe abrirse sin internet (si fue cargada previamente), permitir capturar evidencia fotográfica y sincronizar los cambios automáticamente al recuperar la señal.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Latitud/Longitud:** Coordenadas GPS del dispositivo.
- **Push Tokens:** FcmTokens generados por el navegador/OS.
- **Firestore Cache:** Datos persistidos en el almacenamiento local del navegador.

### Salidas (Outputs)
- **Service Worker:** Control del caché de activos estáticos.
- **Notificaciones:** Mensajes nativos en el dispositivo del técnico/supervisor.
- **Tracking:** Registro de ubicación en `users/{id}/location`.

## 3. Flujo Lógico (Algoritmo)

1. **Instalación de SW:** Al cargar `main.tsx`, se registra el service worker que cachea el bundle de la aplicación.
2. **Persistence Firestore:** Se habilita `enableIndexedDbPersistence` el inicializar Firebase.
3. **Detección de Conexión:** El hook `useOfflineStatus` monitorea `navigator.onLine` y muestra banners de advertencia.
4. **FCM Subscription:** Si el usuario acepta permisos, se solicita un token a Firebase Messaging y se asocia a su perfil.
5. **GPS Tracking:** Un interval activo cada X minutos obtiene la posición GPS y la actualiza en tiempo real para visualización en el mapa de supervisores.

## 4. Herramientas y Librerías
- **PWA:** `Service Workers API`, `Manifest.json`.
- **FCM:** `firebase/messaging`.
- **Geolocalización:** `navigator.geolocation`.

## 5. Restricciones y Casos Borde (Edge Cases)

### Limitaciones:
- **Imágenes:** Las imágenes capturadas offline se almacenan como `Blob` en IndexedDB hasta que haya conexión para subirlas a Firebase Storage.
- **Permisos:** La geolocalización y notificaciones requieren aprobación explícita del usuario por seguridad del navegador.

### Errores Comunes:
- **Caché Corrupto:** Si se despliega una nueva versión y el SW no se actualiza, el usuario puede ver contenido antiguo. Se debe usar el evento `onServiceWorkerUpdate`.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Falta de notificaciones en iOS | PWA no instalada | Documentado que en iOS es obligatorio "Añadir a pantalla de inicio" para habilitar Push |

## 7. Ejemplos de Uso

```typescript
// Detección de estado offline
const isOffline = useOfflineStatus();
return isOffline ? <OfflineBanner /> : null;
```

## 8. Checklist de Pre-Ejecución
- [ ] Validar que el archivo `public/manifest.json` tenga todos los íconos necesarios.
- [ ] Configurar el `VAPID_KEY` para Firebase Messaging.

## 9. Checklist Post-Ejecución
- [ ] Poner el navegador en "Offline" desde DevTools y verificar que la app sigue funcionando.
- [ ] Enviar una notificación de prueba desde el panel de Firebase.

## 10. Notas Adicionales
El rastreo GPS consume batería. Se recomienda implementar un "Active Check" que solo rastree si el técnico tiene una orden en progreso (`En Progreso`).
