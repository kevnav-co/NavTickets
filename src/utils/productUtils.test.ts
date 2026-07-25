import { describe, it, expect } from 'vitest';
import { isLowStock, parseCurrency, mapExcelToProduct } from './productUtils';

describe('productUtils', () => {
  describe('isLowStock', () => {
    it('debe retornar true si el stock es menor al mínimo', () => {
      expect(isLowStock(4)).toBe(true);
    });
    it('debe retornar false si el stock es igual al mínimo', () => {
      expect(isLowStock(5)).toBe(false);
    });
    it('debe usar el mínimo personalizado', () => {
      expect(isLowStock(9, 10)).toBe(true);
    });
  });

  describe('parseCurrency', () => {
    it('debe manejar números crudos', () => {
      expect(parseCurrency(100)).toBe(100);
    });
    it('debe limpiar símbolos de moneda y comas', () => {
      expect(parseCurrency("$1,200.50")).toBe(1200.50);
    });
    it('debe manejar valores negativos', () => {
      expect(parseCurrency("-$50.00")).toBe(-50);
    });
    it('debe retornar 0 para valores inválidos', () => {
      expect(parseCurrency(null)).toBe(0);
      expect(parseCurrency("abc")).toBe(0);
    });
  });

  describe('mapExcelToProduct', () => {
    it('debe mapear correctamente una fila de Excel', () => {
      const row = {
        "Codigo": "BT-01",
        "Nombre": "Batería 12V",
        "Saldo Actual": "10",
        "Precio de Compra": "$50,000",
        "Precio de Venta": "80000"
      };
      const product = mapExcelToProduct(row, 1);
      expect(product.codigo).toBe("BT-01");
      expect(product.inventario).toBe(10);
      expect(product.costo).toBe(50000);
      expect(product.isLowStock).toBe(false);
    });
  });
});
