DROP FUNCTION IF EXISTS get_admin_logs_by_user(TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT);

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
  total_novos BIGINT,
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
  v_total_novos BIGINT;
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
    COUNT(*) FILTER (WHERE tipo_user = 'novo')::BIGINT,
    COUNT(*) FILTER (WHERE sub_status = 'TRIAL')::BIGINT,
    COUNT(*) FILTER (WHERE sub_status = 'ACTIVE')::BIGINT,
    COUNT(*) FILTER (WHERE tipo_user = 'recorrente' AND sub_status != 'ACTIVE')::BIGINT
  INTO
    v_total_users,
    v_total_novos,
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
    v_total_novos AS total_novos,
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
