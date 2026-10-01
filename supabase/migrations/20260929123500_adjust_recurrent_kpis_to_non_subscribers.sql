CREATE OR REPLACE FUNCTION get_admin_logs_by_user(
  p_data_inicio TEXT DEFAULT NULL,
  p_data_fim TEXT DEFAULT NULL,
  p_acao TEXT DEFAULT NULL,
  p_entidade TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_tz TEXT DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  usuario_id UUID,
  usuario_nome TEXT,
  usuario_apelido TEXT,
  usuario_telefone TEXT,
  usuario_email TEXT,
  usuario_logo_url TEXT,
  assinatura_status TEXT,
  tipo_usuario TEXT,
  cadastrado_em TIMESTAMPTZ,
  total_atividades BIGINT,
  primeira_atividade_em TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ,
  ultimas_atividades JSONB,
  total_usuarios BIGINT,
  total_trial BIGINT,
  total_ativos BIGINT,
  total_recorrentes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
  v_search_clean TEXT;
  v_digits TEXT;
  v_matched_user_ids UUID[];
  v_total_users BIGINT;
  v_total_trial BIGINT;
  v_total_ativos BIGINT;
  v_total_recorrentes BIGINT;
BEGIN
  IF p_data_inicio IS NOT NULL AND TRIM(p_data_inicio) <> '' THEN
    IF LENGTH(TRIM(p_data_inicio)) = 10 THEN
      v_start_tz := (TRIM(p_data_inicio) || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_tz;
    ELSE
      v_start_tz := TRIM(p_data_inicio)::TIMESTAMPTZ;
    END IF;
  END IF;

  IF p_data_fim IS NOT NULL AND TRIM(p_data_fim) <> '' THEN
    IF LENGTH(TRIM(p_data_fim)) = 10 THEN
      v_end_tz := (TRIM(p_data_fim) || ' 23:59:59.999999')::TIMESTAMP AT TIME ZONE p_tz;
    ELSE
      v_end_tz := TRIM(p_data_fim)::TIMESTAMPTZ;
    END IF;
  END IF;

  IF p_search IS NOT NULL AND TRIM(p_search) <> '' THEN
    v_search_clean := TRIM(p_search);
    v_digits := REGEXP_REPLACE(v_search_clean, '\D', '', 'g');

    IF v_search_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_matched_user_ids := ARRAY[v_search_clean::UUID];
    ELSE
      SELECT ARRAY_AGG(u.id)
      INTO v_matched_user_ids
      FROM usuarios u
      WHERE (
        (v_digits <> '' AND LENGTH(v_digits) >= 3 AND (u.cpfcnpj ILIKE '%' || v_digits || '%' OR u.telefone ILIKE '%' || v_digits || '%'))
        OR (u.nome ILIKE '%' || v_search_clean || '%' OR u.apelido ILIKE '%' || v_search_clean || '%' OR u.email ILIKE '%' || v_search_clean || '%')
      );

      IF v_matched_user_ids IS NULL OR ARRAY_LENGTH(v_matched_user_ids, 1) = 0 THEN
        RETURN;
      END IF;
    END IF;
  END IF;

  WITH active_uids AS (
    SELECT DISTINCT act.usuario_id
    FROM historico_atividades act
    WHERE (v_start_tz IS NULL OR act.created_at >= v_start_tz)
      AND (v_end_tz IS NULL OR act.created_at <= v_end_tz)
      AND (p_acao IS NULL OR TRIM(p_acao) = '' OR p_acao = 'all' OR act.acao = p_acao)
      AND (p_entidade IS NULL OR TRIM(p_entidade) = '' OR p_entidade = 'all' OR act.entidade_tipo = p_entidade)
      AND (v_matched_user_ids IS NULL OR act.usuario_id = ANY(v_matched_user_ids))
  ),
  aggregated_users AS (
    SELECT
      au.usuario_id,
      CASE
        WHEN u.created_at < COALESCE(v_start_tz, NOW()) THEN 'recorrente'
        ELSE 'novo'
      END AS tipo_user,
      COALESCE(sub.status, 'TRIAL') AS sub_status
    FROM active_uids au
    LEFT JOIN usuarios u ON u.id = au.usuario_id
    LEFT JOIN LATERAL (
      SELECT s.status
      FROM assinaturas s
      WHERE s.usuario_id = au.usuario_id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) sub ON true
  )
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE sub_status = 'TRIAL')::BIGINT,
    COUNT(*) FILTER (WHERE sub_status = 'ACTIVE')::BIGINT,
    COUNT(*) FILTER (WHERE tipo_user = 'recorrente' AND sub_status != 'ACTIVE')::BIGINT
  INTO
    v_total_users,
    v_total_trial,
    v_total_ativos,
    v_total_recorrentes
  FROM aggregated_users;

  IF v_total_users = 0 OR v_total_users IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_summary AS (
    SELECT
      act.usuario_id,
      COUNT(*)::BIGINT AS total_atividades,
      MIN(act.created_at) AS primeira_atividade_em,
      MAX(act.created_at) AS ultima_atividade_em
    FROM historico_atividades act
    WHERE (v_start_tz IS NULL OR act.created_at >= v_start_tz)
      AND (v_end_tz IS NULL OR act.created_at <= v_end_tz)
      AND (p_acao IS NULL OR TRIM(p_acao) = '' OR p_acao = 'all' OR act.acao = p_acao)
      AND (p_entidade IS NULL OR TRIM(p_entidade) = '' OR p_entidade = 'all' OR act.entidade_tipo = p_entidade)
      AND (v_matched_user_ids IS NULL OR act.usuario_id = ANY(v_matched_user_ids))
    GROUP BY act.usuario_id
    ORDER BY MAX(act.created_at) DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    us.usuario_id,
    u.nome AS usuario_nome,
    u.apelido AS usuario_apelido,
    u.telefone AS usuario_telefone,
    u.email AS usuario_email,
    u.logo_url AS usuario_logo_url,
    COALESCE(sub.status, 'TRIAL') AS assinatura_status,
    CASE
      WHEN u.created_at < COALESCE(v_start_tz, NOW()) THEN 'recorrente'
      ELSE 'novo'
    END AS tipo_usuario,
    u.created_at AS cadastrado_em,
    us.total_atividades,
    us.primeira_atividade_em,
    us.ultima_atividade_em,
    COALESCE(recent_acts.acts, '[]'::JSONB) AS ultimas_atividades,
    v_total_users AS total_usuarios,
    v_total_trial AS total_trial,
    v_total_ativos AS total_ativos,
    v_total_recorrentes AS total_recorrentes
  FROM user_summary us
  LEFT JOIN usuarios u ON u.id = us.usuario_id
  LEFT JOIN LATERAL (
    SELECT s.status
    FROM assinaturas s
    WHERE s.usuario_id = us.usuario_id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'usuario_id', a.usuario_id,
        'acao', a.acao,
        'descricao', a.descricao,
        'entidade_tipo', a.entidade_tipo,
        'entidade_id', a.entidade_id,
        'created_at', a.created_at,
        'meta', a.meta,
        'ip_address', a.ip_address,
        'usuarios', jsonb_build_object(
          'id', u.id,
          'nome', u.nome,
          'apelido', u.apelido,
          'telefone', u.telefone
        )
      ) ORDER BY a.created_at DESC
    ) AS acts
    FROM (
      SELECT act.*
      FROM historico_atividades act
      WHERE act.usuario_id = us.usuario_id
        AND (v_start_tz IS NULL OR act.created_at >= v_start_tz)
        AND (v_end_tz IS NULL OR act.created_at <= v_end_tz)
        AND (p_acao IS NULL OR TRIM(p_acao) = '' OR p_acao = 'all' OR act.acao = p_acao)
        AND (p_entidade IS NULL OR TRIM(p_entidade) = '' OR p_entidade = 'all' OR act.entidade_tipo = p_entidade)
      ORDER BY act.created_at DESC
      LIMIT 3
    ) a
  ) recent_acts ON true
  ORDER BY us.ultima_atividade_em DESC;
END;
$func$;

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
    COUNT(*) FILTER (WHERE created_at < v_start_tz AND (assinatura_status IS NULL OR assinatura_status != 'ACTIVE'))::BIGINT AS total_recorrentes,
    COUNT(*) FILTER (WHERE created_at >= v_start_tz AND created_at <= v_end_tz)::BIGINT AS total_novos,
    COUNT(*) FILTER (
      WHERE created_at >= v_start_tz 
        AND created_at <= v_end_tz 
        AND (assinatura_status IS NULL OR assinatura_status != 'ACTIVE')
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
          AND (sub.status IS NULL OR sub.status != 'ACTIVE')
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
      OR (p_tipo_usuario = 'recorrente' AND d.tipo_usuario_dia = 'recorrente' AND (d.assinatura_status IS NULL OR d.assinatura_status != 'ACTIVE'))
      OR (p_tipo_usuario = 'novo' AND d.tipo_usuario_dia = 'novo')
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
          AND (sub.status IS NULL OR sub.status != 'ACTIVE')
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
  ),
  filtered_drivers AS (
    SELECT *
    FROM active_drivers d
    WHERE (
        p_tipo_usuario = 'all'
        OR (p_tipo_usuario = 'recorrente' AND d.tipo_usuario_dia = 'recorrente' AND (d.assinatura_status IS NULL OR d.assinatura_status != 'ACTIVE'))
        OR (p_tipo_usuario = 'novo' AND d.tipo_usuario_dia = 'novo')
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
    OFFSET p_offset
  )
  SELECT
    fd.id,
    fd.nome,
    fd.apelido,
    fd.telefone,
    fd.email,
    fd.cadastrado_em,
    fd.tipo_usuario_dia,
    fd.reengajou_no_dia,
    fd.total_atividades_dia,
    fd.primeiro_acesso_dia,
    fd.ultimo_acesso_dia,
    last_act.acao AS ultima_acao_dia,
    last_act.descricao AS ultima_descricao_dia,
    fd.assinatura_status,
    fd.assinatura_vencimento,
    fd.is_vitalicio,
    v_total AS total_count
  FROM filtered_drivers fd
  LEFT JOIN LATERAL (
    SELECT act.acao, act.descricao
    FROM historico_atividades act
    WHERE act.usuario_id = fd.id
      AND act.created_at >= v_start_tz
      AND act.created_at <= v_end_tz
      AND act.acao NOT LIKE 'SAAS_%'
      AND act.acao != 'NOTIFICACAO_WHATSAPP'
    ORDER BY act.created_at DESC
    LIMIT 1
  ) last_act ON true
  ORDER BY fd.ultimo_acesso_dia DESC;
END;
$func$;
