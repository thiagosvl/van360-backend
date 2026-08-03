-- Migration: Adicionar restrição UNIQUE na tabela rota_ausencias para prevenir duplicidades por passageiro, rota e data
ALTER TABLE "public"."rota_ausencias" 
  DROP CONSTRAINT IF EXISTS "unique_passageiro_rota_data";

ALTER TABLE "public"."rota_ausencias" 
  ADD CONSTRAINT "unique_passageiro_rota_data" UNIQUE ("passageiro_id", "rota_id", "data_ausencia");
