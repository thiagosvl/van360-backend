-- 1. Criar a nova tabela de responsáveis adicionais
CREATE TABLE IF NOT EXISTS public.passageiro_responsaveis_adicionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    passageiro_id uuid NOT NULL REFERENCES public.passageiros(id) ON DELETE CASCADE,
    nome text NOT NULL,
    telefone text NOT NULL,
    cpf text NOT NULL,
    parentesco public.parentesco_enum NOT NULL DEFAULT 'outro'::public.parentesco_enum,
    logradouro text,
    numero text,
    bairro text,
    cidade text,
    estado text,
    cep text,
    referencia text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Ativar RLS e definir permissões de acesso
ALTER TABLE public.passageiro_responsaveis_adicionais ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.passageiro_responsaveis_adicionais TO anon;
GRANT ALL ON TABLE public.passageiro_responsaveis_adicionais TO authenticated;
GRANT ALL ON TABLE public.passageiro_responsaveis_adicionais TO service_role;
