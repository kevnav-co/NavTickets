# DIRECTIVA: PERMISOS_ROLES_SOP

> **ID:** 20260415_PERM_01 (revisado)
> **Script Asociado:** `src/permissions.ts`, `src/context/AuthContext.tsx`, migraciones RLS 009/005
> **Última Actualización:** 29/08/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Definir y controlar el acceso a las funcionalidades del sistema según el perfil del usuario (RBAC).
- **Criterio de Éxito:** Un usuario solo accede a las rutas y acciones que su rol permite. El acceso se bloquea en **dos capas**: UI (`permissions.ts`) y base de datos (**RLS / migración 009**).

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **User Role:** Atributo `role` en la fila `users` (resuelto desde `auth.users` vía `supabase_auth_id`).
- **Permission Key:** Identificadores únicos (ej: `view_all_orders`, `view_inventory`).

### Salidas (Outputs)
- **Booleano:** Resultado de `hasPermission(role, permission)` (UI) y de `public.user_can(permiso)` (DB).
- **UI Components / RLS policies:** Elementos visibles y filas insertables/actualizables según el rol.

## 3. Flujo Lógico (Algoritmo)

1. **Login:** El usuario se autentica con **Supabase Auth** (`username@EMAIL_DOMAIN`).
2. **Carga de Perfil:** Se obtiene el `users.role` del usuario autenticado.
3. **Mapeo:** `ROLES_PERMISSIONS` en `src/permissions.ts` para la UI; RLS granular (`009_role_enforced_rls.sql`) para la DB.
4. **Validación UI:** componentes usan `hasPermission(...)` / `getUserPermissions(user)`.
5. **Validación DB:** las políticas `INSERT/UPDATE/DELETE` exigen `company_id = current_company_id()` y el rol correcto (helper `public.user_can`).
6. **Visibilidad de pestañas:** `isTabVisible(component, role, features)` (única fuente, ver §5).

## 4. Herramientas y Librerías
- **UI / Lógica:** `src/permissions.ts` (permisos, `TAB_PERMISSION_MAP`, `TAB_FEATURE_MAP`, `isTabVisible`).
- **Backend (real):** **PostgreSQL RLS** en Supabase — helpers `public.current_company_id()`, `public.current_user_role()`, `public.user_can(permiso)` (migraciones 004/005/009). Ya **no** se usan Firestore Security Rules.

## 5. Roles y Permisos Definidos

### Roles
1. **technician**: sus órdenes/tareas, inicia/completa; **lee inventario** (no edita stock).
2. **supervisor**: todas las órdenes + asignación, clientes/equipos, mapa de técnicos.
3. **aux_admin**: igual que supervisor.
4. **admin**: control total de **su empresa** (branding, datos, inventario, informes).
5. **developer**: igual que admin + herramientas de depuración.
6. **super_admin**: multi-empresa (gestión de empresas/usuarios/soporte).

### Permisos relevantes de Fase 6
| Permiso | Alcance |
|---------|---------|
| `VIEW_INVENTORY` / `CREATE_INVENTORY` / `UPDATE_INVENTORY` / `DELETE_INVENTORY` | Stock. Edición solo `admin`/`developer`/`super_admin`; `supervisor`/`aux_admin`/`technician` solo lectura |
| `VIEW_REPORTS` | Módulo Informes/Export (`/reports`) y tab `accounting` |

### Fuente única de visibilidad de pestañas (Fase 5)
En `src/permissions.ts`:
- `TAB_PERMISSION_MAP` — permiso que exige cada tab built-in (incluye `inventory` → `VIEW_INVENTORY`, `reports` → `VIEW_REPORTS`, `accounting` → `VIEW_REPORTS`).
- `TAB_FEATURE_MAP` — flag de feature exigido (`equipment`→`equipmentManagement`, `map`→`maps`, `accounting`→`accounting`).
- `isTabVisible(component, role, features)` — **NO dupliques** esta lógica en los navs; ambos deben usar este helper.

## 6. Restricciones y Casos Borde
- Un cambio de `role` en la DB requiere recargar la app para refrescar el contexto de React.
- La RLS opera sobre el **tenant** (`company_id` del usuario autenticado): el create debe incluir `companyId` en el payload (ver §7).

## 7. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 19/04 | Técnico editando órdenes cerradas | Falta de validación en UI | Añadido permiso `update_closed_order` + validación en botón Guardar |
| 29/08 | Creates de clientes/equipos/inventario insertaban 0 filas | `addItem` no inyecta `companyId` y la RLS lo exige | Inyectar `currentUser.companyId` en el payload y validar con `Schema.omit({ id: true })` |

## 8. Ejemplos de Uso

```typescript
import { hasPermission, isTabVisible } from '../permissions';

if (hasPermission(role, PERMISSIONS.UPDATE_INVENTORY)) {
  // mostrar botón de editar stock
}
const { visible } = isTabVisible('inventory', role, company.features); // tab visible?
```

## 9. Checklist de Pre-Ejecución
- [ ] Nuevo permiso agregado a `PERMISSIONS` y a los `ROLES_PERMISSIONS` que correspondan.
- [ ] Si el permiso gobierna una pestaña built-in, agregarlo a `TAB_PERMISSION_MAP`.
- [ ] Si la DB debe exigirlo, crear la política RLS (patrón `user_can`, migración 009) y aplicar con `npx supabase db push`.

## 10. Checklist Post-Ejecución
- [ ] Probar que un 'technician' no ve el botón 'Editar stock'.
- [ ] Validar que un 'admin' pueda insertar con `companyId` y que un cross-tenant devuelva 0 filas (`scripts/verify-inventory-rls.mjs`).

## 11. Notas Adicionales
La UI es solo experiencia de usuario. La seguridad **real** vive en la RLS de Supabase (`users.role` vía `supabase_auth_id`, nunca en claims del JWT).