--- SQL para Implementação do Repasse PIX ---

-- Adicionar colunas à tabela 'cobrancas' (cobranças dos pais)
ALTER TABLE public.cobrancas
ADD COLUMN txid_pix TEXT,
ADD COLUMN qr_code_payload TEXT,
ADD COLUMN url_qr_code TEXT,
ADD COLUMN valor_pago NUMERIC(10,2),
ADD COLUMN taxa_intermediacao_banco NUMERIC(10,2),
ADD COLUMN valor_a_repassar NUMERIC(10,2),
ADD COLUMN status_repasse VARCHAR(50) DEFAULT 'PENDENTE',
ADD COLUMN data_repasse TIMESTAMP,
ADD COLUMN id_transacao_repasse UUID;

-- Criar a nova tabela 'transacoes_repasse' para auditoria
CREATE TABLE public.transacoes_repasse (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE,
    cobranca_id UUID REFERENCES public.cobrancas(id) ON DELETE CASCADE,
    valor_repassado NUMERIC(10,2) NOT NULL,
    txid_pix_repasse TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSANDO',
    data_criacao TIMESTAMP DEFAULT NOW(),
    data_conclusao TIMESTAMP,
    mensagem_erro TEXT
);

-- Adicionar FK para 'id_transacao_repasse' na tabela 'cobrancas'
ALTER TABLE public.cobrancas
ADD CONSTRAINT fk_id_transacao_repasse
FOREIGN KEY (id_transacao_repasse)
REFERENCES public.transacoes_repasse(id);

-- Criar índices para otimização de consultas
CREATE INDEX idx_cobrancas_status_repasse ON public.cobrancas (status_repasse);
CREATE INDEX idx_transacoes_repasse_usuario_id ON public.transacoes_repasse (usuario_id);
CREATE INDEX idx_transacoes_repasse_cobranca_id ON public.transacoes_repasse (cobranca_id);

-- Ajustar a coluna 'status' da tabela 'cobrancas' para incluir 'REPASSADA'
-- (Isso pode ser feito via código ou um ALTER TABLE adicional se necessário, dependendo do seu ORM/Framework)
-- Exemplo: ALTER TYPE cobranca_status ADD VALUE 'REPASSADA'; (se for um ENUM)

-- Exemplo de atualização de status para a tabela 'cobrancas' (se for VARCHAR)
-- UPDATE public.cobrancas SET status = 'REPASSADA' WHERE id = 'algum_id';
