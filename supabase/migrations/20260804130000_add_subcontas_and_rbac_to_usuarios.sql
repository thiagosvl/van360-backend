-- Migration: Adicionar suporte a Sub-contas (Multi-Motoristas e Monitores) e colunas de Tenant/Veículo

-- 1. Expandir os valores permitidos no tipo ENUM user_type_enum
ALTER TYPE "public"."user_type_enum" ADD VALUE IF NOT EXISTS 'motorista_auxiliar';
ALTER TYPE "public"."user_type_enum" ADD VALUE IF NOT EXISTS 'monitor';
ALTER TYPE "public"."user_type_enum" ADD VALUE IF NOT EXISTS 'responsavel';

-- 2. Atualizar a Check Constraint da coluna 'tipo' na tabela 'usuarios' usando tipo::text para evitar erro Postgres 55P04 (unsafe use of new enum value in same transaction)
ALTER TABLE "public"."usuarios" 
DROP CONSTRAINT IF EXISTS "check_usuario_tipo";

ALTER TABLE "public"."usuarios" 
ADD CONSTRAINT "check_usuario_tipo" 
CHECK (tipo::text IN ('admin', 'motorista', 'motorista_auxiliar', 'monitor', 'responsavel'));

-- 3. Adicionar colunas de vinculo de Conta Pai (Tenant Gestor) e Veiculo Atribuido
ALTER TABLE "public"."usuarios" 
ADD COLUMN IF NOT EXISTS "conta_pai_id" UUID REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "veiculo_id" UUID REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- 4. Criar índices para otimização de busca de sub-contas e permissões
CREATE INDEX IF NOT EXISTS "idx_usuarios_conta_pai" ON "public"."usuarios"("conta_pai_id");
CREATE INDEX IF NOT EXISTS "idx_usuarios_veiculo" ON "public"."usuarios"("veiculo_id");
CREATE INDEX IF NOT EXISTS "idx_usuarios_tipo" ON "public"."usuarios"("tipo");

-- 5. Permissão para ler e manipular colunas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."usuarios" TO anon, authenticated, service_role;
