CREATE OR REPLACE FUNCTION public.fn_limpar_logs_antigos(
  p_dias_login INT DEFAULT 30,
  p_dias_fila INT DEFAULT 30,
  p_dias_atividades INT DEFAULT 45
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_del_login INT := 0;
  v_del_fila INT := 0;
  v_del_atividades INT := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.tentativas_login
    WHERE created_at < NOW() - (p_dias_login || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_del_login FROM deleted;

  WITH deleted AS (
    DELETE FROM public.fila_notificacoes
    WHERE created_at < NOW() - (p_dias_fila || ' days')::INTERVAL
      AND status IN ('SENT', 'FAILED', 'CANCELLED')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_del_fila FROM deleted;

  WITH deleted AS (
    DELETE FROM public.historico_atividades
    WHERE created_at < NOW() - (p_dias_atividades || ' days')::INTERVAL
      AND id NOT IN (
        SELECT DISTINCT ON (usuario_id) id
        FROM public.historico_atividades
        WHERE usuario_id IS NOT NULL
        ORDER BY usuario_id, created_at DESC
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_del_atividades FROM deleted;

  RETURN jsonb_build_object(
    'tentativas_login_removidas', v_del_login,
    'fila_notificacoes_removidas', v_del_fila,
    'historico_atividades_removidas', v_del_atividades
  );
END;
$$;
