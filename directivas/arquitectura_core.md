# DIRECTIVA: ARQUITECTURA_CORE_SOP

> **ID:** 20260415_ARCH_01
> **Script Asociado:** `App.tsx`, `main.tsx`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Definir la estructura fundamental de la aplicación Navas, basada en React y Supabase, asegurando escalabilidad y soporte PWA.
- **Criterio de Éxito:** La aplicación debe cargar de forma optimizada mediante lazy loading, manejar estados globales de forma eficiente y persistir datos localmente.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Configuración Supabase:** Credenciales en `src/services/supabase.ts`.
- **Variables de Entorno:** `.env` con `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.

### Salidas (Outputs)
- **Renderizado UI:** SPA optimizada con `React.lazy` y `Suspense`.
- **Persistencia:** Caché offline en Dexie/IndexedDB (useOfflineCache) habilitada para uso offline.

## 3. Flujo Lógico (Algoritmo)

1. **Bootstrap:** `main.tsx` inicializa React y monta el componente `App`.
2. **Contextos:** `AuthContext`, `DataContext` y `ModalContext` envuelven la aplicación para proveer identidad, datos y UI global.
3. **Routing:** Uso de `react-router-dom` para navegación fluida.
4. **Lazy Loading:** Las páginas principales (Dashboard, Orders, Inventory, Accounting) se cargan bajo demanda para reducir el bundle inicial.
5. **PWA hooks:** Registro de Service Worker para habilitar instalación y cacheo.

## 4. Herramientas y Librerías
- **Frontend:** `React 18+`, `Vite`, `TypeScript`.
- **BaaS:** `Supabase` (Auth, Postgres, Storage, OneSignal para push).
- **Styling:** `Vanilla CSS` + `Lucide React` (Iconos).
- **Charts:** `Recharts`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Reactivos:** Supabase debe usarse con suscripciones Realtime de Supabase (useSupabaseQuery) para reflejar cambios en tiempo real.
- **Peso:** Evitar importar librerías pesadas en el bundle principal.
- **Conexión:** Manejar estados de "Sin Conexión" visualmente para el usuario.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Carga lenta inicial | Bundle de Accounting pesado | Implementado `React.lazy` para Accounting y Reportes |
| 15/04 | Pérdida de datos en edición | Refresco de página en formulario | Implementada persistencia en `localStorage` dentro de `useOrderForm.ts` para el modo edición. |
| 15/04 | Colisión de snapshots | Múltiples suscriptores al mismo path | Centralización obligatoria en `DataContext.tsx` usando una única suscripción Realtime de Supabase por tabla. |

## 7. Ejemplos de Uso

```bash
# Desarrollo local
npm run dev

# Construcción para producción
npm run build
```

## 8. Checklist de Pre-Ejecución
- [ ] Configurar Supabase project en consola.
- [ ] Validar que `supabase.ts` no expone secretos directamente (usar .env).
- [ ] Instalar dependencias con `npm install`.

## 9. Checklist Post-Ejecución
- [ ] Verificar que el Service Worker se registra correctamente.
- [ ] Comprobar que el modo offline carga los datos en caché.
- [ ] Validar que el lazy loading funciona en la pestaña Network.

## 10. Notas Adicionales
El proyecto utiliza un sistema de `DataContext` que centraliza todas las suscripciones Realtime de Supabase para evitar múltiples oyentes innecesarios.
