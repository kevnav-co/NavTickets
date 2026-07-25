# DIRECTIVA: GESTION_DATOS_SOP

> **ID:** 20260415_DATA_01
> **Script Asociado:** `src/context/DataContext.tsx`, `src/hooks/useCollection.ts`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Estandarizar el flujo de datos reactivos desde Firestore hacia la UI, minimizando latencia y optimizando el uso de recursos.
- **Criterio de Éxito:** Los datos se actualizan automáticamente en la UI sin necesidad de refrescar, y el sistema maneja correctamente el estado de carga y error.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Firestore Collections:** `orders`, `clients`, `equipment`, `inventory`.
- **Filtros:** Constraints de Firestore (where, orderBy, limit).

### Salidas (Outputs)
- **Data States:** Arrays de objetos TypeScript tipados.
- **Context API:** Acceso global a los datos a través de `useData()`.

## 3. Flujo Lógico (Algoritmo)

1. **Suscripción:** `useCollection` utiliza `onSnapshot` para abrir un canal de comunicación con Firestore.
2. **Normalización:** Los documentos recibidos se mapean incluyendo el `id` del documento en el objeto de datos.
3. **Persistencia Local:** Firestore guarda una copia en caché, permitiendo lecturas instantáneas en próximas cargas ("Latent Data Recognition").
4. **Distribución:** `DataContext` centraliza las colecciones más usadas (órdenes, clientes, técnicos) para que estén disponibles inmediatamente al navegar.
5. **Limpieza:** Al desmontar componentes, se ejecutan las funciones de `unsubscribe` para evitar fugas de memoria.

## 4. Herramientas y Librerías
- **Firebase SDK:** `firebase/firestore`.
- **State Management:** `React Context API` + `Hooks personalizados`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Reglas de Seguridad:** Firestore bloquea lecturas si el usuario no tiene los permisos adecuados (ver `firestore.rules`).
- **Offline Writes:** Las escrituras en modo offline se encolan y se sincronizan al recuperar conexión automáticamente por el SDK.
- **Límites de Consulta:** Evitar consultas que retornen más de 500 documentos a la vez en la vista móvil.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Pantalla blanca en órdenes | ID de colección inválido | Añadida validación en `useCollection` para retornar nulo si el nombre está vacío |

## 7. Ejemplos de Uso

```typescript
// Uso de hook personalizado
const { data: orders, loading } = useCollection<ServiceOrder>('orders', {
  constraints: [where('status', '==', 'Pendiente'), orderBy('createdAt', 'desc')]
});
```

## 8. Checklist de Pre-Ejecución
- [ ] Verificar índices compuestos en Firebase Console para consultas con múltiples filtros.
- [ ] Validar tipado TypeScript en `src/types.ts`.

## 9. Checklist Post-Ejecución
- [ ] Confirmar que no hay errores de "Permission Denied" en consola.
- [ ] Verificar que el componente se suscribe y desuscribe correctamente (usar React DevTools).

## 10. Notas Adicionales
Para datos que no cambian frecuentemente (ej: configuraciones), usar `getDocs` en lugar de `onSnapshot` para reducir costos.
