-- Migration: Adicionar cobrança automática, split de pagamentos e infraestrutura de BaaS
-- Data: 2026-10-03

-- 1. Enums do Domínio Financeiro
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidade_cobranca_enum') THEN
        CREATE TYPE public.modalidade_cobranca_enum AS ENUM (
            'MANUAL',
            'SPLIT_SUBCONTA',
            'BAAS_CONTA_PROPRIA'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'baas_status_enum') THEN
        CREATE TYPE public.baas_status_enum AS ENUM (
            'NAO_INICIADO',
            'PENDENTE_DOCUMENTACAO',
            'EM_ANALISE',
            'APROVADO',
            'PENDENCIA',
            'REJEITADO'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_repasse_enum') THEN
        CREATE TYPE public.status_repasse_enum AS ENUM (
            'PENDENTE',
            'PROCESSANDO',
            'SUCESSO',
            'FALHA',
            'CANCELADO'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provedor_pagamento_enum') THEN
        CREATE TYPE public.provedor_pagamento_enum AS ENUM (
            'WOOVI',
            'ASAAS',
            'EFIPAY'
        );
    END IF;
END $$;

-- 2. Tabela de Configurações Financeiras do Motorista
CREATE TABLE IF NOT EXISTS public.motorista_configuracoes_financeiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    modalidade_cobranca public.modalidade_cobranca_enum NOT NULL DEFAULT 'MANUAL',
    cobranca_automatica_ativa BOOLEAN NOT NULL DEFAULT false,
    
    -- Configurações de Saque / Split
    chave_pix_repasse VARCHAR(255),
    tipo_chave_pix VARCHAR(20),
    subconta_provedor_id VARCHAR(255),
    
    -- Configurações de BaaS
    baas_status public.baas_status_enum NOT NULL DEFAULT 'NAO_INICIADO',
    baas_account_id VARCHAR(255),
    baas_kyc_url TEXT,
    baas_motivo_pendencia TEXT,
    baas_agencia VARCHAR(20),
    baas_conta VARCHAR(30),
    baas_banco VARCHAR(50),
    
    -- Hierarquia de Taxas
    taxa_personalizada NUMERIC(10,2) DEFAULT NULL,
    repassar_taxa_pais_padrao BOOLEAN NOT NULL DEFAULT false,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_motorista_config_usuario UNIQUE (usuario_id)
);

-- 3. Atualização na Tabela cobrancas
ALTER TABLE public.cobrancas
    ADD COLUMN IF NOT EXISTS provedor public.provedor_pagamento_enum DEFAULT 'WOOVI',
    ADD COLUMN IF NOT EXISTS provedor_cobranca_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT,
    ADD COLUMN IF NOT EXISTS pix_qrcode_url TEXT,
    ADD COLUMN IF NOT EXISTS pix_expiracao TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS valor_taxa_plataforma NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS taxa_repassada_ao_pai BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS repasse_em_processamento BOOLEAN DEFAULT false;

-- 4. Atualização na Tabela passageiros (Carteirinha do Aluno)
ALTER TABLE public.passageiros
    ADD COLUMN IF NOT EXISTS cobranca_automatica_ativa BOOLEAN DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS repassar_taxa_pai BOOLEAN DEFAULT NULL;

-- 5. Tabela de Auditoria e Rastreabilidade Forense: cobrancas_repasses
CREATE TABLE IF NOT EXISTS public.cobrancas_repasses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cobranca_id UUID NOT NULL REFERENCES public.cobrancas(id) ON DELETE RESTRICT,
    motorista_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    passageiro_id UUID NOT NULL REFERENCES public.passageiros(id) ON DELETE RESTRICT,
    provedor public.provedor_pagamento_enum NOT NULL DEFAULT 'WOOVI',
    
    -- Discriminação de Valores
    valor_bruto NUMERIC(10,2) NOT NULL,
    taxa_plataforma NUMERIC(10,2) NOT NULL,
    tarifa_gateway_pix_in NUMERIC(10,2) NOT NULL DEFAULT 0.85,
    tarifa_gateway_saque NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    valor_liquido_motorista NUMERIC(10,2) NOT NULL,
    
    -- Identificadores Bancários
    transacao_provedor_id VARCHAR(255) NOT NULL,
    saque_provedor_id VARCHAR(255),
    end_to_end_id_in VARCHAR(255),
    end_to_end_id_out VARCHAR(255),
    
    -- Máquina de Estados
    status_repasse public.status_repasse_enum NOT NULL DEFAULT 'PENDENTE',
    tentativas INTEGER NOT NULL DEFAULT 0,
    ultimo_erro TEXT,
    
    data_pagamento_pai TIMESTAMPTZ,
    data_repasse_motorista TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_transacao_provedor UNIQUE (transacao_provedor_id)
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_cobrancas_repasses_motorista ON public.cobrancas_repasses(motorista_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_repasses_status ON public.cobrancas_repasses(status_repasse);
CREATE INDEX IF NOT EXISTS idx_cobrancas_provedor_id ON public.cobrancas(provedor_cobranca_id);
