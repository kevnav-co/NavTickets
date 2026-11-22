-- =============================================================================
-- 053 — Storage: fotos privadas (paso 2 de 2)
-- =============================================================================
-- Tras la 052 (sin listado público y todo acotado a la empresa), las fotos de
-- órdenes y equipos dejan de servirse por su URL pública: el bucket pasa a
-- privado y la app las muestra con enlaces firmados de 1 hora
-- (src/services/storageUrls.ts, componente StorageImage). Para firmar, la API
-- aplica la política SELECT de la 052: solo usuarios de la misma empresa.
--
-- Los registros siguen guardando la URL pública como identificador; no hay que
-- migrar datos. `company-assets` sigue público (los logos se ven antes de
-- iniciar sesión). Desplegar el frontend ANTES de aplicar esta migración.
-- Idempotente.
-- =============================================================================

UPDATE storage.buckets SET public = false WHERE id IN ('order-photos', 'equipment-photos');
