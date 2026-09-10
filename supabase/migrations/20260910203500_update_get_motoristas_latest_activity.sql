DROP FUNCTION IF EXISTS get_motoristas_latest_activity(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_motoristas_latest_activity(
  p_search TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'recent_first',
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0,
  p_health_status TEXT DEFAULT 'all',
  p_subscription_status TEXT DEFAULT 'active_trial'
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  apelido TEXT,
  telefone TEXT,
  email TEXT,
  cadastrado_em TIMESTAMPTZ,
  ultima_acao TEXT,
  ultima_descricao TEXT,
  ultima_atividade_at TIMESTAMPTZ,
  assinatura_status TEXT,
  assinatura_vencimento TIMESTAMPTZ,
  dias_inativo INT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total BIGINT;
  v_search_clean TEXT;
  v_digits TEXT;
BEGIN
  IF p_search IS NOT NULL AND TRIM(p_search) <> '' THEN
    v_search_clean := TRIM(p_search);
    v_digits := REGEXP_REPLACE(v_search_clean, '\D', '', 'g');
  END IF;

  SELECT COUNT(*)
  INTO v_total
  FROM usuarios u
  LEFT JOIN LATERAL (
    SELECT act.acao, act.descricao, act.created_at
    FROM historico_atividades act
    WHERE act.usuario_id = u.id
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    ORDER BY act.created_at DESC
    LIMIT 1
  ) ha ON true
  LEFT JOIN LATERAL (
    SELECT s.status
    FROM assinaturas s
    WHERE s.usuario_id = u.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  WHERE u.tipo = 'motorista'
    AND (
      p_subscription_status = 'all'
      OR (p_subscription_status = 'active_trial' AND sub.status IN ('ACTIVE', 'TRIAL'))
      OR (sub.status = p_subscription_status)
    )
    AND (
      p_health_status = 'all'
      OR (p_health_status = 'active' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) <= 2)
      OR (p_health_status = 'alert' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) BETWEEN 3 AND 7)
      OR (p_health_status = 'risk' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) > 7)
      OR (p_health_status = 'inactive' AND ha.created_at IS NULL)
    )
    AND (
      v_search_clean IS NULL
      OR u.nome ILIKE '%' || v_search_clean || '%'
      OR (u.apelido IS NOT NULL AND u.apelido ILIKE '%' || v_search_clean || '%')
      OR (u.email IS NOT NULL AND u.email ILIKE '%' || v_search_clean || '%')
      OR (v_digits IS NOT NULL AND LENGTH(v_digits) >= 3 AND u.telefone ILIKE '%' || v_digits || '%')
    );

  RETURN QUERY
  SELECT 
    u.id, 
    u.nome, 
    u.apelido, 
    u.telefone, 
    u.email, 
    u.created_at as cadastrado_em,
    ha.acao as ultima_acao,
    ha.descricao as ultima_descricao,
    ha.created_at as ultima_atividade_at,
    sub.status as assinatura_status,
    sub.data_vencimento as assinatura_vencimento,
    CASE 
      WHEN ha.created_at IS NOT NULL THEN EXTRACT(DAY FROM (NOW() - ha.created_at))::INT
      ELSE EXTRACT(DAY FROM (NOW() - u.created_at))::INT
    END as dias_inativo,
    v_total as total_count
  FROM usuarios u
  LEFT JOIN LATERAL (
    SELECT act.acao, act.descricao, act.created_at
    FROM historico_atividades act
    WHERE act.usuario_id = u.id
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    ORDER BY act.created_at DESC
    LIMIT 1
  ) ha ON true
  LEFT JOIN LATERAL (
    SELECT s.status, s.data_vencimento
    FROM assinaturas s
    WHERE s.usuario_id = u.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  WHERE u.tipo = 'motorista'
    AND (
      p_subscription_status = 'all'
      OR (p_subscription_status = 'active_trial' AND sub.status IN ('ACTIVE', 'TRIAL'))
      OR (sub.status = p_subscription_status)
    )
    AND (
      p_health_status = 'all'
      OR (p_health_status = 'active' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) <= 2)
      OR (p_health_status = 'alert' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) BETWEEN 3 AND 7)
      OR (p_health_status = 'risk' AND ha.created_at IS NOT NULL AND EXTRACT(DAY FROM (NOW() - ha.created_at)) > 7)
      OR (p_health_status = 'inactive' AND ha.created_at IS NULL)
    )
    AND (
      v_search_clean IS NULL
      OR u.nome ILIKE '%' || v_search_clean || '%'
      OR (u.apelido IS NOT NULL AND u.apelido ILIKE '%' || v_search_clean || '%')
      OR (u.email IS NOT NULL AND u.email ILIKE '%' || v_search_clean || '%')
      OR (v_digits IS NOT NULL AND LENGTH(v_digits) >= 3 AND u.telefone ILIKE '%' || v_digits || '%')
    )
  ORDER BY 
    CASE WHEN p_sort = 'recent_first' THEN ha.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'recent_first' THEN u.created_at END DESC,
    CASE WHEN p_sort = 'inactive_first' THEN ha.created_at END ASC NULLS FIRST,
    CASE WHEN p_sort = 'inactive_first' THEN u.created_at END ASC,
    CASE WHEN p_sort = 'oldest_first' THEN u.created_at END ASC,
    CASE WHEN p_sort = 'newest_first' THEN u.created_at END DESC,
    CASE WHEN p_sort = 'name_asc' THEN u.nome END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_motoristas_radar_stats(
  p_subscription_status TEXT DEFAULT 'active_trial'
)
RETURNS TABLE (
  total_motoristas BIGINT,
  total_ativos BIGINT,
  total_alerta BIGINT,
  total_em_risco BIGINT,
  total_sem_atividade BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH driver_activities AS (
    SELECT 
      u.id,
      ha.created_at as ultima_atividade_at,
      CASE 
        WHEN ha.created_at IS NULL THEN 'inactive'
        WHEN EXTRACT(DAY FROM (NOW() - ha.created_at)) <= 2 THEN 'active'
        WHEN EXTRACT(DAY FROM (NOW() - ha.created_at)) BETWEEN 3 AND 7 THEN 'alert'
        ELSE 'risk'
      END as health_status
    FROM usuarios u
    LEFT JOIN LATERAL (
      SELECT act.created_at
      FROM historico_atividades act
      WHERE act.usuario_id = u.id
        AND act.acao NOT LIKE 'SAAS_%'
        AND act.acao != 'NOTIFICACAO_WHATSAPP'
      ORDER BY act.created_at DESC
      LIMIT 1
    ) ha ON true
    LEFT JOIN LATERAL (
      SELECT s.status
      FROM assinaturas s
      WHERE s.usuario_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) sub ON true
    WHERE u.tipo = 'motorista'
      AND (
        p_subscription_status = 'all'
        OR (p_subscription_status = 'active_trial' AND sub.status IN ('ACTIVE', 'TRIAL'))
        OR (sub.status = p_subscription_status)
      )
  )
  SELECT
    COUNT(*)::BIGINT as total_motoristas,
    COUNT(*) FILTER (WHERE health_status = 'active')::BIGINT as total_ativos,
    COUNT(*) FILTER (WHERE health_status = 'alert')::BIGINT as total_alerta,
    COUNT(*) FILTER (WHERE health_status = 'risk')::BIGINT as total_em_risco,
    COUNT(*) FILTER (WHERE health_status = 'inactive')::BIGINT as total_sem_atividade
  FROM driver_activities;
END;
$$;
