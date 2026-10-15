-- Habilita publicação em tempo real para passageiro_renovacoes
ALTER PUBLICATION supabase_realtime ADD TABLE passageiro_renovacoes;
ALTER TABLE passageiro_renovacoes REPLICA IDENTITY FULL;
