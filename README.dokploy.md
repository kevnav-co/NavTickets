# Despliegue en Dokploy — NavTickets

## Arquitectura

```
Dokploy
  ├── Frontend (Docker)    → Puerto 8080
  └── Firebase Cloud Functions (desplegado por separado)
```

El frontend se despliega como un contenedor Docker multi-stage (Node 20 → Nginx Alpine).
Las Cloud Functions se despliegan directamente a Firebase desde CI/CD.

---

## Requisitos

- Dokploy v0.2+
- Firebase CLI (`npm install -g firebase-tools`)
- Variables de entorno de Firebase (API key, project ID, etc.)
- (Opcional) Twilio + Gmail credenciales para notificaciones

---

## Despliegue del Frontend en Dokploy

### 1. Crear nuevo proyecto en Dokploy

- **Tipo**: Docker Compose
- **Source**: Repositorio Git (GitHub, GitLab, etc.)
- **Branch**: main

### 2. Configurar Variables de Entorno

En Dokploy, agrega estas variables de entorno:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `tu-proyecto.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `tu-proyecto` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `tu-proyecto.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `1:123:web:abc` |
| `VITE_FIREBASE_DATABASE_URL` | Firebase RTDB URL | `https://tu-proyecto.firebaseio.com` |
| `VITE_VAPID_KEY` | VAPID Key para FCM | `BED4eP1e3O95...` |

### 3. Desplegar

Dokploy ejecutará:
```bash
docker-compose up --build -d
```

Esto construirá la imagen y expondrá el frontend en el puerto 8080.

### 4. Configurar Dominio (opcional)

Desde el panel de Dokploy, asigna un dominio personalizado apuntando al puerto 8080.

---

## Despliegue de Cloud Functions

Las funciones backend se despliegan por separado vía Firebase CLI:

```bash
# 1. Instalar Firebase CLI
npm install -g firebase-tools

# 2. Autenticar
firebase login

# 3. Seleccionar proyecto
firebase use --add

# 4. Desplegar funciones
cd functions
npm run deploy
```

### Variables de Entorno para Functions

Crea un archivo `functions/.env`:

```env
TWILIO_ACCOUNT_SID=tu_sid
TWILIO_AUTH_TOKEN=tu_token
TWILIO_WHATSAPP_NUMBER=+14155238886
GMAIL_USER=tu-email@gmail.com
GMAIL_APP_PASSWORD=tu-app-password
CUENTI_API_TOKEN=tu-token
CUENTI_EMPRESA_ID=tu-id
CUENTI_USER_ID=tu-user-id
```

---

## Despliegue Completo (CI/CD Automatizado)

### GitHub Actions (recomendado)

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t navtickets-frontend .
      - name: Push to registry
        run: docker push tu-registry/navtickets-frontend
      # Dokploy webhook trigger aquí

  functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Deploy to Firebase
        run: |
          npm install -g firebase-tools
          cd functions
          npm ci
          firebase deploy --only functions --token "${{ secrets.FIREBASE_TOKEN }}"
```

---

## Comandos Útiles

```bash
# Build local de la imagen Docker
docker compose build

# Iniciar servicios localmente
docker compose up -d

# Ver logs
docker compose logs -f

# Detener servicios
docker compose down

# Desplegar solo functions
cd functions && npm run deploy
```

---

## Notas Importantes

1. **Firestore Rules**: Después del primer despliegue, ejecuta:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Firebase Auth**: Los usuarios deben tener un custom claim `companyId`. Usa el script de seed para crear la primera empresa y usuario admin.

3. **PWA**: La app funciona offline gracias al Service Worker de Workbox. Asegúrate de que el dominio tenga HTTPS.

4. **Almacenamiento**: Las imágenes se suben a Firebase Storage. Las reglas de seguridad deben permitir el acceso autenticado.

5. **Notificaciones Push**: Requieren VAPID key configurada y HTTPS obligatorio.

---

## Solución de Problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| 404 en rutas | SPA routing sin fallback | Verificar nginx.conf tiene `try_files $uri /index.html` |
| FCM no funciona | Falta VAPID key o HTTPS | Configurar VAPID en variables de entorno |
| No carga compañía | Falta `companies/{id}` en Firestore | Ejecutar script de seed |
| Login falla | Dominio de email incorrecto | Verificar `auth.emailDomain` en company config |
| 403 en Firestore | Reglas no desplegadas | Ejecutar `firebase deploy --only firestore:rules` |