import Dexie, { type Table } from 'dexie';

// ─── Tipos para el caché offline ──────────────────────────────────────────────

export interface CachedDocument {
  id: string;
  collection: string;       // 'clients' | 'equipment' | 'orders' | etc.
  data: any;                // El documento completo en camelCase
  updatedAt: number;        // Timestamp de última sincronización
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
}

// ─── Base de datos IndexedDB ──────────────────────────────────────────────────

class NavTicketDB extends Dexie {
  cache!: Table<CachedDocument, string>;
  pendingWrites!: Table<PendingWrite, number>;

  constructor() {
    super('NavTicketOffline');

    this.version(1).stores({
      // Usamos [collection+id] como clave compuesta para queries eficientes
      cache: 'id, collection, [collection+id], updatedAt',
      pendingWrites: '++id, collection, createdAt',
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

// ─── API del caché offline ────────────────────────────────────────────────────

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
   * Guarda un documento en el caché (upsert).
   */
  async set(collection: string, id: string, data: any): Promise<void> {
    try {
      const db = getDb();
      await db.cache.put({
        id,
        collection,
        data,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[OfflineCache] Error writing cache:', err);
    }
  },

  /**
   * Guarda múltiples documentos en el caché (reemplaza la colección completa).
   */
  async setAll(collection: string, documents: Array<{ id: string } & any>): Promise<void> {
    try {
      const db = getDb();
      const tx = db.transaction('rw', db.cache, async () => {
        // Limpiar caché existente de esta colección
        await db.cache.where('collection').equals(collection).delete();

        // Insertar todos los documentos
        const entries = documents.map(doc => ({
          id: doc.id,
          collection,
          data: doc,
          updatedAt: Date.now(),
        }));
        await db.cache.bulkAdd(entries);
      });
      await tx;
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

  // ─── Cola de escrituras offline ──────────────────────────────────────────

  /**
   * Encola una operación de escritura para cuando haya conexión.
   */
  async enqueueWrite(
    collection: string,
    action: 'create' | 'update' | 'delete',
    docId: string,
    data: any
  ): Promise<number> {
    const db = getDb();
    return await db.pendingWrites.add({
      collection,
      action,
      docId,
      data,
      createdAt: Date.now(),
      retries: 0,
    });
  },

  /**
   * Obtiene todas las operaciones pendientes de sincronización.
   */
  async getPendingWrites(): Promise<PendingWrite[]> {
    try {
      const db = getDb();
      return await db.pendingWrites
        .orderBy('createdAt')
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
   * Obtiene el conteo de operaciones pendientes por colección.
   */
  async getPendingCountByCollection(): Promise<Record<string, number>> {
    try {
      const db = getDb();
      const writes = await db.pendingWrites.toArray();
      const counts: Record<string, number> = {};
      for (const w of writes) {
        counts[w.collection] = (counts[w.collection] || 0) + 1;
      }
      return counts;
    } catch {
      return {};
    }
  },
};