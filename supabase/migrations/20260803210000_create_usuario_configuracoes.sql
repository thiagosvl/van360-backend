-- Migration: Criar tabela de configurações do usuário (usuario_configuracoes)
CREATE TABLE IF NOT EXISTS public.usuario_configuracoes (
    usuario_id UUID PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
    notificar_pais_cobrancas BOOLEAN DEFAULT true NOT NULL,
    notificar_motorista_parcelas BOOLEAN DEFAULT true NOT NULL,
    notificar_motorista_aniversarios BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Ativar RLS
ALTER TABLE public.usuario_configuracoes ENABLE ROW LEVEL SECURITY;

-- Política de RLS
DROP POLICY IF EXISTS "Motoristas podem gerenciar suas próprias configurações" ON public.usuario_configuracoes;
CREATE POLICY "Motoristas podem gerenciar suas próprias configurações" 
ON public.usuario_configuracoes 
FOR ALL 
USING (auth.uid() = usuario_id) 
WITH CHECK (auth.uid() = usuario_id);

-- Inserir configurações padrão para motoristas já existentes na base
INSERT INTO public.usuario_configuracoes (usuario_id)
SELECT id FROM public.usuarios
WHERE tipo = 'motorista'
ON CONFLICT (usuario_id) DO NOTHING;
