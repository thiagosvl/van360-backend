-- Alterar a tabela usuario_push_tokens para permitir IDs de responsável (telefone) além do UUID de motoristas
DROP POLICY IF EXISTS "Users can insert their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can view their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can delete their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can update their own push tokens" ON usuario_push_tokens;

ALTER TABLE usuario_push_tokens DROP CONSTRAINT IF EXISTS usuario_push_tokens_user_id_fkey;
ALTER TABLE usuario_push_tokens ALTER COLUMN user_id TYPE TEXT USING user_id::text;
CREATE INDEX IF NOT EXISTS idx_usuario_push_tokens_user_id ON usuario_push_tokens(user_id);
