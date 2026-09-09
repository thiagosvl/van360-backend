-- Remove o campo assinaturaCondutorUrl do JSONB dados_contrato na tabela contratos
-- Isso reduz o tamanho do banco em cerca de 26MB e evita o trânsito desnecessário do Base64
UPDATE public.contratos
SET dados_contrato = dados_contrato - 'assinaturaCondutorUrl'
WHERE dados_contrato ? 'assinaturaCondutorUrl';
