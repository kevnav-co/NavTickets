# DIRECTIVA: [NAVAS_OPTIMIZACION_SERVICIOS_COSTOS]

> **ID:** 20240523_OPT_SERV
> **Script Asociado:** `src/utils/productUtils.ts`, `src/hooks/usePaginatedCollection.ts`
> **Última Actualización:** 2024-05-23
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
Esta directiva establece los estándares para la manipulación de datos financieros (costos, precios) y la recuperación eficiente de órdenes de servicio en la aplicación Navas.
- **Objetivo Principal:** Garantizar que los cálculos de rentabilidad y alertas de inventario sean consistentes y que la carga de datos en Firestore esté optimizada mediante caché y paginación.
- **Criterio de Éxito:** Las utilidades deben pasar el 100% de las pruebas unitarias y las peticiones a Firestore deben reducirse en un 30% en escenarios de navegación repetida.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Datos de Excel:** Filas crudas del componente `IntelligenceEngine` con columnas como "Precio de Compra", "Saldo Actual", etc.
- **Queries de Firestore:** Paretros de `usePaginatedCollection` (nombre de colección y constraints).

### Salidas (Outputs)
- **Objetos Normalizados:** Productos con tipos de datos correctos (`number` para costos) y flags de estado (`isLowStock`).
- **Estados de Hook:** Datos paginados con soporte de caché transparente.

## 3. Flujo Lógico (Algoritmo)

1. **Pre-procesamiento de Costos:**
   - Limpiar strings de moneda (quitar símbolos, comas).
   - Convertir a número con fallback a 0.
2. **Validación de Inventario:**
   - Aplicar regla de "Stock Bajo" (Stock < 5 por defecto).
3. **Caché de Paginación:**
   - Generar una clave única basada en `collectionName` y `JSON.stringify(constraints)`.
   - Si la clave existe en el Map de caché y no ha expirado, retornar datos cacheados.
   - Si no, proceder con `getDocs` y actualizar caché.

## 4. Herramientas y Librerías
- **Vite/React:** Core de la UI.
- **Firebase Firestore:** Persistencia.
- **Vitest:** Pruebas unitarias.
- **XLSX:** Procesamiento inicial de archivos.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Valores Nulos:** Cualquier costo o precio nulo debe tratarse como 0 para evitar errores de NaN en el dashboard.
- **Inconsistencia de Columnas:** El importador de Excel debe ser flexible con nombres de columnas (ej: "Código" vs "Codigo").
- **Huso Horario:** Los cálculos de garantía deben normalizarse a UTC para evitar desfases de un día.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 23/05 | NaN en Precios | Comas en strings de Excel | Añadir regex de limpieza en `parseCurrency` |

## 7. Checklist de Pre-Ejecución
- [ ] Validar que `vitest` esté instalado en `devDependencies`.
- [ ] Verificar que las utilidades no tengan dependencias circulares con los hooks.

## 8. Checklist Post-Ejecución
- [ ] Pruebas unitarias ejecutadas exitosamente.
- [ ] Dashboard verificado visualmente en entorno de desarrollo.
