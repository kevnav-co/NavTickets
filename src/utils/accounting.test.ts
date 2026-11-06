import { describe, it, expect } from 'vitest';
import {
  annulledIds, canAnnul, computeBalances, filterByRange, groupByDay, localDateKey, signedAmount, toMovements,
} from './accounting';
import type { Expense, Income, Transaction } from '../types/accounting';

const A = 'tec-a';
const B = 'tec-b';
const S = 'sup';
const at = (iso: string) => iso;

const tx = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), companyId: 'c1', amount: 0, concept: 'x', createdAt: at('2026-11-02T15:00:00Z'),
  senderId: S, senderName: 'Sup', recipientId: A, recipientName: 'Tec A', method: 'Efectivo', ...p,
});
const ex = (p: Partial<Expense>): Expense => ({
  id: crypto.randomUUID(), companyId: 'c1', amount: 0, concept: 'x', createdAt: at('2026-11-02T16:00:00Z'),
  userId: A, userName: 'Tec A', origin: 'Efectivo', ...p,
});

describe('saldos de caja menor', () => {
  const received = tx({ id: 't1', amount: 100000 });
  const expense = ex({ id: 'e1', amount: 20000 });
  const selfOut = tx({ id: 's1', senderId: A, recipientId: A, amount: 30000, method: 'Efectivo', transactionGroupId: 'g1', selfEntry: 'out' });
  const selfIn = tx({ id: 's2', senderId: A, recipientId: A, amount: 30000, method: 'Transferencia', transactionGroupId: 'g1', selfEntry: 'in' });

  it('recibir 100k y gastar 20k deja 80k en efectivo', () => {
    const movs = toMovements([received], [expense], []);
    expect(computeBalances(movs, A)).toEqual({ cash: 80000, transfer: 0, total: 80000 });
  });

  it('mover entre cuentas propias no cambia el total, solo la distribución', () => {
    const movs = toMovements([received, selfOut, selfIn], [expense], []);
    expect(computeBalances(movs, A)).toEqual({ cash: 50000, transfer: 30000, total: 80000 });
  });

  it('anular un gasto (monto negativo) devuelve el dinero', () => {
    const annul = ex({ id: 'e2', amount: -20000, isAnnulment: true, relatedMovementId: 'e1' });
    const movs = toMovements([received], [expense, annul], []);
    expect(computeBalances(movs, A).total).toBe(100000);
  });

  it('anular una transferencia invierte emisor/receptor', () => {
    const toB = tx({ id: 't2', senderId: A, recipientId: B, amount: 40000 });
    const annul = tx({ id: 't3', senderId: B, recipientId: A, amount: 40000, isAnnulment: true, relatedMovementId: 't2' });
    const movs = toMovements([received, toB, annul], [], []);
    expect(computeBalances(movs, A).total).toBe(100000);
    expect(computeBalances(movs, B).total).toBe(0);
  });

  it('anular un movimiento entre cuentas invierte self_entry y deja el total igual', () => {
    const annulOut = tx({ id: 'a1', senderId: A, recipientId: A, amount: 30000, method: 'Efectivo', transactionGroupId: 'annul_g1', selfEntry: 'in', isAnnulment: true, relatedMovementId: 's1' });
    const annulIn = tx({ id: 'a2', senderId: A, recipientId: A, amount: 30000, method: 'Transferencia', transactionGroupId: 'annul_g1', selfEntry: 'out', isAnnulment: true, relatedMovementId: 's2' });
    const movs = toMovements([received, selfOut, selfIn, annulOut, annulIn], [], []);
    expect(computeBalances(movs, A)).toEqual({ cash: 100000, transfer: 0, total: 100000 });
  });

  it('los ingresos suman al dueño', () => {
    const income: Income = { id: 'i1', companyId: 'c1', amount: 500000, concept: 'Abono', createdAt: at('2026-11-02T10:00:00Z'), userId: S, userName: 'Sup', origin: 'Transferencia' };
    const movs = toMovements([received], [], [income]);
    expect(computeBalances(movs, S)).toEqual({ cash: -100000, transfer: 500000, total: 400000 });
  });

  it('un movimiento ajeno no afecta el saldo', () => {
    const [m] = toMovements([tx({ senderId: S, recipientId: B, amount: 1 })], [], []);
    expect(signedAmount(m, A)).toBe(0);
  });

  it('un concepto numérico (JSON.parse de snakeToCamel) se normaliza a string', () => {
    const [m] = toMovements([], [ex({ concept: 500 as unknown as string, amount: 1 })], []);
    expect(m.concept).toBe('500');
  });
});

describe('anulaciones', () => {
  const selfOut = tx({ id: 's1', senderId: A, recipientId: A, amount: 10, transactionGroupId: 'g1', selfEntry: 'out' });
  const selfIn = tx({ id: 's2', senderId: A, recipientId: A, amount: 10, transactionGroupId: 'g1', selfEntry: 'in' });
  const annul = tx({ id: 'a1', senderId: A, recipientId: A, amount: 10, transactionGroupId: 'annul_g1', selfEntry: 'in', isAnnulment: true, relatedMovementId: 's1' });
  const fromSup = tx({ id: 't1', amount: 5 });

  it('anular una mitad del par marca ambas como anuladas', () => {
    const ids = annulledIds(toMovements([selfOut, selfIn, annul], [], []));
    expect(ids.has('s1')).toBe(true);
    expect(ids.has('s2')).toBe(true);
  });

  it('permisos espejo de accounting_annul()', () => {
    const movs = toMovements([selfOut, selfIn, annul, fromSup], [], []);
    const done = annulledIds(movs);
    const find = (id: string) => movs.find(m => m.id === id)!;
    const tecA = { id: A, role: 'technician' };
    expect(canAnnul(find('t1'), tecA, done)).toBe(false);
    expect(canAnnul(find('t1'), { id: S, role: 'supervisor' }, done)).toBe(true);
    expect(canAnnul(find('s1'), tecA, done)).toBe(false);
    expect(canAnnul(find('a1'), { id: S, role: 'admin' }, done)).toBe(false);
  });
});

describe('agrupación por día local', () => {
  it('usa el día local, no UTC', () => {
    const ts = new Date(2026, 10, 2, 23, 30).getTime();
    expect(localDateKey(ts)).toBe('2026-11-02');
  });

  it('groupByDay acumula el balance diario del usuario', () => {
    const movs = toMovements([tx({ amount: 100 })], [ex({ amount: 30 })], []);
    const groups = groupByDay(movs, A);
    expect(Object.values(groups).reduce((s, g) => s + g.dailyBalance, 0)).toBe(70);
  });

  it('filterByRange "day" deja solo los de hoy', () => {
    const now = new Date(2026, 10, 3, 12);
    const movs = toMovements([tx({ createdAt: new Date(2026, 10, 3, 9).toISOString() }), tx({ createdAt: new Date(2026, 10, 1).toISOString() })], [], []);
    expect(filterByRange(movs, 'day', now)).toHaveLength(1);
  });
});
