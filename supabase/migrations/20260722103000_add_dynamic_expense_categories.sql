-- Migration: Add Dynamic Expense Categories
-- Criar tabela gasto_categorias e popular categorias padrão

CREATE TABLE IF NOT EXISTS "public"."gasto_categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "usuario_id" "uuid" REFERENCES "public"."usuarios"("id") ON DELETE CASCADE,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "cor" "text" DEFAULT 'slate' NOT NULL,
    "icone" "text" DEFAULT 'Tag' NOT NULL,
    CONSTRAINT "uniq_usuario_categoria_nome" UNIQUE NULLS NOT DISTINCT ("usuario_id", "nome"),
    CONSTRAINT "uniq_usuario_categoria_slug" UNIQUE NULLS NOT DISTINCT ("usuario_id", "slug")
);

-- Ativar RLS
ALTER TABLE "public"."gasto_categorias" ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Permitir leitura de categorias globais e do proprio usuario" 
ON "public"."gasto_categorias" 
FOR SELECT 
USING (usuario_id IS NULL OR auth.uid() = usuario_id);

CREATE POLICY "Permitir escrita de categorias para o proprio usuario" 
ON "public"."gasto_categorias" 
FOR ALL 
USING (auth.uid() = usuario_id)
WITH CHECK (auth.uid() = usuario_id);

-- Inserir as categorias padrão (Globais)
INSERT INTO "public"."gasto_categorias" ("usuario_id", "nome", "slug", "cor", "icone") VALUES
(NULL, 'Combustível', 'combustivel', 'orange', 'Fuel'),
(NULL, 'Manutenção', 'manutencao', 'blue', 'Wrench'),
(NULL, 'Impostos', 'impostos', 'red', 'FileText'),
(NULL, 'Multas', 'multas', 'red', 'ClipboardCheck'),
(NULL, 'Lavagem', 'lavagem', 'cyan', 'Cog'),
(NULL, 'Alimentação', 'alimentacao', 'green', 'Wallet'),
(NULL, 'Seguro', 'seguro', 'indigo', 'ClipboardCheck'),
(NULL, 'Outros', 'outros', 'gray', 'HelpCircle')
ON CONFLICT DO NOTHING;
