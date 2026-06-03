-- Procedure para confirmacao de pagamento de faturas SaaS de forma transacional e segura contra concorrencia
CREATE OR REPLACE FUNCTION public.confirm_invoice_payment(p_fatura_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fatura RECORD;
    v_assinatura RECORD;
    v_plano RECORD;
    v_now TIMESTAMPTZ;
    v_now_br TIMESTAMP;
    v_base_date_br TIMESTAMP;
    v_new_expiry_br TIMESTAMP;
    v_new_expiry TIMESTAMPTZ;
    v_plano_id UUID;
    v_user_nome TEXT;
    v_user_telefone TEXT;
BEGIN
    -- 1. Obter lock na fatura e verificar status com FOR UPDATE
    SELECT * INTO v_fatura
    FROM public.assinatura_faturas
    WHERE id = p_fatura_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Fatura não encontrada');
    END IF;

    IF v_fatura.status != 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Fatura já processada', 'status', v_fatura.status);
    END IF;

    -- 2. Obter lock na assinatura vinculada com FOR UPDATE
    SELECT * INTO v_assinatura
    FROM public.assinaturas
    WHERE id = v_fatura.assinatura_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assinatura não encontrada');
    END IF;

    -- 3. Buscar plano associado à fatura ou à assinatura
    v_plano_id := COALESCE(v_fatura.plano_id, v_assinatura.plano_id);
    SELECT * INTO v_plano
    FROM public.planos
    WHERE id = v_plano_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Plano não encontrado');
    END IF;

    -- 4. Definir data atual e calcular nova data de vencimento (America/Sao_Paulo)
    v_now := now();
    v_now_br := timezone('America/Sao_Paulo'::text, v_now);
    v_base_date_br := v_now_br;

    IF v_assinatura.data_vencimento IS NOT NULL AND (v_assinatura.status = 'ACTIVE' OR v_assinatura.status = 'PAST_DUE') THEN
        v_base_date_br := timezone('America/Sao_Paulo'::text, v_assinatura.data_vencimento);
        -- Se o vencimento base já passou há mais de 30 dias, usa agora como base
        IF v_base_date_br < (v_now_br - INTERVAL '30 days') THEN
            v_base_date_br := v_now_br;
        END IF;
    ELSIF v_assinatura.status = 'TRIAL' AND v_assinatura.trial_ends_at IS NOT NULL THEN
        v_base_date_br := timezone('America/Sao_Paulo'::text, v_assinatura.trial_ends_at);
        IF v_base_date_br <= v_now_br THEN
            v_base_date_br := v_now_br;
        END IF;
    END IF;

    -- Garantir final do dia (23:59:59.999) para a data base na America/Sao_Paulo
    v_base_date_br := date_trunc('day', v_base_date_br) + INTERVAL '23 hours 59 minutes 59.999 seconds';

    -- Adicionar período do plano
    IF v_plano.identificador = 'YEARLY' THEN
        v_new_expiry_br := v_base_date_br + INTERVAL '1 year';
    ELSE
        v_new_expiry_br := v_base_date_br + INTERVAL '1 month';
    END IF;

    -- Garantir final do dia (23:59:59.999) para o vencimento calculado
    v_new_expiry_br := date_trunc('day', v_new_expiry_br) + INTERVAL '23 hours 59 minutes 59.999 seconds';
    
    -- Converter de volta para timestamptz absoluta
    v_new_expiry := timezone('America/Sao_Paulo'::text, v_new_expiry_br);

    -- 5. Atualizar status da fatura para PAID
    UPDATE public.assinatura_faturas
    SET 
        status = 'PAID',
        data_pagamento = v_now,
        updated_at = v_now
    WHERE id = p_fatura_id;

    -- 6. Atualizar status da assinatura para ACTIVE e novo vencimento
    UPDATE public.assinaturas
    SET
        status = 'ACTIVE',
        plano_id = v_plano.id,
        data_vencimento = v_new_expiry,
        trial_ends_at = NULL,
        updated_at = v_now
    WHERE id = v_fatura.assinatura_id;

    -- 7. Obter dados do usuário para o retorno
    SELECT nome, telefone INTO v_user_nome, v_user_telefone
    FROM public.usuarios
    WHERE id = v_fatura.usuario_id;

    RETURN jsonb_build_object(
        'success', true,
        'fatura_id', p_fatura_id,
        'assinatura_id', v_fatura.assinatura_id,
        'usuario_id', v_fatura.usuario_id,
        'valor', v_fatura.valor,
        'plano_nome', v_plano.nome,
        'new_expiry', to_char(v_new_expiry, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'usuario_nome', v_user_nome,
        'usuario_telefone', v_user_telefone
    );
END;
$$;
