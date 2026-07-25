export interface AnalyzedProduct {
  id: string; 
  codigo: string;
  descripcion: string;
  inventario: number;
  costo: number;
  venta: number;
  categoria: string;
  isLowStock: boolean;
}

export interface ClientDiff {
  telefono?: { old: string; new: string };
  email?: { old: string; new: string };
  direccion?: { old: string; new: string };
  ciudad?: { old: string; new: string };
}

export interface AnalyzedClient {
  id: string;
  identificacion: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  isVIP: boolean;
  existsInDB: boolean;
  needsUpdate: boolean;
  dbClient?: any; 
  diff?: ClientDiff; 
}

export type AnalysisType = 'products' | 'clients' | null;
