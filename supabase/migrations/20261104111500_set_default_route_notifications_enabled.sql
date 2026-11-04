ALTER TABLE public.usuario_configuracoes 
  ALTER COLUMN notificar_inicio_rota SET DEFAULT true,
  ALTER COLUMN notificar_proxima_parada SET DEFAULT true,
  ALTER COLUMN notificar_conclusao_parada SET DEFAULT true;

ALTER TABLE public.execucoes_rota 
  ALTER COLUMN notificar_inicio_rota SET DEFAULT true,
  ALTER COLUMN notificar_proxima_parada SET DEFAULT true,
  ALTER COLUMN notificar_conclusao_parada SET DEFAULT true;
