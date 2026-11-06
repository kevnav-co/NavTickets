// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const calls = { from: 0, getAll: 0 };
let dataset: { id: string }[] = [{ id: '1' }];
const makeBuilder = () => {
  let range: [number, number] | null = null;
  const b: any = {
    select: () => b, eq: () => b, order: () => b, limit: () => b,
    range: (from: number, to: number) => { range = [from, to]; return b; },
    then: (resolve: any) =>
      Promise.resolve({ data: range ? dataset.slice(range[0], range[1] + 1) : dataset.slice(0, 1000), error: null }).then(resolve),
  };
  return b;
};

vi.mock('../services/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: () => { calls.from++; return makeBuilder(); },
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

let lastCount = 0;
function CountProbe() {
  const { data } = useSupabaseQuery<{ id: string }>('orders', { realtime: false });
  lastCount = data.length;
  return null;
}

const settle = () => new Promise(r => setTimeout(r, 200));

describe('useSupabaseQuery', () => {
  let root: Root;
  beforeEach(() => {
    calls.from = 0;
    calls.getAll = 0;
    dataset = [{ id: '1' }];
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

  it('online: pagina más allá del límite de 1000 filas de PostgREST', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    dataset = Array.from({ length: 2500 }, (_, i) => ({ id: String(i) }));
    root.render(<CountProbe />);
    await settle();
    expect(lastCount).toBe(2500);
    expect(calls.from).toBe(3);
  });
});
