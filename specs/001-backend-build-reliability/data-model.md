# Data Model — Backend Build Reliability

Sin cambios de esquema. Solo se alinea la lectura de tipos con el esquema existente.

## Equipos (equipment)

| Campo | Tipo (esquema) | Uso en este feature |
|-------|----------------|---------------------|
| `id` | uuid | identidad |
| `company_id` | uuid | tenant (RLS) |
| `name` | text | alerta |
| `brand` | text | alerta |
| **`serial_number`** | text NOT NULL | alerta de expiración (`eq.serial_number`) |
| **`location`** | text DEFAULT '' | alerta de expiración (`eq.location`) |
| `last_maintenance_date` | timestamptz | cálculo vencimiento |
| `maintenance_frequency` | int | cálculo vencimiento |
| `next_maintenance_notification_sent` | boolean | deduplicación de aviso |

Esquema fuente: `supabase/migrations/001_schema.sql` (columnas `serial_number` y `location` en líneas 118-119). Tipos generados ya correctos en `supabase/types.ts` (`equipment.Row`: `serial_number: string`, `location: string`).

## Ajuste requerido
`daily-expiration-check.ts` debe seleccionar `serial_number` y `location` explícitamente para que su propio cliente (creado sin generic `Database`) los devuelva y los tipee:

```
.select('id, name, brand, serial_number, location, last_maintenance_date, maintenance_frequency, client_id, company_id, next_maintenance_notification_sent')
```

Estado: sin migraciones, sin transiciones.