import { AnalyzedProduct } from '../types/intelligence';

/**
 * Determina si un nivel de inventario es considerado bajo.
 * @param stock Cantidad actual en inventario.
 * @param minStock Umbral mínimo (por defecto 5).
 */
export const isLowStock = (stock: number, minStock: number = 5): boolean => {
  return stock < minStock;
};

/**
 * Limpia y convierte un valor a número, manejando formatos de moneda y errores.
 * @param value El valor a parsear (string o número).
 */
export const parseCurrency = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  // Elimina símbolos de moneda, comas (separadores de miles) y espacios.
  // Mantiene el punto decimal y el signo negativo.
  const cleaned = String(value).replace(/[^0-9.-]+/g, "");
  const result = Number(cleaned);
  
  return isNaN(result) ? 0 : result;
};

/**
 * Mapea una fila cruda de Excel a un objeto AnalyzedProduct estructurado.
 * @param row Objeto crudo del Excel.
 * @param index Índice de la fila para generar un ID temporal.
 */
export const mapExcelToProduct = (row: any, index: number): AnalyzedProduct => {
  const stock = Number(row["Saldo Actual"] || row["Saldo"] || 0);
  const cost = parseCurrency(row["Precio de Compra"] || 0);
  const sale = parseCurrency(row["Precio de Venta"] || 0);
  
  return {
    id: `temp-prod-${index}-${Date.now()}`,
    codigo: String(row["Codigo"] || row["Código"] || "S/R"),
    descripcion: row["Nombre"] || row["Descripción"] || "Sin Descripción",
    inventario: stock,
    costo: cost,
    venta: sale,
    categoria: row["Grupo de Inventario"] || "General",
    isLowStock: isLowStock(stock)
  };
};
