# DIRECTIVA: EVIDENCIA_ARCHIVOS_SOP

> **ID:** 20260415_FILES_01
> **Script Asociado:** `src/hooks/useFileHandler.ts`, `src/utils/imageCompression.ts`
> **Última Actualización:** 15/04/2026
> **Estado:** ACTIVO

---

## 1. Objetivos y Alcance
- **Objetivo Principal:** Estandarizar la captura, procesamiento y almacenamiento de evidencia fotográfica para asegurar que las imágenes sean ligeras, persistentes y accesibles.
- **Criterio de Éxito:** Toda imagen guardada debe pasar por el proceso de compresión y estar organizada en carpetas por ID de documento en Firebase Storage.

## 2. Especificaciones de Entrada/Salida (I/O)

### Entradas (Inputs)
- **Archivo:** Objeto `File` (captura de cámara o selección de galería).
- **Path Base:** `orders/`, `clients/`, `equipment/`, etc.

### Salidas (Outputs)
- **URL Pública:** Link de Firebase Storage (Modo Online).
- **Base64:** String encoded para persistencia temporal (Modo Offline).
- **Redimensionamiento:** Máximo 1024px de ancho (vía `compressImage`).

## 3. Flujo Lógico (Algoritmo)

1. **Selección:** El usuario selecciona uno o varios archivos.
2. **Compresión:** Se ejecuta `compressImage(file)` que reduce el peso y dimensiones sin pérdida excesiva de calidad.
3. **Detección de Conectividad:**
   - **Online:** Sube el Blob a Storage -> Obtiene `downloadURL` -> Actualiza document en Firestore.
   - **Offline:** Convierte Blob a Base64 -> Actualiza document en Firestore local (Firestore Persistence).
4. **Sanitización de Datos:** Antes de guardar arrays de archivos, se aplica `.flat(Infinity)` y `new Set()` para evitar duplicados o arreglos anidados corruptos.
5. **Limpieza de Storage:** Al reemplazar una foto única (no array), el sistema intenta borrar el archivo anterior de Storage para ahorrar espacio.

## 4. Herramientas y Librerías
- **Firebase:** `firebase/storage`.
- **Canvas:** Utilizado en `imageCompression.ts` para redimensionar.
- **Hooks:** `useConnectivityStatus`.

## 5. Restricciones y Casos Borde (Edge Cases)
- **Archivos Pesados:** Si el archivo excede 5MB post-compresión (raro), el sistema debe alertar al usuario.
- **Objetos No Encontrados:** Al borrar, si el objeto no existe en Storage (Error 404), se debe ignorar el error y proceder a limpiar Firestore.
- **Pérdida de Contexto:** Si el `id` del documento desaparece durante la subida, se cancela la operación para evitar archivos huérfanos en la raíz de Storage.

## 6. Protocolo de Errores y Aprendizajes (Memoria Viva)

| Fecha | Error Detectado | Causa Raíz | Solución/Parche Aplicado |
|-------|-----------------|------------|--------------------------|
| 15/04 | Arreglos anidados en FS | Concatenación infinita de arrays | Agregado `.flat(Infinity)` en `useFileHandler.ts` antes de guardar. |
| 15/04 | Blobs nulos en compresión | Timeout de Canvas en dispositivos lentos | Aumentado el tiempo de espera y manejo de promesas en `compressImage.ts`. |

## 7. Ejemplos de Uso

```bash
# Path jerárquico esperado en Storage:
orders/ID_ORDEN/beforePhotos/1713214567_antes.jpg
```

## 8. Checklist de Pre-Ejecución
- [ ] Cámara con permisos otorgados en el navegador.
- [ ] Bucket de Storage configurado con reglas `write` para usuarios autenticados.

## 9. Checklist Post-Ejecución
- [ ] Imagen visible en la previsualización del formulario.
- [ ] Verificación de peso (idealmente < 200KB por foto).
