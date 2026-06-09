-- Ambient Mode user preference columns (Smart Ambient Pickup).

ALTER TABLE user_preferences ADD COLUMN ambient_mode_enabled INTEGER DEFAULT 0;
ALTER TABLE user_preferences ADD COLUMN ambient_sensitivity REAL DEFAULT 0.5;
ALTER TABLE user_preferences ADD COLUMN ambient_sound_style TEXT DEFAULT 'soft_glow_rise';
