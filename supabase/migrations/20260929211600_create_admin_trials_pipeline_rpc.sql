CREATE OR REPLACE FUNCTION get_admin_trials_pipeline()
RETURNS TABLE (
  assinatura_id uuid,
  usuario_id uuid,
  nome text,
  apelido text,
  trial_ends_at timestamptz,
  dias_restantes integer,
  dias_acessados bigint,
  total_acoes bigint,
  alunos bigint,
  escolas bigint,
  veiculos bigint,
  rotas bigint,
  contratos bigint,
  solicitacoes bigint,
  indicado_por text,
  valor_mensal numeric,
  valor_anual numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    a.id as assinatura_id,
    u.id as usuario_id,
    u.nome,
    COALESCE(u.apelido, '') as apelido,
    a.trial_ends_at,
    (a.trial_ends_at::date - CURRENT_DATE)::integer as dias_restantes,
    (SELECT COUNT(DISTINCT ha_d.created_at::date) FROM historico_atividades ha_d WHERE ha_d.usuario_id = u.id) as dias_acessados,
    (SELECT COUNT(*) FROM historico_atividades ha WHERE ha.usuario_id = u.id) as total_acoes,
    (SELECT COUNT(*) FROM passageiros pas WHERE pas.usuario_id = u.id) as alunos,
    (SELECT COUNT(*) FROM escolas esc WHERE esc.usuario_id = u.id) as escolas,
    (SELECT COUNT(*) FROM veiculos vei WHERE vei.usuario_id = u.id) as veiculos,
    (SELECT COUNT(*) FROM rotas rot WHERE rot.usuario_id = u.id) as rotas,
    (SELECT COUNT(*) FROM contratos con WHERE con.usuario_id = u.id) as contratos,
    (SELECT COUNT(*) FROM pre_passageiros pp WHERE pp.usuario_id = u.id) as solicitacoes,
    (SELECT COALESCE(u_ind.apelido, u_ind.nome) FROM indicacoes ind JOIN usuarios u_ind ON u_ind.id = ind.indicador_id WHERE ind.indicado_id = u.id LIMIT 1) as indicado_por,
    COALESCE(a.valor_promocional_mensal, a.valor_base_mensal, p.valor_promocional, p.valor, 39.90)::numeric as valor_mensal,
    COALESCE(a.valor_promocional_anual, a.valor_base_anual, p.valor_promocional, p.valor, 399.00)::numeric as valor_anual
  FROM assinaturas a
  JOIN usuarios u ON u.id = a.usuario_id
  LEFT JOIN planos p ON p.id = a.plano_id
  WHERE a.status = 'TRIAL' AND a.trial_ends_at IS NOT NULL
  ORDER BY a.trial_ends_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_admin_trials_pipeline() TO authenticated, service_role;
