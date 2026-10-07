-- Migration: 20261007140000_create_fretamentos_e_passeios.sql
-- Módulo de Fretamentos e Passeios (VAN 360)

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fretamento_tipo_enum') THEN
        CREATE TYPE public.fretamento_tipo_enum AS ENUM ('fretamento', 'passeio');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fretamento_status_enum') THEN
        CREATE TYPE public.fretamento_status_enum AS ENUM ('pendente', 'confirmado', 'concluido', 'cancelado');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fretamento_pagamento_status_enum') THEN
        CREATE TYPE public.fretamento_pagamento_status_enum AS ENUM ('pendente', 'pago_parcial', 'quitado');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participante_pagamento_status_enum') THEN
        CREATE TYPE public.participante_pagamento_status_enum AS ENUM ('pendente', 'pago');
    END IF;
END $$;

-- 1. Tabela Principal: fretamentos
CREATE TABLE IF NOT EXISTS public.fretamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    tipo public.fretamento_tipo_enum NOT NULL DEFAULT 'fretamento',
    titulo VARCHAR(255) NOT NULL,
    origem TEXT,
    destino TEXT NOT NULL,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE,
    contratante_nome VARCHAR(255),
    contratante_telefone VARCHAR(50),
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_por_pessoa NUMERIC(10, 2),
    vagas_totais INTEGER,
    chave_pix VARCHAR(255),
    observacoes TEXT,
    status public.fretamento_status_enum NOT NULL DEFAULT 'confirmado',
    status_pagamento public.fretamento_pagamento_status_enum NOT NULL DEFAULT 'pendente',
    slug_publico VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Veículos Alocados ao Fretamento/Passeio
CREATE TABLE IF NOT EXISTS public.fretamento_veiculos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fretamento_id UUID NOT NULL REFERENCES public.fretamentos(id) ON DELETE CASCADE,
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
    vagas_capacidade INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Histórico de Pagamentos de Fretamento (Sinal + Parcelas/Quitação)
CREATE TABLE IF NOT EXISTS public.fretamento_pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fretamento_id UUID NOT NULL REFERENCES public.fretamentos(id) ON DELETE CASCADE,
    valor NUMERIC(10, 2) NOT NULL,
    tipo_pagamento public.tipo_pagamento_enum NOT NULL DEFAULT 'PIX',
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Participantes do Passeio
CREATE TABLE IF NOT EXISTS public.fretamento_participantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fretamento_id UUID NOT NULL REFERENCES public.fretamentos(id) ON DELETE CASCADE,
    passageiro_id UUID REFERENCES public.passageiros(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    is_proprio_responsavel BOOLEAN NOT NULL DEFAULT FALSE,
    responsavel_nome VARCHAR(255),
    telefone VARCHAR(50),
    endereco TEXT,
    valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status_pagamento public.participante_pagamento_status_enum NOT NULL DEFAULT 'pendente',
    tipo_pagamento public.tipo_pagamento_enum,
    data_pagamento TIMESTAMP WITH TIME ZONE,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_fretamentos_usuario_data ON public.fretamentos (usuario_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_fretamentos_slug ON public.fretamentos (slug_publico);
CREATE INDEX IF NOT EXISTS idx_fretamento_veiculos_fretamento ON public.fretamento_veiculos (fretamento_id);
CREATE INDEX IF NOT EXISTS idx_fretamento_pagamentos_fretamento ON public.fretamento_pagamentos (fretamento_id);
CREATE INDEX IF NOT EXISTS idx_fretamento_part_fretamento ON public.fretamento_participantes (fretamento_id);

-- RLS
ALTER TABLE public.fretamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fretamento_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fretamento_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fretamento_participantes ENABLE ROW LEVEL SECURITY;

-- Políticas de Gerenciamento do Motorista
DROP POLICY IF EXISTS "Usuário gerencia seus fretamentos" ON public.fretamentos;
CREATE POLICY "Usuário gerencia seus fretamentos" ON public.fretamentos
    FOR ALL USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "Usuário gerencia veículos de fretamentos" ON public.fretamento_veiculos;
CREATE POLICY "Usuário gerencia veículos de fretamentos" ON public.fretamento_veiculos
    FOR ALL USING (EXISTS (SELECT 1 FROM public.fretamentos f WHERE f.id = fretamento_veiculos.fretamento_id AND f.usuario_id = auth.uid()));

DROP POLICY IF EXISTS "Usuário gerencia pagamentos de fretamentos" ON public.fretamento_pagamentos;
CREATE POLICY "Usuário gerencia pagamentos de fretamentos" ON public.fretamento_pagamentos
    FOR ALL USING (EXISTS (SELECT 1 FROM public.fretamentos f WHERE f.id = fretamento_pagamentos.fretamento_id AND f.usuario_id = auth.uid()));

DROP POLICY IF EXISTS "Usuário gerencia participantes de fretamentos" ON public.fretamento_participantes;
CREATE POLICY "Usuário gerencia participantes de fretamentos" ON public.fretamento_participantes
    FOR ALL USING (EXISTS (SELECT 1 FROM public.fretamentos f WHERE f.id = fretamento_participantes.fretamento_id AND f.usuario_id = auth.uid()));

-- Políticas Públicas para o Link de Inscrição dos Pais
DROP POLICY IF EXISTS "Acesso público leitura fretamento por slug" ON public.fretamentos;
CREATE POLICY "Acesso público leitura fretamento por slug" ON public.fretamentos
    FOR SELECT TO anon USING (slug_publico IS NOT NULL AND status != 'cancelado');

DROP POLICY IF EXISTS "Inscrição pública de participante" ON public.fretamento_participantes;
CREATE POLICY "Inscrição pública de participante" ON public.fretamento_participantes
    FOR INSERT TO anon WITH CHECK (EXISTS (SELECT 1 FROM public.fretamentos f WHERE f.id = fretamento_participantes.fretamento_id AND f.slug_publico IS NOT NULL AND f.status != 'cancelado'));
