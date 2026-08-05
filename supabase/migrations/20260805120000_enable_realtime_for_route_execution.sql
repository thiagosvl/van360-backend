-- Migration: Habilita publicação Supabase Realtime para tabelas de execução de rota
-- Permite que motoristas e monitores recebam atualizações instantâneas via WebSocket

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
  END IF;
END $$;
