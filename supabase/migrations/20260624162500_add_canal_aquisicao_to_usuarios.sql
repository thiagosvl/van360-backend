-- Add canal_aquisicao column to usuarios table
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS canal_aquisicao TEXT CHECK (canal_aquisicao IN ('INDICACAO', 'PANFLETO', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'GOOGLE', 'OUTROS'));
