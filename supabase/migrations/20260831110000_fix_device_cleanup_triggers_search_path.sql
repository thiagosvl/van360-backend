-- Migration: Correção de search_path e Security Definer nas triggers de limpeza de push tokens
-- Data: 2026-08-19

-- 1. Recriação da função de limpeza ao deletar usuário (com SECURITY DEFINER e search_path qualificado)
CREATE OR REPLACE FUNCTION public.fn_clean_usuario_devices_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deleta push tokens associados ao ID do motorista/usuário
  DELETE FROM public.usuario_push_tokens WHERE user_id = OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_usuario_devices_on_delete ON public.usuarios;
CREATE TRIGGER trg_clean_usuario_devices_on_delete
  AFTER DELETE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clean_usuario_devices_on_delete();

-- 2. Recriação da função de limpeza ao deletar responsável (com SECURITY DEFINER e search_path qualificado)
CREATE OR REPLACE FUNCTION public.fn_clean_responsavel_devices_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deleta push tokens associados ao ID ou ao telefone do responsável
  DELETE FROM public.usuario_push_tokens 
  WHERE user_id = OLD.id::text 
     OR (OLD.telefone IS NOT NULL AND user_id = regexp_replace(OLD.telefone, '\D', '', 'g'));

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_responsavel_devices_on_delete ON public.responsaveis;
CREATE TRIGGER trg_clean_responsavel_devices_on_delete
  AFTER DELETE ON public.responsaveis
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clean_responsavel_devices_on_delete();
