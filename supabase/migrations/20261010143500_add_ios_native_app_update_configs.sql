INSERT INTO public.configuracao_interna (chave, valor)
VALUES
  ('app_ios_min_version', '1.0.0'),
  ('app_ios_latest_version', '1.0.0'),
  ('app_ios_update_title', 'Atualização Disponível'),
  ('app_ios_update_message', 'Uma nova versão do Van360 está disponível na App Store com melhorias e novos recursos. Atualize para continuar aproveitando a melhor experiência.')
ON CONFLICT (chave) DO NOTHING;
