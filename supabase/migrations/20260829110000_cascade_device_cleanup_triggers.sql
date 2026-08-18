-- Migration: Triggers de Limpeza de Push Tokens (usuario_push_tokens) ao Excluir Usuário ou Responsável
-- Data: 2026-08-28

-- 1. Função e Trigger para Exclusão de Usuário (Motorista)
CREATE OR REPLACE FUNCTION fn_clean_usuario_devices_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Deleta push tokens associados ao ID do motorista/usuário
  DELETE FROM usuario_push_tokens WHERE user_id = OLD.id::text;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_usuario_devices_on_delete ON usuarios;
CREATE TRIGGER trg_clean_usuario_devices_on_delete
  AFTER DELETE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION fn_clean_usuario_devices_on_delete();

-- 2. Função e Trigger para Exclusão de Responsável
CREATE OR REPLACE FUNCTION fn_clean_responsavel_devices_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Deleta push tokens associados ao ID ou ao telefone do responsável
  DELETE FROM usuario_push_tokens 
  WHERE user_id = OLD.id::text 
     OR (OLD.telefone IS NOT NULL AND user_id = regexp_replace(OLD.telefone, '\D', '', 'g'));

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_responsavel_devices_on_delete ON responsaveis;
CREATE TRIGGER trg_clean_responsavel_devices_on_delete
  AFTER DELETE ON responsaveis
  FOR EACH ROW
  EXECUTE FUNCTION fn_clean_responsavel_devices_on_delete();
