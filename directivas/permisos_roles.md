# DIRECTIVA: PERMISOS_ROLES_SOP

> **ID:** 20260415_PERM_01
> **Script Asociado:** `src/permissions.ts`, `src/context/AuthContext.tsx`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Definir y controlar el acceso a las funcionalidades del sistema según el perfil del usuario (RBAC).
- **Criterio de Éxito:** Un usuario solo puede acceder a las rutas y realizar las acciones que su rol le permite. Intentos de acceso no autorizado deben ser bloqueados por la UI y Firestore.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **User Role:** Atributo `role` en el documento del usuario en Firestore.
- **Permission Key:** Identificadores únicos (ej: `view_all_orders`).

### Salidas (Outputs)
- **Booleano:** Resultado de la función `hasPermission(role, permission)`.
- **UI Components:** Elementos visibles u ocultos basados en permisos.

## 3. Flujo Lógico (Algoritmo)

1. **Login:** El usuario se autentica vía Firebase Auth.
2. **Carga de Perfil:** Se obtiene el documento del usuario desde la colección `users` para conocer su `role`.
3. **Mapeo:** Se consulta el objeto `ROLES_PERMISSIONS` en `src/permissions.ts`.
4. **Validación:** Cada componente que requiere protección utiliza el hook `getUserPermissions(user)` o `hasPermission()`.
5. **Bloqueo:** Si el usuario no tiene el permiso, el componente retorna nulo o redirige al Dashboard.

## 4. Herramientas y Librerías
- **Sistema Local:** `permissions.ts` (Lógica de negocio).
- **Backend:** `Firestore Security Rules` (Seguridad a nivel de base de datos).

## 5. Restricciones y Casos Borde (Edge Cases)

### Roles Definidos:
1. **technician**: Solo ve sus propias órdenes y tareas.
2. **supervisor**: Ve todas las órdenes y rastreo de técnicos a cargo.
3. **admin**: Control total administrativo.
4. **aux_admin**: Similar a supervisor pero con acceso a reportes específicos.
5. **developer**: Acceso total + herramientas de depuración.

### Limitaciones:
- Un cambio de rol en base de datos requiere que el usuario refresque la aplicación para actualizar el contexto de React (a menos que se use un listener activo).

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Técnico editando órdenes cerradas | Falta de validación en UI | Añadido permiso `update_closed_order` y validación en botón Guardar |

## 7. Ejemplos de Uso

```typescript
import { hasPermission, ROLES } from '../permissions';

if (hasPermission(currentUser.role, PERMISSIONS.DELETE_ORDER)) {
  // Mostrar botón de eliminar
}
```

## 8. Checklist de Pre-Ejecución
- [ ] Asegurarse de que el nuevo rol esté presente en el enum `ROLES`.
- [ ] Sincronizar las reglas de Firestore con los cambios en `permissions.ts`.

## 9. Checklist Post-Ejecución
- [ ] Probar con un usuario tipo 'technician' que no vea el botón 'Eliminar Orden'.
- [ ] Validar que un 'supervisor' pueda ver el mapa de técnicos.

## 10. Notas Adicionales
La seguridad del lado del cliente (UI) es solo para experiencia de usuario. La seguridad REAL debe implementarse en `firestore.rules`.
