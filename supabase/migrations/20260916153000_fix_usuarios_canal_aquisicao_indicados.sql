-- =====================================================
-- MIGRATION: Corrigir canal_aquisicao de usuarios com indicacao
-- =====================================================

UPDATE public.usuarios u
SET canal_aquisicao = 'INDICACAO',
    updated_at = NOW()
FROM public.indicacoes i
WHERE i.indicado_id = u.id
  AND (u.canal_aquisicao IS NULL OR u.canal_aquisicao = '');
