# Scripts de Administración

## seed-company.ts

Crea una nueva empresa multi-tenant con su usuario admin, configuración de marca, y pestañas por defecto.

### Requisitos

```bash
npm install -g firebase-tools
firebase login
```

O configurar una variable de entorno con la ruta al archivo JSON de la cuenta de servicio:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./ruta/a/tu-service-account.json
```

### Uso

```bash
npx ts-node scripts/seed-company.ts
```

El script te guiará paso a paso:
1. Nombre de la empresa
2. Slug (identificador URL)
3. Dominio de email para login
4. Nombre del admin
5. Username del admin
6. Contraseña del admin
7. Color primario (tema)

### Lo que crea

1. Documento en `companies/{slug}` con toda la configuración
2. Usuario en Firebase Auth con email `admin@midominio.com`
3. Custom claims `companyId` y `role` en el Auth user
4. Documento en `users/{uid}` con los datos del admin
5. Pestañas por defecto (Dashboard, Tareas, Órdenes, Clientes, Máquinas, Equipo, Mapa)

### Post-instalación

1. Desplegar reglas de Firestore:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. Iniciar sesión en la app con las credenciales del admin

3. Ir a `/admin` (si tienes rol super_admin) o usar la app normalmente

4. Subir logos y configurar branding desde el panel de administración

5. Crear usuarios adicionales desde el panel