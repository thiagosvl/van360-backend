ALTER TABLE public.cobrancas_repasses
    ALTER COLUMN motorista_id DROP NOT NULL;

ALTER TABLE public.cobrancas_repasses
    DROP CONSTRAINT IF EXISTS cobrancas_repasses_motorista_id_fkey,
    ADD CONSTRAINT cobrancas_repasses_motorista_id_fkey
        FOREIGN KEY (motorista_id)
        REFERENCES public.usuarios(id)
        ON DELETE SET NULL;
