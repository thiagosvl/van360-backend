-- Migration: Habilita publicação Supabase Realtime para tabelas de execução de rota e ausências
-- Permite que motoristas e monitores recebam atualizações instantâneas via WebSocket

ALTER TABLE execucoes_rota REPLICA IDENTITY FULL;
ALTER TABLE execucoes_rota_passageiros REPLICA IDENTITY FULL;
ALTER TABLE rota_ausencias REPLICA IDENTITY FULL;
ALTER TABLE passageiro_ausencias REPLICA IDENTITY FULL;

-- Políticas de RLS para permitir leitura via WebSocket no Supabase Realtime
DROP POLICY IF EXISTS "Permitir leitura de execucoes de rota" ON public.execucoes_rota;
CREATE POLICY "Permitir leitura de execucoes de rota"
  ON public.execucoes_rota FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir leitura de paradas da execucao" ON public.execucoes_rota_passageiros;
CREATE POLICY "Permitir leitura de paradas da execucao"
  ON public.execucoes_rota_passageiros FOR SELECT TO authenticated USING (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE execucoes_rota_passageiros;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE execucoes_rota;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE rota_ausencias;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE passageiro_ausencias;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
