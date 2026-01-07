-- Configuração para o dia de geração automática de mensalidades
-- Default: Dia 25 de cada mês gera as cobranças do próximo mês.

INSERT INTO configuracao_interna (chave, valor, descricao)
VALUES 
    ('DIA_GERACAO_MENSALIDADES', '25', 'Dia do mês para gerar cobranças do mês seguinte')
ON CONFLICT (chave) DO UPDATE 
SET valor = EXCLUDED.valor;

-- Configuração para dias de antecedência do aviso de vencimento
INSERT INTO configuracao_interna (chave, valor, descricao)
VALUES 
    ('DIAS_ANTECEDENCIA_AVISO_VENCIMENTO', '2', 'Quantos dias antes do vencimento enviar aviso WhatsApp')
ON CONFLICT (chave) DO UPDATE 
SET valor = EXCLUDED.valor;
