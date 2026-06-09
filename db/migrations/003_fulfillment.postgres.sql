-- Phase 1 fulfillment: medication pharmacy fields (Postgres).
-- fulfillment_handoffs tables are created via schema_fulfillment in init_db.

ALTER TABLE medications ADD COLUMN IF NOT EXISTS pharmacy_name TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS pharmacy_address TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS refill_due_date TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS pickup_status TEXT DEFAULT '';
