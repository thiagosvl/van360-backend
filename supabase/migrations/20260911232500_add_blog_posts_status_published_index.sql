-- Migration: Adiciona índice composto para listagem e ordenação de posts do blog publicados
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published
ON public.blog_posts (status, published_at DESC);
