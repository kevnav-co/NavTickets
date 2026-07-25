# DIRECTIVA: [NAVAS_NOTIFICACIONES_EXTERNAS_WA_EMAIL]

> **ID:** 20260416_NOT_EXT
> **Script Asociado:** `functions/communicationChannels.js`, `functions/emailTemplates.js`, `functions/expirationCheck.js`
> **Última Actualización:** 2026-04-16
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
Esta directiva define el protocolo para el envío de notificaciones automáticas a clientes y usuarios mediante canales externos (WhatsApp y Email).
- **Objetivo Principal:** Asegurar la entrega de avisos críticos (vencimientos, mantenimiento) mediante un sistema de redundancia.
- **Criterio de Éxito:** Las notificaciones deben intentar enviarse por WhatsApp primero; si falla o no hay número, deben enviarse por Email usando la plantilla corporativa.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **WhatsApp:** Teléfono con código de país (ej: +57...).
- **Email:** Dirección válida.
- **Contenido:** Asunto y cuerpo del mensaje (soporta HTML para email).

### Salidas (Outputs)
- **Email:** Envío vía Gmail SMTP (Nodemailer).
- **WhatsApp:** Envío vía Twilio API.

## 3. Flujo Lógico (Algoritmo)

1. **Validación:** Comprobar existencia de destinatario.
2. **Priorización (Fallback):**
   - Intentar WhatsApp.
   - Si WhatsApp falla o el destinatario no tiene teléfono, intentar Email.
3. **Renderizado de Email:** Usar el módulo `emailTemplates.js` para generar el HTML premium basado en el tipo de alerta (Mantenimiento o Garantía).
4. **Logging:** Registrar éxito o error en la consola de Firebase Functions.

## 4. Herramientas y Librerías
- `nodemailer`: Para el envío de correos.
- `twilio`: Para mensajes de WhatsApp.
- `dotenv`: Para gestión de credenciales en `.env`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Credenciales:** Gmail requiere "Contraseñas de aplicación" (2FA habilitado). No usar la contraseña normal de la cuenta.
- **Logo URL:** Asegurar que la URL del logo en Storage sea pública y tenga el token de acceso permanente.
- **Instrucción de Agendamiento:** Todos los correos de mantenimiento DEBEN incluir el botón de WhatsApp pre-configurado para agendamiento.
- **Enriquecimiento de Datos:** Antes de renderizar la plantilla, se debe consultar el nombre del cliente y detalles del equipo para personalizar el mensaje. No enviar plantillas con campos vacíos o "N/A" si la información existe en Firestore.
- **Protocolo No-Reply:** Los correos son informativos y deben incluir el aviso de "no responder".
- **Límites de Twilio:** Durante el uso de Sandbox, solo se pueden enviar mensajes a números registrados.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 16/04 | Fallo en local | Falta de .env en subdir functions | Usar `dotenv.config({ path: ... })` apuntando al archivo exacto en scripts de prueba. |
| 16/04 | Renderizado HTML | Saltos de línea perdidos | Implementar fallback `body.replace(/\n/g, '<br>')` cuando no se provee `htmlBody`. |

## 7. Ejemplos de Uso

```bash
# Probar envío de email
node functions/test-email-v2.js usuario@ejemplo.com
```

## 8. Checklist de Pre-Ejecución
- [ ] Credenciales TWILIO y GMAIL en `functions/.env`.
- [ ] Dependencias instaladas en `functions/`.
- [ ] Logo disponible en Firebase Storage.

## 9. Checklist Post-Ejecución
- [ ] Verificar llegada al "Spam" en caso de no ver el correo.
- [ ] Validar que los enlaces de WhatsApp funcionen.
