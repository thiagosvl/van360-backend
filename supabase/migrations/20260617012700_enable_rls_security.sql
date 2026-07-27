-- ====================================================================
-- MIGRATION: SECURITY HARDENING (RLS)
-- Objetivo: Bloquear acesso público direto (via chaves anon/authenticated) 
-- a todas as tabelas, permitindo apenas leitura via Realtime onde for 
-- estritamente necessário para o Front-end.
-- ====================================================================

-- 1. Ativar RLS em TODAS as tabelas do sistema
ALTER TABLE "public"."app_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cobrancas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."configuracao_interna" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."escolas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."gastos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."passageiros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pre_passageiros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."veiculos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contratos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."historico_atividades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recuperacoes_senha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."planos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."metodos_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assinaturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assinatura_faturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."indicacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assinatura_notificacoes" ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 2. Políticas de Exceção (Apenas para o Tempo Real do Front-end)
-- Como o front-end escuta as tabelas de assinatura usando supabase.channel,
-- o usuário logado precisa ter permissão de LEITURA (SELECT) apenas nas
-- linhas que pertencem a ele (auth.uid() = usuario_id).
-- ====================================================================

-- Tabela: assinaturas
CREATE POLICY "Permitir leitura de assinaturas pelo proprio usuario" 
ON "public"."assinaturas" 
FOR SELECT 
USING (auth.uid() = usuario_id);

-- Tabela: assinatura_faturas
CREATE POLICY "Permitir leitura de faturas pelo proprio usuario" 
ON "public"."assinatura_faturas" 
FOR SELECT 
USING (auth.uid() = usuario_id);

-- O Backend (Fastify) continuará acessando TUDO, pois utiliza a 
-- "service_role key", que automaticamente ignora (bypassa) o RLS.
