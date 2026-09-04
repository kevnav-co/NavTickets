-- =====================================================================
-- Seed de INVENTARIO (repuestos) para las empresas EXISTENTES.
-- Idempotente: por cada empresa (macheada por nombre) inserta solo los
-- SKU que NO existen todavía → re-ejecutar no duplica.
-- "Simula" estados reales: cantidades por encima/por debajo del umbral
-- low_stock_threshold, y 1-2 ítems agotados (quantity = 0).
-- Uso: npx supabase db query --linked --file scripts/seed-inventory.sql
-- =====================================================================

DO $$
DECLARE
  cid uuid;
BEGIN
  -- 1) Navas Servicios Técnicos (original, mantenimiento de equipos de alimentos)
  SELECT id INTO cid FROM companies WHERE name = 'Navas Servicios Técnicos';
  IF cid IS NOT NULL THEN
    INSERT INTO inventory_items (company_id, sku, name, unit, quantity, unit_cost, low_stock_threshold)
    SELECT cid, v.sku, v.name, v.unit, v.quantity, v.unit_cost, v.low_stock_threshold
    FROM (VALUES
      ('NS-B001','Rodamiento 6204-2Z','unidad',40,18000,30),
      ('NS-B002','Rodamiento 6305-2RS','unidad',25,26000,20),
      ('NS-M001','Motor eléctrico 3HP','unidad',3,950000,2),
      ('NS-C001','Banda V B50','unidad',12,45000,10),
      ('NS-L001','Aceite lubricante NSFH1 (galón)','galón',8,120000,10),
      ('NS-G001','Grasa grado alimentario (pote)','pote',5,62000,8),
      ('NS-F001','Filtro HEPA (unidad)','unidad',2,280000,6),
      ('NS-S001','Sello mecánico 25mm','unidad',0,85000,6),
      ('NS-T001','Termopar tipo J','unidad',6,45000,8),
      ('NS-K001','Kit de empaques sanitarios (set)','set',9,28000,12),
      ('NS-P001','Placa de control PCB','unidad',0,1500000,3),
      ('NS-A001','Aceite viscoso ISO 220 (barril)','barril',6,2400000,4),
      ('NS-R001','Resina intercambio iónico (bolsa)','bolsa',4,380000,6),
      ('NS-D001','Desengrasante industrial (galón)','galón',20,28000,15)
    ) AS v(sku,name,unit,quantity,unit_cost,low_stock_threshold)
    WHERE NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.company_id = cid AND i.sku = v.sku);
  END IF;

  -- 2) Fábricas Andinas S.A. (metalmecánica)
  SELECT id INTO cid FROM companies WHERE name = 'Fábricas Andinas S.A.';
  IF cid IS NOT NULL THEN
    INSERT INTO inventory_items (company_id, sku, name, unit, quantity, unit_cost, low_stock_threshold)
    SELECT cid, v.sku, v.name, v.unit, v.quantity, v.unit_cost, v.low_stock_threshold
    FROM (VALUES
      ('FA-A001','Aceite hidráulico ISO 68 (barril)','barril',10,1850000,6),
      ('FA-A002','Grasa para rodamientos (pote)','pote',20,18500,15),
      ('FA-F003','Filtro de aceite GA75','unidad',5,175000,4),
      ('FA-M004','Motor eléctrico 15HP','unidad',2,2800000,3),
      ('FA-R005','Rodamiento SKF 6307','unidad',30,52000,20),
      ('FA-C006','Soldadura MIG ER70S-6 (rollo)','rollo',12,145000,8),
      ('FA-P007','Pintura electrostática azul (25kg)','bulto',6,285000,10),
      ('FA-Q008','Quemador gas natural mediano','unidad',0,1850000,2),
      ('FA-E009','Contactor 3x40A','unidad',25,68000,15),
      ('FA-S010','Rodamiento SKF 6308','unidad',8,54000,25)
    ) AS v(sku,name,unit,quantity,unit_cost,low_stock_threshold)
    WHERE NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.company_id = cid AND i.sku = v.sku);
  END IF;

  -- 3) Hoteles Caribe LTDA (hostelería: climatización, piscinas, planta)
  SELECT id INTO cid FROM companies WHERE name = 'Hoteles Caribe LTDA';
  IF cid IS NOT NULL THEN
    INSERT INTO inventory_items (company_id, sku, name, unit, quantity, unit_cost, low_stock_threshold)
    SELECT cid, v.sku, v.name, v.unit, v.quantity, v.unit_cost, v.low_stock_threshold
    FROM (VALUES
      ('HC-A001','Refrigerante R410A (cilindro)','cilindro',3,450000,2),
      ('HC-A002','Gas refrigerante R22 (cilindro)','cilindro',2,850000,1),
      ('HC-F003','Filtro de aire chiller (set)','set',5,115000,6),
      ('HC-B004','Bomba de sumidero 2HP','unidad',1,650000,2),
      ('HC-E005','Contactor 3x32A','unidad',10,58000,8),
      ('HC-N006','Neumático montacargas 2.5T','unidad',2,380000,4),
      ('HC-C007','Capacitor arranque 50uF','unidad',8,24000,10),
      ('HC-P008','Sello mecánico bomba piscina','unidad',0,98000,4),
      ('HC-T009','Termostato de ambiente','unidad',6,85000,8),
      ('HC-F010','Filtro de aceite planta CAT','unidad',4,115000,6)
    ) AS v(sku,name,unit,quantity,unit_cost,low_stock_threshold)
    WHERE NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.company_id = cid AND i.sku = v.sku);
  END IF;

  -- 4) Cementos Pacífico (cementera: molienda, horno, filtros)
  SELECT id INTO cid FROM companies WHERE name = 'Cementos Pacífico';
  IF cid IS NOT NULL THEN
    INSERT INTO inventory_items (company_id, sku, name, unit, quantity, unit_cost, low_stock_threshold)
    SELECT cid, v.sku, v.name, v.unit, v.quantity, v.unit_cost, v.low_stock_threshold
    FROM (VALUES
      ('CP-B001','Blindaje de molino (set)','set',2,12500000,3),
      ('CP-R002','Rodillo de chancadora (repuesto)','unidad',1,3800000,2),
      ('CP-A003','Aceite de molino ISO 150 (barril)','barril',8,2100000,5),
      ('CP-RE004','Refractario de horno (kg)','kg',1500,8500,1000),
      ('CP-F005','Filtro de mangas (bolsa)','bolsa',60,32000,80),
      ('CP-M006','Motorreductor 3/1 (11kW)','unidad',2,5400000,2),
      ('CP-B007','Bola de molienda 80mm (kg)','kg',0,3500,500),
      ('CP-R008','Retén de chancadora','unidad',4,62000,6),
      ('CP-S009','Sensor de temperatura horno','unidad',3,340000,5)
    ) AS v(sku,name,unit,quantity,unit_cost,low_stock_threshold)
    WHERE NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.company_id = cid AND i.sku = v.sku);
  END IF;

  RAISE NOTICE 'Inventario sembrado/idempotente OK';
END $$;