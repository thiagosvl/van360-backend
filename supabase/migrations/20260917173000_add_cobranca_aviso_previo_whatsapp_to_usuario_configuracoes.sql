-- Migration: Adicionar coluna cobranca_aviso_previo_whatsapp_ativo na tabela usuario_configuracoes
-- Permite habilitar o envio de lembrete de cobranca previo via WhatsApp para motoristas especificos

ALTER TABLE public.usuario_configuracoes 
ADD COLUMN IF NOT EXISTS cobranca_aviso_previo_whatsapp_ativo BOOLEAN DEFAULT false NOT NULL;
