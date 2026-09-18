ALTER TABLE public.usuario_configuracoes 
  ALTER COLUMN notificar_inicio_rota SET DEFAULT false,
  ALTER COLUMN notificar_proxima_parada SET DEFAULT false,
  ALTER COLUMN notificar_conclusao_parada SET DEFAULT false;

ALTER TABLE public.execucoes_rota 
  ALTER COLUMN notificar_inicio_rota SET DEFAULT false,
  ALTER COLUMN notificar_proxima_parada SET DEFAULT false,
  ALTER COLUMN notificar_conclusao_parada SET DEFAULT false;
