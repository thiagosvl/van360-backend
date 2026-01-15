-- 1. SEED PLANOS (Base Only First)
INSERT INTO public.planos (id, parent_id, tipo, nome, slug, descricao_curta, ordem_exibicao, ativo, limite_passageiros, franquia_cobrancas_mes, preco, preco_promocional, promocao_ativa, permite_cobrancas, created_at, trial_days, beneficios)
VALUES 
('d2c48f69-1c16-43bd-a505-120b2e880c85', NULL, 'base', 'Gratuito', 'gratuito', 'Ideal apenas para testar.', 1, true, 5, 0, 0.00, NULL, false, false, '2025-10-30 15:08:48.988941+00', 0, '["Até {{LIMITE_PASSAGEIROS}} passageiros (Ideal para testar)", "Adeus caderno e planilhas: tudo organizado no celular", "Organize escolas, veículos e responsáveis", "Controle básico de quem pagou e quem deve", "Histórico simples de pagamentos"]'),
('ac17996e-5522-43f9-949a-41353542a53b', NULL, 'base', 'Essencial', 'essencial', 'Profissionalize sua gestão e organize quantos passageiros quiser.', 2, true, 0, 0, 89.90, 0.01, true, true, '2025-10-30 15:08:48.988941+00', 7, '["Passageiros e Cadastros ILIMITADOS", "Link de Cadastro: envie para os pais e eles preenchem por você", "Controle de Gastos: saiba seu lucro real (Combustível/Manutenção)", "Relatórios Financeiros e de Inadimplência", "Suporte prioritário via WhatsApp"]'),
('e0961539-3186-43e8-adac-4f009720d428', NULL, 'base', 'Profissional', 'profissional', 'Você só dirige. O sistema cobra, recebe, dá baixa e envia recibos.', 3, true, 0, 0, 0.00, 0.00, false, true, '2025-10-30 15:08:48.988941+00', 0, '["Cobrança 100% Automática no WhatsApp (Sem tocar no celular)", "Baixa automática de pagamentos PIX (Fim de conferir extrato)", "Envio automático de Recibos e Lembretes de vencimento", "Redução drástica da inadimplência e atrasos", "Você só dirige: o sistema cuida do financeiro"]')
ON CONFLICT (id) DO UPDATE SET 
    nome = EXCLUDED.nome,
    slug = EXCLUDED.slug,
    beneficios = EXCLUDED.beneficios;

-- 2. SEED PLANOS (Sub Plans - Dependents)
INSERT INTO public.planos (id, parent_id, tipo, nome, slug, descricao_curta, ordem_exibicao, ativo, limite_passageiros, franquia_cobrancas_mes, preco, preco_promocional, promocao_ativa, permite_cobrancas, created_at, trial_days, beneficios)
VALUES
('1c632a37-8f6a-4fa1-a734-c12e1ddaf44d', 'e0961539-3186-43e8-adac-4f009720d428', 'sub', 'Até 25 Cobranças', 'completo_25', NULL, 1, true, 0, 25, 107.00, 0.01, true, true, '2025-10-30 15:13:14.772511+00', 0, '[]'),
('21a70496-9769-48dd-857e-98726ab81292', 'e0961539-3186-43e8-adac-4f009720d428', 'sub', 'Até 50 Cobranças', 'completo_50', NULL, 2, true, 0, 60, 147.00, 0.02, true, true, '2025-10-30 15:13:14.772511+00', 0, '[]'),
('484db34f-23c3-4731-a11c-e85074ce1b23', 'e0961539-3186-43e8-adac-4f009720d428', 'sub', 'Até 90 Cobranças', 'completo_90', NULL, 3, true, 0, 90, 227.00, 0.03, true, true, '2025-10-30 15:13:14.772511+00', 0, '[]')
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    preco = EXCLUDED.preco;

-- 3. SEED CONFIGURACAO INTERNA
-- Note: Sensitive tokens (INTER_ACCESS_TOKEN) and environment specific URLs are OMITTED safely.
INSERT INTO public.configuracao_interna (chave, valor)
VALUES
('PRO_RATA_VALOR_MINIMO', '0.1'),
('PRO_RATA_DIAS_MES', '30'),
('VALOR_INCREMENTO_PASSAGEIRO_EXCESSO', '2.50'),
('TAXA_INTERMEDIACAO_PIX', '0.99'),
('DIA_GERACAO_MENSALIDADES', '25'),
('DIAS_ANTECEDENCIA_AVISO_VENCIMENTO', '2'),
('DIAS_ANTECEDENCIA_RENOVACAO', '5'),
('TRIAL_DIAS_ESSENCIAL', '7'),
('PIX_EXPIRACAO_SEGUNDOS', '3600'),
('PIX_VALIDADE_APOS_VENCIMENTO', '30')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
