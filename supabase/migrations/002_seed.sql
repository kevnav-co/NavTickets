-- =============================================================================
-- NavTicket - Seed: Compañía inicial y usuario admin
-- =============================================================================
-- Ejecutar DESPUÉS de 001_schema.sql y de migrar los datos desde Firestore.
--
-- Este script crea la compañía por defecto y vincula el usuario admin
-- con su cuenta de Supabase Auth.
-- =============================================================================

-- 1. Crear compañía por defecto (si no existe)
INSERT INTO companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Navas Servicios Técnicos')
ON CONFLICT (id) DO NOTHING;

-- 2. NOTA: Los usuarios se migran desde Firestore con el script de migración.
--    Después de migrar, ejecutar el paso 3 para cada usuario:
--
-- UPDATE users SET supabase_auth_id = '<SUPABASE_AUTH_UID>'
-- WHERE username = '<username>';

-- 3. Crear usuarios en Supabase Auth (NO aquí — usar Supabase Dashboard o Admin API)
--    Ejemplo de cómo crear un usuario admin manualmente:
--    const { data, error } = await supabase.auth.admin.createUser({
--      email: 'admin@navas.com',
--      password: 'password_seguro',
--      email_confirm: true,
--    });
--
--    Luego vincular:
--    UPDATE users SET supabase_auth_id = '${data.user.id}' WHERE username = 'admin';