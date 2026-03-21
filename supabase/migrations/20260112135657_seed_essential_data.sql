-- 1. SEED CONFIGURACAO INTERNA
-- Configurações operacionais para gestão de mensalidades dos alunos.
INSERT INTO public.configuracao_interna (chave, valor)
VALUES
('DIA_GERACAO_MENSALIDADES', '25'),
('DIAS_ANTECEDENCIA_AVISO_VENCIMENTO', '2'),
('PIX_EXPIRACAO_SEGUNDOS', '3600'),
('PIX_VALIDADE_APOS_VENCIMENTO', '30'),
('DIAS_COBRANCA_POS_VENCIMENTO', '3')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
