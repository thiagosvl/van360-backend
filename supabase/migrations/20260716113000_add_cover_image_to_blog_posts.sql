-- ====================================================================
-- MIGRATION: ADD COVER IMAGE TO BLOG POSTS
-- Objetivo: Adicionar coluna cover_image_url para imagens de destaque.
-- ====================================================================

ALTER TABLE "public"."blog_posts" ADD COLUMN IF NOT EXISTS "cover_image_url" VARCHAR(500);
