CREATE OR REPLACE FUNCTION get_motoristas_latest_activity(
  p_search TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'inactive_first',
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
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
  WHERE u.tipo = 'motorista'
    AND (
      v_search_clean IS NULL
      OR u.nome ILIKE '%' || v_search_clean || '%'
      OR (u.apelido IS NOT NULL AND u.apelido ILIKE '%' || v_search_clean || '%')
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
      v_search_clean IS NULL
      OR u.nome ILIKE '%' || v_search_clean || '%'
      OR (u.apelido IS NOT NULL AND u.apelido ILIKE '%' || v_search_clean || '%')
      OR (v_digits IS NOT NULL AND LENGTH(v_digits) >= 3 AND u.telefone ILIKE '%' || v_digits || '%')
    )
  ORDER BY 
    CASE WHEN p_sort = 'recent_first' THEN ha.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'recent_first' THEN u.created_at END DESC,
    CASE WHEN p_sort = 'inactive_first' THEN ha.created_at END ASC NULLS FIRST,
    CASE WHEN p_sort = 'inactive_first' THEN u.created_at END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
