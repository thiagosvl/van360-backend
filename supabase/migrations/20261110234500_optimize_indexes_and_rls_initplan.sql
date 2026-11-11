CREATE INDEX IF NOT EXISTS idx_cobrancas_repasses_cobranca_id
  ON public.cobrancas_repasses USING btree (cobranca_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_repasses_passageiro_id
  ON public.cobrancas_repasses USING btree (passageiro_id);

CREATE INDEX IF NOT EXISTS idx_passageiro_renovacoes_nova_escola_id
  ON public.passageiro_renovacoes USING btree (nova_escola_id);

CREATE INDEX IF NOT EXISTS idx_passageiro_renovacoes_novo_veiculo_id
  ON public.passageiro_renovacoes USING btree (novo_veiculo_id);

CREATE INDEX IF NOT EXISTS idx_historico_atividades_created_at
  ON public.historico_atividades USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_passageiros_ano_letivo;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fretamento_participantes'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_fretamento_participantes_passageiro_id
      ON public.fretamento_participantes USING btree (passageiro_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fretamento_veiculos'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_fretamento_veiculos_veiculo_id
      ON public.fretamento_veiculos USING btree (veiculo_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assinaturas'
      AND policyname = 'Permitir leitura de assinaturas pelo proprio usuario'
  ) THEN
    ALTER POLICY "Permitir leitura de assinaturas pelo proprio usuario"
      ON public.assinaturas
      USING ((select auth.uid()) = usuario_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assinatura_faturas'
      AND policyname = 'Permitir leitura de faturas pelo proprio usuario'
  ) THEN
    ALTER POLICY "Permitir leitura de faturas pelo proprio usuario"
      ON public.assinatura_faturas
      USING ((select auth.uid()) = usuario_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cobrancas_repasses'
      AND policyname = 'Enable read access for motoristas on own cobrancas_repasses'
  ) THEN
    ALTER POLICY "Enable read access for motoristas on own cobrancas_repasses"
      ON public.cobrancas_repasses
      USING (motorista_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fretamentos'
      AND policyname = 'fretamentos_motorista_all'
  ) THEN
    ALTER POLICY "fretamentos_motorista_all"
      ON public.fretamentos
      USING (usuario_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fretamento_pagamentos'
      AND policyname = 'fretamento_pagamentos_motorista_all'
  ) THEN
    ALTER POLICY "fretamento_pagamentos_motorista_all"
      ON public.fretamento_pagamentos
      USING (
        EXISTS (
          SELECT 1
          FROM public.fretamentos f
          WHERE f.id = fretamento_pagamentos.fretamento_id
            AND f.usuario_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fretamento_participantes'
      AND policyname = 'fretamento_participantes_motorista_all'
  ) THEN
    ALTER POLICY "fretamento_participantes_motorista_all"
      ON public.fretamento_participantes
      USING (
        EXISTS (
          SELECT 1
          FROM public.fretamentos f
          WHERE f.id = fretamento_participantes.fretamento_id
            AND f.usuario_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fretamento_veiculos'
      AND policyname = 'fretamento_veiculos_motorista_all'
  ) THEN
    ALTER POLICY "fretamento_veiculos_motorista_all"
      ON public.fretamento_veiculos
      USING (
        EXISTS (
          SELECT 1
          FROM public.fretamentos f
          WHERE f.id = fretamento_veiculos.fretamento_id
            AND f.usuario_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gasto_categorias'
      AND policyname = 'Permitir escrita de categorias para o proprio usuario'
  ) THEN
    ALTER POLICY "Permitir escrita de categorias para o proprio usuario"
      ON public.gasto_categorias
      USING ((select auth.uid()) = usuario_id)
      WITH CHECK ((select auth.uid()) = usuario_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gasto_categorias'
      AND policyname = 'Permitir leitura de categorias globais e do proprio usuario'
  ) THEN
    ALTER POLICY "Permitir leitura de categorias globais e do proprio usuario"
      ON public.gasto_categorias
      USING ((usuario_id IS NULL) OR ((select auth.uid()) = usuario_id));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'passageiro_renovacoes'
      AND policyname = 'Motoristas podem gerenciar suas proprias renovacoes'
  ) THEN
    ALTER POLICY "Motoristas podem gerenciar suas proprias renovacoes"
      ON public.passageiro_renovacoes
      USING (usuario_id = (select auth.uid()))
      WITH CHECK (usuario_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recibos_anuais'
      AND policyname = 'Motoristas podem gerenciar recibos anuais dos seus alunos'
  ) THEN
    ALTER POLICY "Motoristas podem gerenciar recibos anuais dos seus alunos"
      ON public.recibos_anuais
      USING ((select auth.uid()) = motorista_id)
      WITH CHECK ((select auth.uid()) = motorista_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recibos_anuais'
      AND policyname = 'Responsáveis podem visualizar recibos anuais de seus alunos'
  ) THEN
    ALTER POLICY "Responsáveis podem visualizar recibos anuais de seus alunos"
      ON public.recibos_anuais
      USING (
        EXISTS (
          SELECT 1
          FROM public.passageiro_responsaveis pr
          WHERE pr.passageiro_id = recibos_anuais.passageiro_id
            AND pr.responsavel_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuario_configuracoes'
      AND policyname = 'Motoristas podem gerenciar suas próprias configurações'
  ) THEN
    ALTER POLICY "Motoristas podem gerenciar suas próprias configurações"
      ON public.usuario_configuracoes
      USING ((select auth.uid()) = usuario_id)
      WITH CHECK ((select auth.uid()) = usuario_id);
  END IF;
END $$;
