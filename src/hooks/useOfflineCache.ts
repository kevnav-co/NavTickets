import Dexie, { type Table } from 'dexie';

// ─── Tipos para el caché offline ──────────────────────────────────────────────

export interface CachedDocument {
  id: string;
  collection: string;       // 'clients' | 'equipment' | 'orders' | etc.
  data: any;                // El documento completo en camelCase
  updatedAt: number;        // Timestamp de última sincronización
  size?: number;            // Tamaño aproximado en bytes (para eviction)
}

export interface PendingWrite {
  id?: number;
  collection: string;
  action: 'create' | 'update' | 'delete';
  docId: string;            // ID del documento (vacío para creates)
  data: any;                // Datos a escribir
  createdAt: number;        // Timestamp de cuando se encoló
  retries: number;          // Intentos de sincronización
  lastError?: string;       // Último error al sincronizar
  priority?: number;        // Prioridad (menor = más urgente)
}

// ─── Base de datos IndexedDB ──────────────────────────────────────────────────

class NavTicketDB extends Dexie {
  cache!: Table<CachedDocument, string>;
  pendingWrites!: Table<PendingWrite, number>;

  constructor() {
    super('NavTicketOffline');

    this.version(1).stores({
      // Usamos [collection+id] como clave compuesta para queries eficientes
      cache: 'id, collection, [collection+id], updatedAt, size',
      pendingWrites: '++id, collection, createdAt, priority',
    });
  }
}

let dbInstance: NavTicketDB | null = null;

function getDb(): NavTicketDB {
  if (!dbInstance) {
    dbInstance = new NavTicketDB();
  }
  return dbInstance;
}

// ─── Configuración de eviction ────────────────────────────────────────────────

const CACHE_CONFIG = {
  maxTotalSize: 50 * 1024 * 1024,  // 50 MB total
  maxCollectionSize: 10 * 1024 * 1024, // 10 MB por colección
  maxEntries: 10000,
  maxAge: 60 * 60 * 24 * 30 * 1000, // 30 días
};

// ─── Utilidades ──────────────────────────────────────────────────────────────

function estimateSize(obj: any): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return JSON.stringify(obj).length * 2; // approx UTF-16
  }
}

async function evictIfNeeded(collection: string): Promise<void> {
  const db = getDb();
  const collectionCache = db.cache.where('collection').equals(collection);

  // Check total entries
  const count = await collectionCache.count();
  if (count > CACHE_CONFIG.maxEntries / 5) { // Max ~2000 per collection
    // Remove oldest 20%
    const toRemove = Math.floor(count * 0.2);
    const oldest = await collectionCache
      .orderBy('updatedAt')
      .limit(toRemove)
      .primaryKeys();
    await db.cache.bulkDelete(oldest);
    console.log(`[OfflineCache] Evicted ${toRemove} old entries from ${collection}`);
    return;
  }

  // Check total size
  const docs = await collectionCache.toArray();
  const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);
  if (totalSize > CACHE_CONFIG.maxCollectionSize) {
    // Remove oldest until under limit
    docs.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    let removedSize = 0;
    const toDelete: string[] = [];
    for (const doc of docs) {
      if (removedSize >= totalSize - CACHE_CONFIG.maxCollectionSize * 0.8) break;
      toDelete.push(doc.id);
      removedSize += doc.size || 0;
    }
    if (toDelete.length > 0) {
      await db.cache.bulkDelete(toDelete);
      console.log(`[OfflineCache] Evicted ${toDelete.length} entries (${removedSize} bytes) from ${collection}`);
    }
  }

  // Check global age
  const cutoff = Date.now() - CACHE_CONFIG.maxAge;
  const oldDocs = await db.cache
    .where('collection')
    .equals(collection)
    .and(d => d.updatedAt < cutoff)
    .primaryKeys();
  if (oldDocs.length > 0) {
    await db.cache.bulkDelete(oldDocs);
    console.log(`[OfflineCache] Evicted ${oldDocs.length} expired entries from ${collection}`);
  }
}

// ─── API del caché offline ─────────────────────────────────────────────────────

export const offlineCache = {
  /**
   * Obtiene todos los documentos cacheados de una colección.
   */
  async getAll<T = any>(collection: string): Promise<T[]> {
    try {
      const db = getDb();
      const docs = await db.cache
        .where('collection')
        .equals(collection)
        .toArray();
      return docs.map(d => ({ ...d.data, id: d.id })) as T[];
    } catch (err) {
      console.warn('[OfflineCache] Error reading cache:', err);
      return [];
    }
  },

  /**
   * Obtiene un documento específico del caché.
   */
  async get<T = any>(collection: string, id: string): Promise<T | null> {
    try {
      const db = getDb();
      const doc = await db.cache
        .where('[collection+id]')
        .equals([collection, id])
        .first();
      return doc ? ({ ...doc.data, id: doc.id } as T) : null;
    } catch (err) {
      console.warn('[OfflineCache] Error reading item:', err);
      return null;
    }
  },

  /**
   * Obtiene múltiples documentos por IDs (batch).
   */
  async getMany<T = any>(collection: string, ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    try {
      const db = getDb();
      const docs = await Promise.all(
        ids.map(id => db.cache.where('[collection+id]').equals([collection, id]).first())
      );
      return docs
        .filter((d): d is CachedDocument => d !== undefined)
        .map(d => ({ ...d.data, id: d.id })) as T[];
    } catch (err) {
      console.warn('[OfflineCache] Error batch reading:', err);
      return [];
    }
  },

  /**
   * Guarda un documento en el caché (upsert) con eviction automático.
   */
  async set(collection: string, id: string, data: any): Promise<void> {
    try {
      const db = getDb();
      const size = estimateSize(data);
      await db.cache.put({
        id,
        collection,
        data,
        updatedAt: Date.now(),
        size,
      });
      // Eviction asíncrono no bloqueante
      evictIfNeeded(collection).catch(console.warn);
    } catch (err) {
      console.warn('[OfflineCache] Error writing cache:', err);
    }
  },

  /**
   * Guarda múltiples documentos en el caché (batch upsert).
   * Mucho más eficiente que llamadas individuales a set().
   */
  async setAll(collection: string, documents: Array<{ id: string } & any>): Promise<void> {
    try {
      const db = getDb();
      const tx = db.transaction('rw', db.cache, async () => {
        // Limpiar caché existente de esta colección
        await db.cache.where('collection').equals(collection).delete();

        // Insertar todos los documentos en batch
        const entries = documents.map(doc => ({
          id: doc.id,
          collection,
          data: doc,
          updatedAt: Date.now(),
          size: estimateSize(doc),
        }));
        await db.cache.bulkPut(entries);
      });
      await tx;
      // Eviction asíncrono
      evictIfNeeded(collection).catch(console.warn);
    } catch (err) {
      console.warn('[OfflineCache] Error bulk writing cache:', err);
    }
  },

  /**
   * Elimina un documento del caché.
   */
  async remove(collection: string, id: string): Promise<void> {
    try {
      const db = getDb();
      await db.cache.where('[collection+id]').equals([collection, id]).delete();
    } catch (err) {
      console.warn('[OfflineCache] Error removing from cache:', err);
    }
  },

  /**
   * Elimina múltiples documentos del caché (batch).
   */
  async removeMany(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDb();
      const keys = ids.map(id => [collection, id] as const);
      await db.cache.where('[collection+id]').anyOf(keys).delete();
    } catch (err) {
      console.warn('[OfflineCache] Error batch removing:', err);
    }
  },

  /**
   * Limpia todo el caché.
   */
  async clear(): Promise<void> {
    try {
      const db = getDb();
      await db.cache.clear();
    } catch (err) {
      console.warn('[OfflineCache] Error clearing cache:', err);
    }
  },

  /**
   * Limpia una colección específica.
   */
  async clearCollection(collection: string): Promise<void> {
    try {
      const db = getDb();
      await db.cache.where('collection').equals(collection).delete();
    } catch (err) {
      console.warn('[OfflineCache] Error clearing collection:', err);
    }
  },

  /**
   * Verifica si hay datos cacheados para una colección.
   */
  async hasData(collection: string): Promise<boolean> {
    try {
      const db = getDb();
      const count = await db.cache
        .where('collection')
        .equals(collection)
        .count();
      return count > 0;
    } catch {
      return false;
    }
  },

  /**
   * Obtiene estadísticas del caché.
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    byCollection: Record<string, { count: number; size: number }>;
  }> {
    try {
      const db = getDb();
      const all = await db.cache.toArray();
      const byCollection: Record<string, { count: number; size: number }> = {};
      let totalSize = 0;

      for (const doc of all) {
        if (!byCollection[doc.collection]) {
          byCollection[doc.collection] = { count: 0, size: 0 };
        }
        byCollection[doc.collection].count++;
        byCollection[doc.collection].size += doc.size || 0;
        totalSize += doc.size || 0;
      }

      return {
        totalEntries: all.length,
        totalSize,
        byCollection,
      };
    } catch {
      return { totalEntries: 0, totalSize: 0, byCollection: {} };
    }
  },

  // ─── Cola de escrituras offline ──────────────────────────────────────────

  /**
   * Encola una operación de escritura para cuando haya conexión.
   */
  async enqueueWrite(
    collection: string,
    action: 'create' | 'update' | 'delete',
    docId: string,
    data: any,
    priority = 0
  ): Promise<number> {
    const db = getDb();
    return await db.pendingWrites.add({
      collection,
      action,
      docId,
      data,
      createdAt: Date.now(),
      retries: 0,
      priority,
    });
  },

  /**
   * Encola múltiples operaciones en batch.
   */
  async enqueueWrites(
    writes: Array<{
      collection: string;
      action: 'create' | 'update' | 'delete';
      docId: string;
      data: any;
      priority?: number;
    }>
  ): Promise<number[]> {
    if (writes.length === 0) return [];
    const db = getDb();
    const entries = writes.map(w => ({
      ...w,
      createdAt: Date.now(),
      retries: 0,
      priority: w.priority ?? 0,
    }));
    return await db.pendingWrites.bulkAdd(entries);
  },

  /**
   * Obtiene todas las operaciones pendientes de sincronización, ordenadas por prioridad y fecha.
   */
  async getPendingWrites(): Promise<PendingWrite[]> {
    try {
      const db = getDb();
      return await db.pendingWrites
        .orderBy('priority')
        .reverse() // Mayor prioridad primero
        .toArray();
    } catch {
      return [];
    }
  },

  /**
   * Obtiene operaciones pendientes por colección.
   */
  async getPendingWritesByCollection(collection: string): Promise<PendingWrite[]> {
    try {
      const db = getDb();
      return await db.pendingWrites
        .where('collection')
        .equals(collection)
        .orderBy('priority')
        .reverse()
        .toArray();
    } catch {
      return [];
    }
  },

  /**
   * Elimina una operación pendiente (tras sincronizarla exitosamente).
   */
  async removePendingWrite(id: number): Promise<void> {
    try {
      const db = getDb();
      await db.pendingWrites.delete(id);
    } catch (err) {
      console.warn('[OfflineCache] Error removing pending write:', err);
    }
  },

  /**
   * Elimina múltiples operaciones pendientes (batch).
   */
  async removePendingWrites(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDb();
      await db.pendingWrites.bulkDelete(ids);
    } catch (err) {
      console.warn('[OfflineCache] Error batch removing pending writes:', err);
    }
  },

  /**
   * Incrementa el contador de reintentos de una operación pendiente.
   */
  async incrementRetry(id: number, error: string): Promise<void> {
    try {
      const db = getDb();
      const write = await db.pendingWrites.get(id);
      if (write) {
        await db.pendingWrites.update(id, {
          retries: write.retries + 1,
          lastError: error,
        });
      }
    } catch (err) {
      console.warn('[OfflineCache] Error incrementing retry:', err);
    }
  },

  /**
   * Marca operaciones como fallidas permanentemente (después de max retries).
   */
  async markAsFailed(ids: number[], error: string): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDb();
      await Promise.all(
        ids.map(id => db.pendingWrites.update(id, { lastError: error, retries: 999 }))
      );
    } catch (err) {
      console.warn('[OfflineCache] Error marking as failed:', err);
    }
  },

  /**
   * Obtiene el conteo de operaciones pendientes por colección.
   */
  async getPendingCountByCollection(): Promise<Record<string, number>> {
    try {
      const db = getDb();
      const writes = await db.pendingWrites.toArray();
      const counts: Record<string, number> = {};
      for (const w of writes) {
        if (w.retries < 10) { // No contar fallos permanentes
          counts[w.collection] = (counts[w.collection] || 0) + 1;
        }
      }
      return counts;
    } catch {
      return {};
    }
  },

  /**
   * Limpia operaciones pendientes antiguas o fallidas permanentemente.
   */
  async cleanupPendingWrites(maxRetries = 10, maxAge = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const db = getDb();
      const cutoff = Date.now() - maxAge;
      const toDelete = await db.pendingWrites
        .filter(w => w.retries >= maxRetries || w.createdAt < cutoff)
        .primaryKeys();
      if (toDelete.length > 0) {
        await db.pendingWrites.bulkDelete(toDelete);
        console.log(`[OfflineCache] Cleaned up ${toDelete.length} old/failed pending writes`);
      }
      return toDelete.length;
    } catch (err) {
      console.warn('[OfflineCache] Error cleaning pending writes:', err);
      return 0;
    }
  },
};