-- Migration: Add WhatsApp Disconnection Notification Tracking
-- Purpose: Track when disconnection notifications are sent to prevent spam
-- Author: Manus AI
-- Date: 2025-01-15

-- Add columns to usuarios table for tracking disconnection notifications
ALTER TABLE "public"."usuarios"
ADD COLUMN IF NOT EXISTS "last_disconnection_notification_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "disconnection_notification_count" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "whatsapp_last_status_change_at" timestamp with time zone DEFAULT now();

-- Create index for efficient queries on notification tracking
CREATE INDEX IF NOT EXISTS "idx_usuarios_last_disconnection_notification" 
ON "public"."usuarios"("id", "last_disconnection_notification_at");

-- Create index for whatsapp status changes
CREATE INDEX IF NOT EXISTS "idx_usuarios_whatsapp_status_change" 
ON "public"."usuarios"("whatsapp_status", "whatsapp_last_status_change_at");

-- Add comment for documentation
COMMENT ON COLUMN "public"."usuarios"."last_disconnection_notification_at" IS 'Timestamp of the last disconnection notification sent to prevent spam';
COMMENT ON COLUMN "public"."usuarios"."disconnection_notification_count" IS 'Counter to track how many disconnection notifications have been sent (resets daily)';
COMMENT ON COLUMN "public"."usuarios"."whatsapp_last_status_change_at" IS 'Timestamp of the last status change to help identify persistent disconnections';
