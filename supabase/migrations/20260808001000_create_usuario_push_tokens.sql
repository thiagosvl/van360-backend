CREATE TABLE IF NOT EXISTS usuario_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast token lookups by user
CREATE INDEX IF NOT EXISTS idx_usuario_push_tokens_user_id ON usuario_push_tokens(user_id);

-- RLS Security
ALTER TABLE usuario_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can view their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can delete their own push tokens" ON usuario_push_tokens;
DROP POLICY IF EXISTS "Users can update their own push tokens" ON usuario_push_tokens;

CREATE POLICY "Users can insert their own push tokens" 
    ON usuario_push_tokens FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own push tokens" 
    ON usuario_push_tokens FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens" 
    ON usuario_push_tokens FOR DELETE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens" 
    ON usuario_push_tokens FOR UPDATE
    USING (auth.uid() = user_id);
