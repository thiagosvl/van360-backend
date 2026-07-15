-- ====================================================================
-- MIGRATION: CREATE BLOG POSTS TABLE
-- Objetivo: Criar tabela para armazenar os posts do blog e ativar RLS.
-- ====================================================================

CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) UNIQUE NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(500),
    "tags" TEXT[] DEFAULT '{}'::text[] NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "author_id" UUID REFERENCES "public"."usuarios"("id") ON DELETE SET NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    
    CONSTRAINT "blog_posts_status_check" CHECK ("status" = ANY (ARRAY['draft'::text, 'published'::text])),
    CONSTRAINT "blog_posts_title_length" CHECK (char_length("title") >= 3)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;
