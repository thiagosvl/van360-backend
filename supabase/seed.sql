-- USERS SEED (FOR LOCAL DEVELOPMENT ONLY)

-- 1. Create Identity (Optional but recommended for robust setups, though simple insert often works)
-- We skip complex identity logic and insert directly into auth.users

-- 2. Create Auth User (Admin)
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
    'd0d8c19c-3b36-402a-9e73-9a3c3c3c3c3c', -- Fixed UUID for Dev Admin
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

-- 3. Create Public Profile (Linked to Auth)
INSERT INTO public.usuarios (
    id,
    auth_uid,
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
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Fixed Public ID
    'd0d8c19c-3b36-402a-9e73-9a3c3c3c3c3c', -- Link to Auth ID
    'Sr. T',
    'admin@van360.com',
    '00000000000',
    '11999999999',
    'Admin',
    true,
    now(),
    now(),
    'admin'
) ON CONFLICT (id) DO NOTHING;

-- Subscription removed as per request (Admin system user)
