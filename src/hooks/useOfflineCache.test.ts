import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineCache } from './useOfflineCache';

describe('offlineCache.getPendingWrites', () => {
  it('devuelve la cola en orden de llegada (create → update → delete) a igual prioridad', async () => {
    await offlineCache.enqueueWrite('orders', 'create', 'o1', { id: 'o1', status: 'Pendiente' });
    await offlineCache.enqueueWrite('orders', 'update', 'o1', { status: 'En Progreso' });
    await offlineCache.enqueueWrite('orders', 'delete', 'o1', null);
    const actions = (await offlineCache.getPendingWrites()).map(w => w.action);
    expect(actions).toEqual(['create', 'update', 'delete']);
  });

  it('la prioridad más alta va primero; dentro de cada prioridad, orden de llegada', async () => {
    for (const w of await offlineCache.getPendingWrites()) await offlineCache.removePendingWrite(w.id!);
    await offlineCache.enqueueWrite('tasks', 'create', 't1', { id: 't1' }, 0);
    await offlineCache.enqueueWrite('tasks', 'update', 't1', { title: 'x' }, 0);
    await offlineCache.enqueueWrite('orders', 'update', 'o2', { status: 'Cerrado' }, 5);
    const order = (await offlineCache.getPendingWrites()).map(w => `${w.docId}:${w.action}`);
    expect(order).toEqual(['o2:update', 't1:create', 't1:update']);
  });
});
