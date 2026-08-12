-- Migration: Subcontas Cascade e Logs Set Null
-- Garantir ON DELETE CASCADE para sub-contas em usuarios.conta_pai_id
-- Garantir ON DELETE SET NULL para activity_logs e admin_activity_logs

-- 1. Sub-contas (usuarios.conta_pai_id -> CASCADE)
ALTER TABLE public.usuarios 
  DROP CONSTRAINT IF EXISTS usuarios_conta_pai_id_fkey;

ALTER TABLE public.usuarios 
  ADD CONSTRAINT usuarios_conta_pai_id_fkey 
    FOREIGN KEY (conta_pai_id) 
    REFERENCES public.usuarios(id) 
    ON DELETE CASCADE;

-- 2. Logs de Atividade do Usuário (activity_logs.usuario_id -> SET NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_logs'
  ) THEN
    ALTER TABLE public.activity_logs 
      DROP CONSTRAINT IF EXISTS activity_logs_usuario_id_fkey;

    ALTER TABLE public.activity_logs 
      ADD CONSTRAINT activity_logs_usuario_id_fkey 
        FOREIGN KEY (usuario_id) 
        REFERENCES public.usuarios(id) 
        ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Logs de Atividade Admin (admin_activity_logs.admin_id -> SET NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_activity_logs'
  ) THEN
    ALTER TABLE public.admin_activity_logs 
      DROP CONSTRAINT IF EXISTS admin_activity_logs_admin_id_fkey;

    ALTER TABLE public.admin_activity_logs 
      ADD CONSTRAINT admin_activity_logs_admin_id_fkey 
        FOREIGN KEY (admin_id) 
        REFERENCES public.usuarios(id) 
        ON DELETE SET NULL;
  END IF;
END $$;
