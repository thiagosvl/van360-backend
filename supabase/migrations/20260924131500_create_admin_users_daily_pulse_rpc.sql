CREATE OR REPLACE FUNCTION get_motoristas_daily_pulse_stats(
  p_date DATE DEFAULT CURRENT_DATE,
  p_tz TEXT DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  total_acessos_unicos BIGINT,
  total_recorrentes BIGINT,
  total_novos BIGINT,
  total_novos_reengajados BIGINT,
  total_trial BIGINT,
  total_ativos BIGINT,
  total_vitalicios BIGINT,
  total_vencidos_expirados BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
BEGIN
  v_start_tz := (p_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_tz;
  v_end_tz := (p_date::TEXT || ' 23:59:59.999999')::TIMESTAMP AT TIME ZONE p_tz;

  RETURN QUERY
  WITH daily_active_users AS (
    SELECT
      u.id,
      u.created_at,
      COUNT(act.id) AS total_atividades,
      MIN(act.created_at) AS primeiro_acesso,
      MAX(act.created_at) AS ultimo_acesso,
      sub.status AS assinatura_status,
      sub.data_vencimento AS assinatura_vencimento
    FROM usuarios u
    JOIN historico_atividades act ON act.usuario_id = u.id
    LEFT JOIN LATERAL (
      SELECT s.status, s.data_vencimento
      FROM assinaturas s
      WHERE s.usuario_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) sub ON true
    WHERE u.tipo = 'motorista'
      AND act.created_at >= v_start_tz
      AND act.created_at <= v_end_tz
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    GROUP BY u.id, u.created_at, sub.status, sub.data_vencimento
  )
  SELECT
    COUNT(*)::BIGINT AS total_acessos_unicos,
    COUNT(*) FILTER (WHERE created_at < v_start_tz)::BIGINT AS total_recorrentes,
    COUNT(*) FILTER (WHERE created_at >= v_start_tz AND created_at <= v_end_tz)::BIGINT AS total_novos,
    COUNT(*) FILTER (
      WHERE created_at >= v_start_tz 
        AND created_at <= v_end_tz 
        AND (total_atividades > 1 AND EXTRACT(EPOCH FROM (ultimo_acesso - primeiro_acesso)) >= 900)
    )::BIGINT AS total_novos_reengajados,
    COUNT(*) FILTER (WHERE assinatura_status = 'TRIAL')::BIGINT AS total_trial,
    COUNT(*) FILTER (WHERE assinatura_status = 'ACTIVE' AND assinatura_vencimento IS NOT NULL)::BIGINT AS total_ativos,
    COUNT(*) FILTER (WHERE assinatura_status = 'ACTIVE' AND assinatura_vencimento IS NULL)::BIGINT AS total_vitalicios,
    COUNT(*) FILTER (WHERE assinatura_status IN ('PAST_DUE', 'EXPIRED', 'CANCELED'))::BIGINT AS total_vencidos_expirados
  FROM daily_active_users;
END;
$func$;

CREATE OR REPLACE FUNCTION get_motoristas_daily_pulse(
  p_date DATE DEFAULT CURRENT_DATE,
  p_tz TEXT DEFAULT 'America/Sao_Paulo',
  p_search TEXT DEFAULT NULL,
  p_tipo_usuario TEXT DEFAULT 'all',
  p_subscription_status TEXT DEFAULT 'all',
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  apelido TEXT,
  telefone TEXT,
  email TEXT,
  cadastrado_em TIMESTAMPTZ,
  tipo_usuario_dia TEXT,
  reengajou_no_dia BOOLEAN,
  total_atividades_dia BIGINT,
  primeiro_acesso_dia TIMESTAMPTZ,
  ultimo_acesso_dia TIMESTAMPTZ,
  ultima_acao_dia TEXT,
  ultima_descricao_dia TEXT,
  assinatura_status TEXT,
  assinatura_vencimento TIMESTAMPTZ,
  is_vitalicio BOOLEAN,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
  v_total BIGINT;
  v_search_clean TEXT;
  v_digits TEXT;
BEGIN
  v_start_tz := (p_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_tz;
  v_end_tz := (p_date::TEXT || ' 23:59:59.999999')::TIMESTAMP AT TIME ZONE p_tz;

  IF p_search IS NOT NULL AND TRIM(p_search) <> '' THEN
    v_search_clean := TRIM(p_search);
    v_digits := REGEXP_REPLACE(v_search_clean, '\D', '', 'g');
  END IF;

  WITH active_drivers AS (
    SELECT
      u.id,
      u.nome,
      u.apelido,
      u.telefone,
      u.email,
      u.created_at AS cadastrado_em,
      CASE 
        WHEN u.created_at < v_start_tz THEN 'recorrente'
        ELSE 'novo'
      END AS tipo_usuario_dia,
      CASE
        WHEN u.created_at >= v_start_tz 
          AND COUNT(act.id) > 1 
          AND EXTRACT(EPOCH FROM (MAX(act.created_at) - MIN(act.created_at))) >= 900
        THEN true
        ELSE false
      END AS reengajou_no_dia,
      COUNT(act.id)::BIGINT AS total_atividades_dia,
      MIN(act.created_at) AS primeiro_acesso_dia,
      MAX(act.created_at) AS ultimo_acesso_dia,
      sub.status AS assinatura_status,
      sub.data_vencimento AS assinatura_vencimento,
      (sub.status = 'ACTIVE' AND sub.data_vencimento IS NULL) AS is_vitalicio
    FROM usuarios u
    JOIN historico_atividades act ON act.usuario_id = u.id
    LEFT JOIN LATERAL (
      SELECT s.status, s.data_vencimento
      FROM assinaturas s
      WHERE s.usuario_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) sub ON true
    WHERE u.tipo = 'motorista'
      AND act.created_at >= v_start_tz
      AND act.created_at <= v_end_tz
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    GROUP BY u.id, u.nome, u.apelido, u.telefone, u.email, u.created_at, sub.status, sub.data_vencimento
  )
  SELECT COUNT(*)
  INTO v_total
  FROM active_drivers d
  WHERE (
      p_tipo_usuario = 'all'
      OR d.tipo_usuario_dia = p_tipo_usuario
    )
    AND (
      p_subscription_status = 'all'
      OR (p_subscription_status = 'ACTIVE' AND d.assinatura_status = 'ACTIVE' AND d.assinatura_vencimento IS NOT NULL)
      OR (p_subscription_status = 'VITALICIO' AND d.assinatura_status = 'ACTIVE' AND d.assinatura_vencimento IS NULL)
      OR (p_subscription_status = 'TRIAL' AND d.assinatura_status = 'TRIAL')
      OR (p_subscription_status = 'EXPIRED_PAST_DUE' AND d.assinatura_status IN ('PAST_DUE', 'EXPIRED', 'CANCELED'))
      OR (p_subscription_status NOT IN ('all', 'ACTIVE', 'VITALICIO', 'TRIAL', 'EXPIRED_PAST_DUE') AND d.assinatura_status = p_subscription_status)
    )
    AND (
      v_search_clean IS NULL
      OR d.nome ILIKE '%' || v_search_clean || '%'
      OR (d.apelido IS NOT NULL AND d.apelido ILIKE '%' || v_search_clean || '%')
      OR (d.email IS NOT NULL AND d.email ILIKE '%' || v_search_clean || '%')
      OR (v_digits IS NOT NULL AND LENGTH(v_digits) >= 3 AND d.telefone ILIKE '%' || v_digits || '%')
    );

  RETURN QUERY
  WITH active_drivers AS (
    SELECT
      u.id,
      u.nome,
      u.apelido,
      u.telefone,
      u.email,
      u.created_at AS cadastrado_em,
      CASE 
        WHEN u.created_at < v_start_tz THEN 'recorrente'
        ELSE 'novo'
      END AS tipo_usuario_dia,
      CASE
        WHEN u.created_at >= v_start_tz 
          AND COUNT(act.id) > 1 
          AND EXTRACT(EPOCH FROM (MAX(act.created_at) - MIN(act.created_at))) >= 900
        THEN true
        ELSE false
      END AS reengajou_no_dia,
      COUNT(act.id)::BIGINT AS total_atividades_dia,
      MIN(act.created_at) AS primeiro_acesso_dia,
      MAX(act.created_at) AS ultimo_acesso_dia,
      sub.status AS assinatura_status,
      sub.data_vencimento AS assinatura_vencimento,
      (sub.status = 'ACTIVE' AND sub.data_vencimento IS NULL) AS is_vitalicio
    FROM usuarios u
    JOIN historico_atividades act ON act.usuario_id = u.id
    LEFT JOIN LATERAL (
      SELECT s.status, s.data_vencimento
      FROM assinaturas s
      WHERE s.usuario_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) sub ON true
    WHERE u.tipo = 'motorista'
      AND act.created_at >= v_start_tz
      AND act.created_at <= v_end_tz
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    GROUP BY u.id, u.nome, u.apelido, u.telefone, u.email, u.created_at, sub.status, sub.data_vencimento
  )
  SELECT
    d.id,
    d.nome,
    d.apelido,
    d.telefone,
    d.email,
    d.cadastrado_em,
    d.tipo_usuario_dia,
    d.reengajou_no_dia,
    d.total_atividades_dia,
    d.primeiro_acesso_dia,
    d.ultimo_acesso_dia,
    ha.acao AS ultima_acao_dia,
    ha.descricao AS ultima_descricao_dia,
    d.assinatura_status,
    d.assinatura_vencimento,
    d.is_vitalicio,
    v_total AS total_count
  FROM active_drivers d
  LEFT JOIN LATERAL (
    SELECT act.acao, act.descricao
    FROM historico_atividades act
    WHERE act.usuario_id = d.id
      AND act.created_at >= v_start_tz
      AND act.created_at <= v_end_tz
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    ORDER BY act.created_at DESC
    LIMIT 1
  ) ha ON true
  WHERE (
      p_tipo_usuario = 'all'
      OR d.tipo_usuario_dia = p_tipo_usuario
    )
    AND (
      p_subscription_status = 'all'
      OR (p_subscription_status = 'ACTIVE' AND d.assinatura_status = 'ACTIVE' AND d.assinatura_vencimento IS NOT NULL)
      OR (p_subscription_status = 'VITALICIO' AND d.assinatura_status = 'ACTIVE' AND d.assinatura_vencimento IS NULL)
      OR (p_subscription_status = 'TRIAL' AND d.assinatura_status = 'TRIAL')
      OR (p_subscription_status = 'EXPIRED_PAST_DUE' AND d.assinatura_status IN ('PAST_DUE', 'EXPIRED', 'CANCELED'))
      OR (p_subscription_status NOT IN ('all', 'ACTIVE', 'VITALICIO', 'TRIAL', 'EXPIRED_PAST_DUE') AND d.assinatura_status = p_subscription_status)
    )
    AND (
      v_search_clean IS NULL
      OR d.nome ILIKE '%' || v_search_clean || '%'
      OR (d.apelido IS NOT NULL AND d.apelido ILIKE '%' || v_search_clean || '%')
      OR (d.email IS NOT NULL AND d.email ILIKE '%' || v_search_clean || '%')
      OR (v_digits IS NOT NULL AND LENGTH(v_digits) >= 3 AND d.telefone ILIKE '%' || v_digits || '%')
    )
  ORDER BY d.ultimo_acesso_dia DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$func$;
