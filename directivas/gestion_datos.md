# DIRECTIVA: GESTION_DATOS_SOP

> **ID:** 20260415_DATA_01
> **Script Asociado:** `src/context/DataContext.tsx`, `src/hooks/useSupabaseQuery.ts`
> **Última Actualización:** 29/08/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Estandarizar el flujo de datos reactivos desde las tablas de Supabase hacia la UI, minimizando latencia y optimizando el uso de recursos.
- **Criterio de Éxito:** Los datos se actualizan automáticamente en la UI sin necesidad de refrescar, y el sistema maneja correctamente el estado de carga y error.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Tablas Supabase:** `orders`, `clients`, `equipment`, `inventory_items`.
- **Filtros:** Constraints de consulta (equivalente a where, orderBy, limit de Supabase PostgREST).

### Salidas (Outputs)
- **Data States:** Arrays de objetos TypeScript tipados.
- **Context API:** Acceso global a los datos a través de `useData()`.

## 3. Flujo Lógico (Algoritmo)

1. **Suscripción:** `useSupabaseQuery` abre una suscripción **Realtime de Supabase** + caché local.
2. **Normalización:** Las filas recibidas se mapean incluyendo el `id` en el objeto de datos (snake_case → camelCase).
3. **Persistencia Local:** Dexie/IndexedDB (`useOfflineCache`) guarda una copia en caché, permitiendo lecturas instantáneas en próximas cargas.
4. **Distribución:** `DataContext` centraliza las tablas más usadas (órdenes, clientes, técnicos) para que estén disponibles inmediatamente al navegar.
5. **Limpieza:** Al desmontar componentes se cancela la suscripción Realtime para evitar fugas de memoria.

## 4. Herramientas y Librerías
- **Datos:** Supabase client (`src/services/supabase.ts`) + `useSupabaseQuery` (realtime + caché Dexie).
- **State Management:** `React Context API` + `Hooks personalizados`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **RLS:** Las políticas de Supabase (RLS) bloquean lecturas si el usuario no pertenece al tenant / no tiene el rol (ver migraciones 004/005/009).
- **Offline Writes:** Las escrituras offline se encolan en la cola de sync (`useSyncManager`) y se sincronizan al recuperar conexión (upsert idempotente por `id`).
- **Límites de Consulta:** Evitar consultas que retornen más de 500 filas a la vez en la vista móvil.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Pantalla blanca en órdenes | ID de colección inválido | Añadida validación en `useCollection` para retornar nulo si el nombre está vacío |

## 7. Ejemplos de Uso

```typescript
// Uso del hook (useSupabaseQuery: realtime + caché Dexie)
const { data: orders } = useCollection<ServiceOrder>('orders', {
  table: 'orders',
  filters: [{ column: 'status', operator: 'eq', value: 'Pendiente' }],
  realtime: true,
});
```

## 8. Checklist de Pre-Ejecución
- [ ] Verificar que la tabla tenga el índice necesario en Supabase (o use `eq` simple) para los filtros usados.
- [ ] Validar tipado TypeScript en `src/types.ts`.

## 9. Checklist Post-Ejecución
- [ ] Confirmar que no hay errores de RLS ("permission denied" / 0 filas) en consola.
- [ ] Verificar que el componente se suscribe y desuscribe correctamente (usar React DevTools).

## 10. Notas Adicionales
Para datos que no cambian frecuentemente (ej: configuraciones), usar consultas sin Realtime (lista estática) para reducir costos.
