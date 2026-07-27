-- ====================================================================
-- MIGRATION: REMOVE VIEWS FROM BLOG POSTS
-- Objetivo: Remover a coluna views que foi descontinuada do portal e backend.
-- ====================================================================

ALTER TABLE "public"."blog_posts" DROP COLUMN IF EXISTS "views";
