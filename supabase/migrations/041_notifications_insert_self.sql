-- =============================================================================
-- 041 — El alta de notificaciones queda restringida a la propia cuenta.
--
-- La política de la 005 (`notif_insert_company`) solo comprobaba la empresa, no
-- el destinatario, de modo que cualquier usuario autenticado podía insertar una
-- notificación dirigida a otro con el título, el cuerpo y la ruta que quisiera.
-- Como la campana navega a `notification.path`, eso permitía a un usuario sin
-- privilegios fabricarle a un administrador un aviso del sistema creíble que
-- enlazara a cualquier pantalla interna: suplantación de mensajes del sistema
-- desde dentro del propio inquilino.
--
-- Ningún escritor legítimo pierde capacidades. Las notificaciones entre usuarios
-- las crean las Edge Functions con la service role y los disparadores de soporte
-- de las migraciones 025 a 027, declarados SECURITY DEFINER; ambos caminos omiten
-- RLS y no pasan por esta política.
--
-- El super_admin conserva el alta para cualquier destinatario: es el operador de
-- la plataforma y ya dispone de control total, así que restringirlo no añadiría
-- garantía alguna.
-- =============================================================================

DROP POLICY IF EXISTS "notif_insert_company" ON notifications;
DROP POLICY IF EXISTS "notif_insert_self" ON notifications;

CREATE POLICY "notif_insert_self" ON notifications
    FOR INSERT WITH CHECK (
        (
            company_id = public.current_company_id()
            AND user_id = public.current_user_id()
        )
        OR public.current_user_role() = 'super_admin'
    );
