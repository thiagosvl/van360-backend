-- Permitir que passageiro_id e cobranca_id sejam nulos para manter o registro contábil de repasse após exclusão do aluno ou cobrança
ALTER TABLE public.cobrancas_repasses
    ALTER COLUMN passageiro_id DROP NOT NULL,
    ALTER COLUMN cobranca_id DROP NOT NULL;

-- Atualizar foreign keys com ON DELETE SET NULL
ALTER TABLE public.cobrancas_repasses
    DROP CONSTRAINT IF EXISTS cobrancas_repasses_passageiro_id_fkey,
    ADD CONSTRAINT cobrancas_repasses_passageiro_id_fkey
        FOREIGN KEY (passageiro_id)
        REFERENCES public.passageiros(id)
        ON DELETE SET NULL;

ALTER TABLE public.cobrancas_repasses
    DROP CONSTRAINT IF EXISTS cobrancas_repasses_cobranca_id_fkey,
    ADD CONSTRAINT cobrancas_repasses_cobranca_id_fkey
        FOREIGN KEY (cobranca_id)
        REFERENCES public.cobrancas(id)
        ON DELETE SET NULL;
