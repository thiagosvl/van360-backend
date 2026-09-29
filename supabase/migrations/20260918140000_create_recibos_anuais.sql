CREATE TABLE IF NOT EXISTS public.recibos_anuais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passageiro_id UUID NOT NULL REFERENCES public.passageiros(id) ON DELETE CASCADE,
    motorista_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    ano INTEGER NOT NULL,
    recibo_url TEXT NOT NULL,
    total_pago NUMERIC(10, 2) NOT NULL,
    quantidade_meses INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_recibo_anual_passageiro_ano UNIQUE (passageiro_id, ano)
);

CREATE INDEX IF NOT EXISTS idx_recibos_anuais_lookup ON public.recibos_anuais(passageiro_id, ano);
CREATE INDEX IF NOT EXISTS idx_recibos_anuais_motorista ON public.recibos_anuais(motorista_id);

ALTER TABLE public.recibos_anuais ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'recibos_anuais' 
        AND policyname = 'Motoristas podem gerenciar recibos anuais dos seus alunos'
    ) THEN
        CREATE POLICY "Motoristas podem gerenciar recibos anuais dos seus alunos"
        ON public.recibos_anuais
        FOR ALL
        USING (auth.uid() = motorista_id)
        WITH CHECK (auth.uid() = motorista_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'recibos_anuais' 
        AND policyname = 'Responsáveis podem visualizar recibos anuais de seus alunos'
    ) THEN
        CREATE POLICY "Responsáveis podem visualizar recibos anuais de seus alunos"
        ON public.recibos_anuais
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.passageiro_responsaveis pr
                WHERE pr.passageiro_id = recibos_anuais.passageiro_id
                AND pr.responsavel_id = auth.uid()
            )
        );
    END IF;
END
$$;
