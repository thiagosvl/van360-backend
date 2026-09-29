CREATE OR REPLACE FUNCTION get_admin_dashboard_kpis()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH 
  motoristas_count AS (
    SELECT COUNT(*)::INT AS total
    FROM usuarios
    WHERE tipo = 'motorista'
  ),
  passageiros_count AS (
    SELECT COUNT(*)::INT AS total
    FROM passageiros
    WHERE ativo = true
  ),
  receita AS (
    SELECT COALESCE(SUM(f.valor), 0)::NUMERIC AS total
    FROM assinatura_faturas f
    JOIN usuarios u ON u.id = f.usuario_id
    WHERE f.status = 'PAID' AND u.tipo = 'motorista'
  ),
  assinaturas_agg AS (
    SELECT 
      COUNT(*) FILTER (WHERE a.status = 'TRIAL')::INT AS trial,
      COUNT(*) FILTER (WHERE a.status = 'ACTIVE' AND a.data_vencimento IS NOT NULL)::INT AS active,
      COUNT(*) FILTER (WHERE a.status = 'ACTIVE' AND a.data_vencimento IS NULL)::INT AS vitalicio,
      COUNT(*) FILTER (WHERE a.status = 'PAST_DUE')::INT AS past_due,
      COUNT(*) FILTER (WHERE a.status = 'EXPIRED')::INT AS expired,
      COUNT(*) FILTER (WHERE a.status = 'CANCELED')::INT AS canceled
    FROM assinaturas a
    JOIN usuarios u ON u.id = a.usuario_id
    WHERE u.tipo = 'motorista'
  ),
  contratos_agg AS (
    SELECT 
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE status = 'ASSINADO')::INT AS assinados,
      COUNT(*) FILTER (WHERE status = 'PENDENTE')::INT AS pendentes,
      COUNT(*) FILTER (WHERE status = 'SUBSTITUIDO')::INT AS substituidos,
      COALESCE(SUM(valor_total) FILTER (WHERE status = 'ASSINADO'), 0)::NUMERIC AS valor_total
    FROM contratos
  ),
  motoristas_config AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE (assinatura_digital_url IS NOT NULL AND assinatura_digital_url <> '') 
          AND (config_contrato IS NULL OR config_contrato->>'usar_contratos' IS NULL OR (config_contrato->>'usar_contratos')::boolean = true)
      )::INT AS ativo,
      COUNT(*) FILTER (
        WHERE (assinatura_digital_url IS NOT NULL AND assinatura_digital_url <> '') 
          AND (config_contrato->>'usar_contratos')::boolean = false
      )::INT AS inativo,
      COUNT(*) FILTER (
        WHERE assinatura_digital_url IS NULL OR assinatura_digital_url = ''
      )::INT AS nao_configurado
    FROM usuarios
    WHERE tipo = 'motorista'
  ),
  indicacoes_agg AS (
    SELECT 
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::INT AS concluidas,
      COUNT(*) FILTER (WHERE status = 'PENDING')::INT AS pendentes
    FROM indicacoes
  ),
  canais_agg AS (
    SELECT jsonb_object_agg(
      COALESCE(canal, 'NAO_INFORMADO'), 
      qtd
    ) AS canais
    FROM (
      SELECT 
        COALESCE(canal_aquisicao, 'NAO_INFORMADO') AS canal,
        COUNT(*)::INT AS qtd
      FROM usuarios
      WHERE tipo = 'motorista'
      GROUP BY canal_aquisicao
    ) c
  ),
  dispositivos_agg AS (
    SELECT jsonb_object_agg(
      COALESCE(disp, 'NAO_INFORMADO'), 
      qtd
    ) AS dispositivos
    FROM (
      SELECT 
        COALESCE(dispositivo_cadastro, 'NAO_INFORMADO') AS disp,
        COUNT(*)::INT AS qtd
      FROM usuarios
      WHERE tipo = 'motorista'
      GROUP BY dispositivo_cadastro
    ) d
  )
  SELECT jsonb_build_object(
    'totalMotoristas', (SELECT total FROM motoristas_count),
    'totalPassageiros', (SELECT total FROM passageiros_count),
    'receitaTotal', (SELECT total FROM receita),
    'assinaturas', (
      SELECT jsonb_build_object(
        'trial', a.trial,
        'active', a.active,
        'vitalicio', a.vitalicio,
        'past_due', a.past_due,
        'expired', a.expired,
        'canceled', a.canceled
      ) FROM assinaturas_agg a
    ),
    'contratosStats', (
      SELECT jsonb_build_object(
        'totalContratos', c.total,
        'contratosAssinados', c.assinados,
        'contratosPendentes', c.pendentes,
        'contratosSubstituidos', c.substituidos,
        'valorTotalContratos', c.valor_total,
        'motoristasConfigurados', (m.ativo + m.inativo),
        'motoristasAtivos', m.ativo,
        'motoristasPausados', m.inativo,
        'motoristasNaoConfigurados', m.nao_configurado,
        'motoristasConfig', jsonb_build_object(
          'ativo', m.ativo,
          'inativo', m.inativo,
          'nao_configurado', m.nao_configurado
        )
      ) FROM contratos_agg c, motoristas_config m
    ),
    'indicacoesStats', (
      SELECT jsonb_build_object(
        'total', i.total,
        'concluidas', i.concluidas,
        'pendentes', i.pendentes,
        'taxaConversao', CASE WHEN i.total > 0 THEN ROUND((i.concluidas::numeric / i.total) * 100)::INT ELSE 0 END,
        'diasBonusConcedidos', i.concluidas * 30,
        'motoristasIndicados', i.total
      ) FROM indicacoes_agg i
    ),
    'canaisAquisicao', (SELECT COALESCE(canais, '{}'::jsonb) FROM canais_agg),
    'dispositivosCadastro', (SELECT COALESCE(dispositivos, '{}'::jsonb) FROM dispositivos_agg)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
