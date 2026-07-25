# NavTickets - Sistema de Gestión Industrial

Aplicación profesional para la gestión de mantenimiento industrial, basada en Navas y optimizada como Progressive Web App (PWA).

## 🚀 Despliegue en GitHub y Firebase

Para que la aplicación funcione correctamente y se pueda instalar en dispositivos móviles (Android/iPhone), debes configurar los secretos en GitHub.

### 1. Preparar el Repositorio
1. **Crear Repositorio:** Crea un nuevo repositorio en GitHub.
2. **Subir Código:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/navas-app.git
   git push -u origin main
   ```

### 2. Configurar Secretos de GitHub (OBLIGATORIO)
Para que el despliegue automático funcione y los mapas operen, ve a tu repositorio en GitHub:
1. Pestaña **Settings** > **Secrets and variables** > **Actions**.
2. Haz clic en **New repository secret**.
3. Agrega exactamente estos secretos:

### 3. Configuración en Google Cloud Console
Para quitar el error "Esta página no ha cargado Google Maps correctamente":
1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Selecciona tu proyecto.
3. Ve a **API y servicios** > **Biblioteca**.
4. Busca y activa: **Maps JavaScript API**, **Places API** y **Geocoding API**.
5. Asegúrate de tener una **cuenta de facturación** vinculada (obligatorio para Maps, aunque sea el nivel gratuito).

---

## 📱 Guía de Instalación en Móviles

### En Android (Google Chrome)
1. Abre la URL de tu app en Chrome.
2. Toca los **tres puntos** (menú) arriba a la derecha.
3. Selecciona **"Instalar aplicación"**.

### En iPhone / iOS (Safari)
1. Abre la URL en **Safari**.
2. Toca el botón de **Compartir** (cuadrado con flecha hacia arriba).
3. Selecciona **"Agregar al inicio"**.

---

## 🛠️ Tecnologías

- **Frontend:** React 18 + TypeScript + Vite
- **Estilos:** Tailwind CSS
- **PWA:** Vite Plugin PWA + Workbox
- **Backend:** Firebase (Firestore, Auth, Storage, Messaging)
- **Mapas:** Leaflet
- **PDF:** jsPDF + html2canvas
- **Excel:** SheetJS (xlsx)

---

## 📋 Descripción del Sistema

**NavTickets** es un sistema de gestión de servicios de campo (Field Service Management) para mantenimiento de equipos industriales. Permite gestionar órdenes de servicio, clientes, equipos, técnicos y tareas con soporte offline-first.

### Características Principales

- **Offline-First**: Funciona sin conexión a internet mediante Service Worker y caché Firestore
- **GPS Tracking**: Actualización de ubicación de técnicos cada 10 minutos
- **Push Notifications**: Notificaciones push via Firebase Cloud Messaging
- **Firmas Digitales**: Captura de firma para técnicos y clientes
- **Workflow de Órdenes**: Pendiente → En Progreso → Cerrado (con garantía)
- **Dashboard**: KPIs, gráficos de productividad, calendario global
- **Mapa de Clientes**: Visualización geoespacial con Leaflet
- **Gestión de Equipos**: Mantenimiento preventivo/correctivo

---

## 🏗️ Arquitectura

### Estructura de Carpetas

```
src/
├── components/
│   ├── account/         # Módulo contable (solo developer)
│   ├── auth/            # Login y autenticación
│   ├── client/          # Gestión de clientes (CRUD)
│   ├── dashboard/      # Dashboard, KPIs, gráficos
│   ├── equipment/      # Gestión de máquinas/equipos
│   ├── layout/         # Header, Sidebar, Navigation
│   ├── map/            # Mapa de clientes (Leaflet)
│   ├── order/          # Órdenes de servicio y workflow
│   ├── shared/         # Componentes reutilizables (modales)
│   ├── task/           # Tareas personales
│   ├── ui/             # Componentes UI base
│   └── user/           # Gestión de usuarios
├── context/            # React Context (Auth, Data, Modal)
├── hooks/              # Custom hooks (Firestore, GPS, etc)
├── services/           # Firebase services
├── types/              # TypeScript interfaces
└── utils/              # Utilidades (PDF, fechas, etc)
```

### Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ AuthContext │  │ DataContext │  │   ModalContext      │  │
│  │  (Firebase  │  │ (Firestore  │  │  (UI State)         │  │
│  │   Auth)     │  │   + Cache)  │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                │                     │
    ┌─────▼─────┐   ┌─────▼─────┐        ┌─────▼─────┐
    │  Hooks    │   │  Hooks     │        │ Components│
    │ useAuth   │   │ useData    │        │ (Routes)  │
    └───────────┘   │ useFirestore│       └───────────┘
                    │ useCollection│
                    └─────────────┘
```

### Modelo de Estados

- **AuthContext**: Autenticación de usuarios via Firebase Auth
- **DataContext**: Datos de Firestore (clientes, órdenes, equipos, usuarios)
- **ModalContext**: Estado de modales y UI global

---

## 📦 Entidades Principales

| Entidad | Descripción | Colección Firestore |
|---------|-------------|---------------------|
| **User** | Técnicos, administradores, supervisores | `users` |
| **Client** | Clientes con ubicación GPS | `clients` |
| **Equipment** | Máquinas/equipos por cliente | `equipment` |
| **ServiceOrder** | Órdenes de servicio | `orders` |
| **Task** | Tareas con recordatorios | `tasks` |
| **AppNotification** | Notificaciones del sistema | `notifications` |

### Relaciones entre Entidades

```
Client (1) ──────< Equipment (N)
                       │
                       │ (N)
                 ServiceOrder
                       │
                       │ (1)
                    User (technicianId)
```

---

## 🔐 Sistema de Permisos (RBAC)

### Roles de Usuario

| Rol | Descripción | Permisos |
|-----|-------------|-----------|
| `technician` | Técnico de campo | Ver propias órdenes, iniciar/completar tareas |
| `supervisor` | Supervisor de técnicos | Ver todas las órdenes, asignar, gestionar clientes |
| `aux_admin` | Admin auxiliar | Same as supervisor |
| `admin` | Administrador total | Acceso completo |
| `developer` | Desarrollador | Acceso total + módulo contable |

### Permisos Definidos

```typescript
// src/permissions.ts
const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_ADMIN_WIDGETS: 'view_admin_widgets',
  VIEW_REPORTS: 'view_reports',
  
  // Órdenes
  CREATE_ORDER: 'create_order',
  ASSIGN_ORDER: 'assign_order',
  UPDATE_ORDER: 'update_order',
  DELETE_ORDER: 'delete_order',
  VIEW_ALL_ORDERS: 'view_all_orders',
  START_FINISH_ORDER: 'start_finish_order',
  
  // Clientes/Equipos
  CREATE_CLIENT: 'create_client',
  VIEW_CLIENTS: 'view_clients',
  CREATE_EQUIPMENT: 'create_equipment',
  VIEW_EQUIPMENT: 'view_equipment',
  
  // Usuarios
  VIEW_USERS: 'view_users',
  CREATE_USER: 'create_user',
  UPDATE_USER: 'update_user',
  
  // Mapa
  VIEW_MAP: 'view_map',
  VIEW_TEAM_LOCATIONS_MAP: 'view_team_locations_map',
};
```

---

## 🔄 Workflow de Órdenes de Servicio

### Estados

```typescript
enum OrderStatus {
  PENDING = 'Pendiente',
  OPEN = 'En Progreso',
  CLOSED = 'Cerrado'
}
```

### Flujo

```
┌────────────┐    ┌──────────┐    ┌────────────┐
│  Pendiente │───▶│En Progreso│───▶│  Cerrado   │
└────────────┘    └──────────┘    └────────────┘
     ↓                 ↓                 ↓
  Asignar          Iniciar            Cerrar con:
  técnico          orden              - Firmas
  Equipos          Evidencia          - Photos
  Cliente          inicial             - Tasks
                   Reabrir             Garantía
                   (warranty)
```

### Datos de Cierre

```typescript
closingData?: {
  tasksPerformed?: string[];           // Tareas realizadas
  additionalComments?: string;         // Comentarios adicionales
  approverName?: string;               // Nombre approve
  approverId?: string;                 // ID approve
  technicianSignature?: string;       // Firma técnico
  clientSignature?: string;           // Firma cliente
  evidenceImages?: (string | Blob)[]; // Fotos evidencia
  closingDescription?: string;         // Descripción cierre
};
```

---

## 📡 APIs y Servicios

### Firebase Services

```typescript
// src/services/firebase.ts
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { 
  localCache: persistentLocalCache({})  // Offline cache
});
export const storage = getStorage(app);
export const messaging = getMessaging(app);
export const realtimeDB = getDatabase(app);
```

### Hooks Personalizados

| Hook | Descripción |
|------|-------------|
| `useCollection` | Suscripción reactiva a colección Firestore |
| `useDataFetching` | Obtención centralizada de datos |
| `useFirestoreActions` | CRUD genérico |
| `useStorage` | Subida de archivos con compresión |
| `useFileHandler` | Manejo de archivos online/offline |
| `useOfflineStatus` | Detección de conectividad |
| `useOrderActions` | Acciones complejas de órdenes |
| `useConnectivityStatus` | Estado de conexión |

---

## 📱 Rutas de la Aplicación

| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/` | Dashboard | KPIs, calendario, gráficos |
| `/tasks` | Tasks | Tareas personales |
| `/accounting` | Accounting | Módulo contable (solo developer) |
| `/orders` | OrderList | Lista de órdenes |
| `/orders/new` | NewOrder | Crear orden |
| `/orders/:id` | OrderWorkflow | Workflow de orden |
| `/clients` | ClientManager | Lista de clientes |
| `/clients/new` | ClientForm | Crear cliente |
| `/clients/:id` | ClientDetail | Detalle cliente |
| `/equipment` | EquipmentManager | Lista de equipos |
| `/equipment/:id` | EquipmentDetail | Detalle equipo |
| `/users` | UserManager | Gestión de usuarios |
| `/map` | ClientMap | Mapa de clientes |

---

## ⚡ Optimizaciones

### Code Splitting
```typescript
// src/App.tsx - Lazy loading
const Dashboard = React.lazy(() => import('./components/dashboard/Dashboard'));
const OrderList = React.lazy(() => import('./components/order/OrderList'));
// ... más componentes
```

### Compresión de Imágenes
- Las imágenes se comprimen antes de subir a Firebase Storage
- Uso de canvas API del navegador

### PWA
- Service Worker con Workbox
- 78 archivos precacheados
- Instalable en Android/iOS

---

## 📊 Estadísticas de Build

```
✓ 2854 modules transformed
✓ built in 13.96s

dist/index.html                    3.38 kB
dist/assets/index-BkImQzhZ.js   1,093.38 kB (gzipped: 280.37 kB)
dist/assets/leaflet-src-*.js      149.60 kB (gzipped: 43.28 kB)
dist/assets/jspdf.es.min-*.js    356.26 kB (gzipped: 115.64 kB)
dist/assets/xlsx-*.js             418.91 kB (gzipped: 139.23 kB)
```

---

## 🔧 Configuración de Variables de Entorno

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

---

## ✅ Lo Que Funciona Bien

- Code splitting con React.lazy
- Memoización intensiva (useMemo/useCallback)
- Compresión de imágenes antes de subir
- PWA con service worker y caché
- Offline-first con Firestore persistent cache
- Suscripciones en tiempo real a datos

---

## ⚠️ Áreas de Mejora

| Prioridad | Problema | Ubicación |
|-----------|----------|-----------|
| Alta | No hay pagination en queries Firestore | useCollection.ts |
| Alta | No hay error boundaries | App.tsx |
| Media | VAPID key hardcoded | App.tsx:43 |
| Media | Timeout auth hardcodeado (5s) | AuthContext.tsx |
| Media | Suscripciones multiples a misma colección | useCollection.ts |
| Baja | Nombres de constantes en español | types.ts |
| Baja | No hay tests unitarios | entire codebase |

---

## 🏷️ Versión

- **Versión actual**: 1.0.0
- **Última actualización**: 2026

---

## 📄 Licencia

Propiedad de NavTickets - Todos los derechos reservados