# DIRECTIVA: CONTABILIDAD_BALANCE_DUAL_SOP

> **ID:** 20260415_ACCT_01
> **Script Asociado:** `src/pages/Accounting.tsx`, `src/types/accounting.ts`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Gestionar con precisión los fondos de la empresa separando el flujo de dinero físico (Efectivo) del digital (Transferencia).
- **Criterio de Éxito:** El balance total debe ser siempre igual a la suma del saldo en Efectivo y el saldo en Transferencia. Cada movimiento debe quedar registrado con fecha, concepto y usuario responsable.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Concepto:** Descripción del movimiento.
- **Origen/Método:** `Efectivo` | `Transferencia`.
- **Monto:** Valor numérico positivo.
- **Participantes:** `senderId` (opcional), `recipientId` (opcional).

### Salidas (Outputs)
- **Movimiento Registrado:** Firestore document en `transactions`, `expenses` o `incomes`.
- **Balances Visuales:** Widgets de saldo en el dashboard financiero.

## 3. Flujo Lógico (Algoritmo)

1. **Selección de Acción:** El usuario elige entre Registrar Gasto, Ingreso o Transferencia.
2. **Definición de Origen:** Se especifica si el dinero sale/entra a la caja física (`Efectivo`) o a la cuenta bancaria (`Transferencia`).
3. **Cálculo de Saldo (Client-side):**
   - `Efectivo = Ingresos(E) - Gastos(E) - Salidas_Transferencias(E) + Entradas_Transferencias(E)`
   - `Transferencia = Ingresos(T) - Gastos(T) - Salidas_Transferencias(T) + Entradas_Transferencias(T)`
4. **Persistencia:** Se guarda el documento con un `Timestamp` de alta precisión.
5. **Agrupación:** Si una transferencia involucra el movimiento de un método a otro (ej: Retiro de cajero), se genera un `transactionGroupId` para vincular la salida de uno con la entrada del otro.

## 4. Herramientas y Librerías
- **Tipado:** Interfaces en `src/types/accounting.ts`.
- **Visualización:** Formato de moneda COP (Colombian Peso).

## 5. Restricciones y Casos Borde (Edge Cases)
- **Saldos Negativos:** El sistema debe alertar si un gasto supera el efectivo disponible, pero no debe bloquearlo (permite "gastos pendientes de reembolso").
- **Auditabilidad:** Los movimientos no se deben eliminar, solo se pueden anular con un movimiento de signo contrario.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Duplicidad en transferencias | Falta de ID de grupo | Implementado `transactionGroupId` para vincular movimientos espejo |
| 15/04 | Eliminación destructiva | Se borraron registros | Reemplazada eliminación por sistema de anulación (movimientos compensatorios) |

## 7. Ejemplos de Uso

```typescript
// Lógica de cálculo de balance
const cashBalance = useMemo(() => {
  const incomes = allMovements.filter(m => m.origin === 'Efectivo' && m.type === 'income');
  const expenses = allMovements.filter(m => m.origin === 'Efectivo' && m.type === 'expense');
  return sum(incomes) - sum(expenses);
}, [allMovements]);
```

## 8. Checklist de Pre-Ejecución
- [ ] Validar que los montos se guarden como `number` y no como `string`.
- [ ] Verificar que el `userName` se guarde denormalizado para evitar joins costosos.

## 9. Checklist Post-Ejecución
- [ ] Verificar que al registrar una transferencia entre cuentas, el balance total no cambie.
- [ ] Comprobar que los filtros por fecha funcionan correctamente.

## 10. Notas Adicionales
El sistema soporta una moneda fija (COP). Si se expande a otros países, se debe refactorizar el `formatCurrency` a un helper global.
