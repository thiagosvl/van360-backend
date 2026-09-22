CREATE INDEX IF NOT EXISTS idx_execucoes_rota_rota_id ON public.execucoes_rota (rota_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_rota_usuario_id ON public.execucoes_rota (usuario_id);

CREATE INDEX IF NOT EXISTS idx_execucoes_rota_passageiros_execucao_rota_id ON public.execucoes_rota_passageiros (execucao_rota_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_rota_passageiros_passageiro_id ON public.execucoes_rota_passageiros (passageiro_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_rota_passageiros_escola_id ON public.execucoes_rota_passageiros (escola_id);

CREATE INDEX IF NOT EXISTS idx_rota_passageiros_rota_id ON public.rota_passageiros (rota_id);
CREATE INDEX IF NOT EXISTS idx_rota_passageiros_passageiro_id ON public.rota_passageiros (passageiro_id);
CREATE INDEX IF NOT EXISTS idx_rota_passageiros_escola_id ON public.rota_passageiros (escola_id);

CREATE INDEX IF NOT EXISTS idx_rotas_usuario_id ON public.rotas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_rotas_veiculo_id ON public.rotas (veiculo_id);

CREATE INDEX IF NOT EXISTS idx_gastos_usuario_id ON public.gastos (usuario_id);

CREATE INDEX IF NOT EXISTS idx_assinaturas_plano_id ON public.assinaturas (plano_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_metodo_pagamento_preferencial_id ON public.assinaturas (metodo_pagamento_preferencial_id);

CREATE INDEX IF NOT EXISTS idx_assinatura_faturas_usuario_id ON public.assinatura_faturas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_assinatura_faturas_plano_id ON public.assinatura_faturas (plano_id);

CREATE INDEX IF NOT EXISTS idx_pre_passageiros_escola_id ON public.pre_passageiros (escola_id);

CREATE INDEX IF NOT EXISTS idx_passageiro_ausencias_passageiro_id ON public.passageiro_ausencias (passageiro_id);
CREATE INDEX IF NOT EXISTS idx_passageiro_ausencias_registrado_por ON public.passageiro_ausencias (registrado_por);

CREATE INDEX IF NOT EXISTS idx_rota_ausencias_registrado_por ON public.rota_ausencias (registrado_por);

CREATE INDEX IF NOT EXISTS idx_blog_posts_author_id ON public.blog_posts (author_id);
