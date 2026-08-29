# Scripts de Administración

> El proyecto migró de **Firebase a Supabase**. La vía soportada para crear empresas hoy es el **edge `create-company`** (y su helper `scripts/create-company.mjs`). `seed-company.ts` es un script **legacy (Firebase)** que se conserva solo como referencia histórica — **no lo uses** para crear empresas nuevas.

## Legado (no usar)
- **`seed-company.ts`** — creaba empresa + admin usando Firebase-admin; quedó fuera de la arquitectura actual. Preferir `create-company`.

## Crear una empresa (Supabase)
El flujo actual va por el edge `create-company` (bootstrap service-role) y, si se quiere verificación, `scripts/verify-selfserve.mjs`.

## Scripts actuales (Node, usan `.env` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` + credencial de servicio según el caso)

| Script | Propósito |
|--------|-----------|
| `create-company.mjs` | Crear un tenant nuevo e interactuar con el edge `create-company` |
| `create-superadmin.mjs` | Crear/garantizar la cuenta `super_admin` |
| `seed-and-verify.mjs` | Sembrar los 3 tenants demo + usuarios ficticios (login `usuario@navas.com`/`Demo#2026`). **NO re-correr**: borra vínculos y deja `supabase_auth_id` en null |
| `verify-seed.mjs` | Verificar el seed demo (login + aislamiento multi-tenant) |
| `verify-selfserve.mjs` | Chequear el self-serve de branding cross-tenant (solo login, sin seed) |
| `verify-inventory-rls.mjs` | Matriz RLS de inventario (select/insert admin/cross-tenant → 4/4) |
| `diag-rls.mjs` / `fix-users-rls.mjs` / `apply_rls_fix.mjs` | Diagnóstico y correcciones de RLS |

### Requisitos
```bash
npm install          # dependencies del root
# Variables en .env (gitignored):
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EMAIL_DOMAIN
```

### Uso
```bash
node scripts/verify-inventory-rls.mjs
node scripts/verify-selfserve.mjs
```

## Post-instalación de un tenant
1. Aplicar migraciones con `npx supabase db push` (o regenerar desde `supabase/migrations/`).
2. Crear la empresa con `create-company` (edge/Función) o `scripts/create-company.mjs`.
3. Iniciar sesión con el admin del tenant (`username@EMAIL_DOMAIN`).
4. Configurar branding (theme) y usuarios desde el panel.