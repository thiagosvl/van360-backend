-- Migration: Add whatsapp_status column to usuarios table
-- Created at: 2026-01-09
-- Description: Adds a column to track the connection status of the user's WhatsApp instance.

ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'DISCONNECTED';

-- Optional: Create an index if queries filter by status frequently
CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_status ON usuarios(whatsapp_status);

-- Comments
COMMENT ON COLUMN usuarios.whatsapp_status IS 'Status of the user''s WhatsApp instance (CONNECTED, DISCONNECTED, CONNECTING)';
