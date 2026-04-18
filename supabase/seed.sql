-- USUÁRIO ADMINISTRADOR INICIAL (AUTH & PUBLIC)
-- Este arquivo é executado automaticamente pelo 'supabase db reset'

-- 1. USUÁRIO NO SCHEMA AUTH
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'd0d8c19c-3b36-402a-9e73-9a3c3c3c3c3c',
    'authenticated',
    'authenticated',
    'admin@van360.com',
    extensions.crypt('123456', extensions.gen_salt('bf')), -- Password: '123456'
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Administrador","iss":"https://api.supabase.co/auth/v1","sub":"d0d8c19c-3b36-402a-9e73-9a3c3c3c3c3c","email":"admin@van360.com","email_verified":true,"phone_verified":false}',
    now(),
    now(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- 2. PERFIL NO SCHEMA PUBLIC (VAN360)
INSERT INTO public.usuarios (
    id,
    nome,
    email,
    cpfcnpj,
    telefone,
    apelido,
    ativo,
    created_at,
    updated_at,
    tipo
) VALUES (
    'd0d8c19c-3b36-402a-9e73-9a3c3c3c3c3c',
    'Sr. T',
    'admin@van360.com',
    '26419848814',
    '11999999999',
    'Admin',
    true,
    now(),
    now(),
    'admin'
) ON CONFLICT (id) DO NOTHING;

-- 3. CONFIGURAÇÃO INTERNA (GESTÃO OPERACIONAL E FINANCEIRA)
INSERT INTO public.configuracao_interna (chave, valor)
VALUES
    ('DIA_GERACAO_MENSALIDADES', '25'),
    ('DIAS_ANTECEDENCIA_AVISO_VENCIMENTO', '2'),
    ('PIX_EXPIRACAO_SEGUNDOS', '3600'),
    ('PIX_VALIDADE_APOS_VENCIMENTO', '30'),
    ('DIAS_COBRANCA_POS_VENCIMENTO', '3'),
    ('TAXA_BANCARIA_PIX_ENTRADA', '0.85'),
    ('TAXA_BANCARIA_PIX_SAIDA', '1.00'),
    ('TAXA_BANCARIA_SPLIT', '0.00'),
    ('TAXA_SERVICO_PADRAO', '3.90'),
    ('DIAS_VENCIMENTO_COBRANCA', '5'),
    ('SAAS_PROMOCAO_ATIVA', 'true'),
    ('SAAS_DIAS_VENCIMENTO', '5'),
    ('SAAS_DIAS_CARENCIA', '3'),
    ('SAAS_DIAS_AVISO_TRIAL', '3'),
    ('SAAS_MAX_TENTATIVAS_CARTAO', '3')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- 4. PLANOS SAAS
INSERT INTO public.planos (nome, identificador, valor, valor_promocional)
VALUES 
    ('Mensal', 'MONTHLY', 14.90, 9.90),
    ('Anual', 'YEARLY', 149.00, 99.00)
ON CONFLICT (identificador) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_promocional = EXCLUDED.valor_promocional;
