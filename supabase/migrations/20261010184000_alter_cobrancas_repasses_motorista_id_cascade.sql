-- Migration: 20261010184000_alter_cobrancas_repasses_motorista_id_cascade.sql
-- Permitir exclusão em cascata de repasses quando um motorista for deletado da plataforma

ALTER TABLE public.cobrancas_repasses
    DROP CONSTRAINT IF EXISTS cobrancas_repasses_motorista_id_fkey,
    ADD CONSTRAINT cobrancas_repasses_motorista_id_fkey
        FOREIGN KEY (motorista_id)
        REFERENCES public.usuarios(id)
        ON DELETE CASCADE;
