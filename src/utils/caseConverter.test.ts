import { describe, it, expect } from 'vitest';
import { snakeToCamel, toSnakeCase } from './caseConverter';

describe('toSnakeCase', () => {
  it('convierte claves y conserva arrays/objetos como JSON real (columnas JSONB)', () => {
    const out = toSnakeCase({ equipmentIds: ['a', 'b'], closingData: { notes: 'x' }, companyId: 'c1', warrantyEndTime: null });
    expect(out).toEqual({ equipment_ids: ['a', 'b'], closing_data: { notes: 'x' }, company_id: 'c1', warranty_end_time: null });
  });
});

describe('snakeToCamel', () => {
  it('lee arrays reales y también los strings JSON guardados por versiones anteriores', () => {
    expect(snakeToCamel({ equipment_ids: ['a'], procedures: '["p1"]' })).toEqual({ equipmentIds: ['a'], procedures: ['p1'] });
  });
});
