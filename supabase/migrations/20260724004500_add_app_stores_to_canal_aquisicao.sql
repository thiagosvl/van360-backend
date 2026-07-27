-- Update canal_aquisicao check constraint to include PLAY_STORE and APP_STORE
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_canal_aquisicao_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_canal_aquisicao_check CHECK (canal_aquisicao IN ('PLAY_STORE', 'APP_STORE', 'INDICACAO', 'PANFLETO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'GOOGLE', 'OUTROS'));
