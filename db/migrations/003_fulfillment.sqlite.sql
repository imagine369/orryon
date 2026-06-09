-- Phase 1 fulfillment: medication pharmacy fields + handoff tables (SQLite).

ALTER TABLE medications ADD COLUMN pharmacy_name TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN pharmacy_address TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN refill_due_date TEXT DEFAULT '';
ALTER TABLE medications ADD COLUMN pickup_status TEXT DEFAULT '';
