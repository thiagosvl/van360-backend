-- Inserir configurações padrão para controle de versão nativa do App Mobile (Play Store)
INSERT INTO public.configuracao_interna (chave, valor)
VALUES
  ('app_android_min_version', '1.0.0'),
  ('app_android_latest_version', '1.0.5'),
  ('app_android_update_title', 'Atualização Disponível'),
  ('app_android_update_message', 'Uma nova versão do Van360 está disponível na Google Play com melhorias e novos recursos. Atualize para continuar aproveitando a melhor experiência.')
ON CONFLICT (chave) DO NOTHING;
