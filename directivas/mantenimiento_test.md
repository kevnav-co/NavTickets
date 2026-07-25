# DIRECTIVA: ENVIAR_TEST_MANTENIMIENTO_PREVENTIVO

> **ID:** 20260416_TEST_MAINTENANCE
> **Script Asociado:** `functions/test-maintenance-specific.js`
> **Última Actualización:** 2026-04-16
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Enviar un correo electrónico de prueba que simule una notificación de mantenimiento preventivo real utilizando datos de la base de datos (Firestore).
- **Criterio de Éxito:** El script se ejecuta sin errores y el correo llega a `knavasov@gmail.com` con el formato premium diseñado y datos reales de un equipo.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Argumentos Requeridos:** Ninguno (datos hardcodeados en el script para este test específico).
- **Variables de Envorno (.env):**
  - `GMAIL_USER`: Cuenta de Gmail emisora.
  - `GMAIL_PASS`: App Password de la cuenta de Gmail.
- **Archivos Fuente:**
  - `functions/communicationChannels.js`: Para el envío de mensajes.

### Salidas (Outputs)
- **Retorno de Consola:** Mensaje de éxito o error detallado.

## 3. Flujo Lógico (Algoritmo)

1. **Carga de Contexto:** Requerir `dotenv` y las funciones de `communicationChannels`.
2. **Definición de Datos:** Configurar los datos reales obtenidos de Firestore (Equipo SN-0096, Cliente Maxi Shen Long).
3. **Construcción del Mensaje:** Generar el cuerpo HTML con el diseño premium de Navas Máquinas.
4. **Envío:** Llamar a `sendEmailMessage` con el destinatario `knavasov@gmail.com`.
5. **Validación:** Informar el resultado en consola.

## 4. Herramientas y Librerías
- **Librerías Node.js:** `nodemailer`, `dotenv`.
- **APIs Externas:** Firebase Firestore (para la obtención previa de datos).

## 5. Restricciones y Casos Borde (Edge Cases)
- **Límites:** Las App Passwords de Gmail pueden expirar o fallar si el 2FA cambia.
- **Formato:** El HTML debe ser responsive para visualizarse correctamente en móviles y escritorio.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 16/04 | MODULE_NOT_FOUND | Script ejecutado fuera de la ruta con node_modules. | Mover el script a `functions/` o ejecutar desde dicha carpeta. |

## 7. Ejemplos de Uso

```bash
cd functions
node test-maintenance-specific.js
```

## 8. Checklist de Pre-Ejecución
- [x] Variables de entorno configuradas en `functions/.env`
- [x] Dependencias instaladas (`npm install` en el folder functions)
- [x] Script creado en la ruta correcta

## 9. Checklist Post-Ejecución
- [ ] Salidas generadas correctamente
- [ ] Logs revisados para errores/advertencias
- [ ] Resultados validados contra criterios esperados
