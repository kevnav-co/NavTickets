// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const calls = { from: 0, getAll: 0 };
const builder: any = {
  select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
  then: (resolve: any) => Promise.resolve({ data: [{ id: '1' }], error: null }).then(resolve),
};

vi.mock('../services/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: () => { calls.from++; return builder; },
    channel: () => ({ on() { return this; }, subscribe: () => {} }),
    removeChannel: () => {},
  },
}));

vi.mock('./useOfflineCache', () => ({
  offlineCache: {
    getAll: async () => { calls.getAll++; return [{ id: 'cached' }]; },
    getPendingCountByCollection: async () => ({}),
    setAll: async () => {},
  },
}));

import { useSupabaseQuery } from './useSupabaseQuery';

// Filtros como literal nuevo en cada render, igual que DataContext.
function Probe() {
  useSupabaseQuery<{ id: string }>('clients', {
    filters: [{ column: 'company_id', operator: 'eq', value: 'c1' }],
    orderBy: { column: 'name' },
    realtime: false,
  });
  return null;
}

const settle = () => new Promise(r => setTimeout(r, 200));

describe('useSupabaseQuery', () => {
  let root: Root;
  beforeEach(() => {
    calls.from = 0;
    calls.getAll = 0;
    root = createRoot(document.createElement('div'));
  });
  afterEach(() => {
    root.unmount();
    vi.restoreAllMocks();
  });

  it('online: consulta Supabase una sola vez aunque los filtros sean literales', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    root.render(<Probe />);
    await settle();
    expect(calls.from).toBe(1);
    expect(calls.getAll).toBe(0);
  });

  it('offline: sirve desde la caché una sola vez', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    root.render(<Probe />);
    await settle();
    expect(calls.from).toBe(0);
    expect(calls.getAll).toBe(1);
  });
});
