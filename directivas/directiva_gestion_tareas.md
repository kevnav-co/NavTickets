# DIRECTIVA: GESTION_TAREAS_SOP

> **ID:** 20260415_TASK_01
> **Script Asociado:** `src/components/task/Tasks.tsx`, `src/components/task/TaskDetailModal.tsx`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Facilitar la coordinación del equipo técnico mediante un sistema de tareas en tiempo real con soporte de dictado por voz.
- **Criterio de Éxito:** Las tareas deben actualizarse instantáneamente en todos los dispositivos de los participantes involucrados sin necesidad de recargar.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **ID de Usuario:** `string` (docId de Firestore).
- **Entrada de Voz:** Stream de audio convertido a texto via `Web Speech API`.
- **Filtro de Búsqueda:** Búsqueda reactiva por título de tarea.

### Salidas (Outputs)
- **Documento Firestore:** Actualizado en la colección `tasks`.
- **Sync Visual:** Re-ordenamiento automático (Pendientes arriba, Completados abajo).

## 3. Flujo Lógico (Algoritmo)

1. **Suscripción Reactiva:** Al montar el componente, se crea un `onSnapshot` filtrado por `participants array-contains [currentUser.id]`.
2. **Creación Rápida:**
   - Escribir en el textarea auto-expandible.
   - O usar el botón de micrófono para dictado ("Escuchando...").
3. **Distribución:** Al crear una tarea, se asigna por defecto al creador, pero puede editarse para asignar a `ALL` (todo el equipo) u otros usuarios específicos.
4. **Interacción:** El checkbox alterna el booleano `completed` directamente en Firestore.
5. **Detalle Colaborativo:** En el Modal, varios usuarios pueden editar notas o fechas límite simultáneamente.

## 4. Herramientas y Librerías
- **Firebase:** `query`, `onSnapshot`, `where`.
- **Web Speech API:** `SpeechRecognition` para dictado por voz.
- **UI:** CSS Masonry para el `viewMode: grid`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Dictado en Navegadores:** Safari y Firefox pueden requerir configuraciones especiales o no soportar `webkitSpeechRecognition`. El botón se deshabilita con un `alert` informativo.
- **Participantes Huérfanos:** Si un usuario es eliminado, sus tareas permanecen visibles para el resto de los participantes.
- **Orden de Clasificación:** Se prioriza: Importancia -> Estado (Pendiente vs Completado) -> Fecha de Creación (Descendente).

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Desborde de texto | Títulos muy largos en modo grid | Agregado `word-break: break-words` y `min-width: 0` al contenedor de tareas. |
| 15/04 | Fuga de memoria | `onSnapshot` no des-suscrito | Se añadió el retorno de la función de limpieza en el `useEffect`. |

## 7. Ejemplos de Uso

```bash
# Ejemplo de Filtro Firestore
where('participants', 'array-contains', userId)
```

## 8. Checklist de Pre-Ejecución
- [ ] Usuario autenticado con perfil activo.
- [ ] Conexión a internet persistente (Offline soporta caché pero no sync colaborativa).

## 9. Checklist Post-Ejecución
- [ ] Tarea visible en el dashboard de "Mis Tareas".
- [ ] Contador de tareas pendientes actualizado en el header.
