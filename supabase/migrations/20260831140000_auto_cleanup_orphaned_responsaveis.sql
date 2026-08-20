-- Migration: Trigger de Limpeza Automática de Responsáveis Órfãos
-- Data: 2026-08-19

-- 1. Função que verifica e exclui o responsável se ele não possuir mais nenhum passageiro vinculado
CREATE OR REPLACE FUNCTION public.fn_cleanup_orphaned_responsavel_on_unlink()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o responsável não tiver mais nenhum vínculo na tabela passageiro_responsaveis, exclui o responsável
  IF NOT EXISTS (
    SELECT 1 
    FROM public.passageiro_responsaveis 
    WHERE responsavel_id = OLD.responsavel_id
  ) THEN
    DELETE FROM public.responsaveis 
    WHERE id = OLD.responsavel_id;
  END IF;

  RETURN OLD;
END;
$$;

-- 2. Trigger na tabela pivô passageiro_responsaveis
DROP TRIGGER IF EXISTS trg_cleanup_orphaned_responsavel_on_unlink ON public.passageiro_responsaveis;
CREATE TRIGGER trg_cleanup_orphaned_responsavel_on_unlink
  AFTER DELETE ON public.passageiro_responsaveis
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cleanup_orphaned_responsavel_on_unlink();

-- 3. Limpeza retroativa de responsáveis órfãos existentes
DELETE FROM public.responsaveis r
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.passageiro_responsaveis pr 
  WHERE pr.responsavel_id = r.id
);
