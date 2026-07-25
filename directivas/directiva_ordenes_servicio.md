# DIRECTIVA: GESTION_ORDENES_SERVICIO_SOP

> **ID:** 20260415_ORD_01
> **Script Asociado:** `src/components/order/OrderWorkflow.tsx`, `src/hooks/useOrderActions.ts`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Estandarizar el ciclo de vida de una Orden de Servicio (OS) desde su creación hasta el cierre contable y de garantía.
- **Criterio de Éxito:** Toda orden debe tener asociado un cliente, un técnico y al menos un equipo antes de ser completada. Al cerrar, debe actualizarse el estado de los equipos y registrarse el acta PDF.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **ID de Orden:** `string` (docId de Firestore).
- **Estado Inicial:** `PENDING`, `OPEN`, `IN_PROGRESS`, `DONE`, `CLOSED`, `CANCELLED`.
- **Datos de Cierre:** `closingData` (tareas realizadas, repuestos, firma del cliente).

### Salidas (Outputs)
- **Documento Firestore:** Actualizado con `status: CLOSED` y `endTime`.
- **Artefactos PDF:** Acta de servicio generada en `orders/{orderId}/acta_{timestamp}.pdf`.
- **Equipos:** Actualizados con `lastServiceDate` y `nextServiceDate` (según frecuencia).

## 3. Flujo Lógico (Algoritmo)

1. **Creación:** Generación de número correlativo (`maxNumber + 1`). Estado por defecto: `PENDING`.
2. **Asignación:** Vinculación de Técnico y Cliente.
3. **Inicio (Check-in):** Al presionar "Iniciar", se registra `startTime` y el estado pasa a `OPEN`.
4. **Ejecución:** Registro de evidencia (mínimo 2 fotos: Antes/Después). Registro de tareas realizadas.
5. **Cierre (Check-out):**
   - Captura de firma digital del cliente y del técnico.
   - Cálculo automático de garantía (por defecto 90 días desde `endTime`).
   - Invalación de caché contable (`sessionStorage.removeItem('accountingOrdersCache')`).
6. **Sincronización:** Actualización masiva de inventario/equipos vinculados.

## 4. Herramientas y Librerías
- **Hooks:** `useOrderActions` (Lógica de cierre), `useFileHandler` (Imágenes).
- **PDF:** `jspdf` + `jspdf-autotable` (vía `pdfGenerator.ts`).
- **Iconografía:** `Lucide React`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Modo Offline:** Si no hay internet, la orden se guarda en `indexedDB`. El PDF no puede generarse hasta que haya conexión (dependencia de Storage para logos/firmas remotas).
- **Firmas:** Si el técnico no tiene firma configurada en su perfil, el Acta no se genera.
- **Validación:** No se permite cerrar una orden sin el nombre del aprobador (`approverName`).

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Error al borrar orden | Referencias de Storage huérfanas | Implementada lógica recursiva de `listAll` y `deleteObject` en `OrderWorkflow.tsx`. |
| 15/04 | Número de orden duplicado | Colisión en creación simultánea | Implementada transacción de Firestore para el contador de órdenes. |

## 7. Ejemplos de Uso

```typescript
// Inicio de órden
const handleStart = () => updateItem('orders', id, { status: 'OPEN', startTime: now });
```

## 8. Checklist de Pre-Ejecución
- [ ] Cliente y Equipos correctamente vinculados.
- [ ] Técnico asignado con permisos de `technician` o superior.

## 9. Checklist Post-Ejecución
- [ ] Acta de servicio disponible en la pestaña de "Archivos".
- [ ] Fecha de próximo mantenimiento actualizada en el equipo.
- [ ] Notificación push enviada al administrador.
