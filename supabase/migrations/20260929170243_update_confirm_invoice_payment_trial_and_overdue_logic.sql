-- Procedure para confirmacao de pagamento de faturas SaaS de forma transacional e segura contra concorrencia
-- Atualizado para ajustar a regra de calculo da data de vencimento:
-- 1. Se em TRIAL, EXPIRED ou CANCELED: o trial/bloqueio cessa imediatamente, e a vigencia comeca HOJE (data do pagamento) + 1 mes/ano.
-- 2. Se ACTIVE (renovacao antecipada): preserva os dias restantes (data_vencimento atual + 1 mes/ano).
-- 3. Se PAST_DUE (em atraso/carencia): preserva o dia de vencimento como ancora (data_vencimento anterior + 1 mes/ano).

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
    SELECT * INTO v_fatura
    FROM public.assinatura_faturas
    WHERE id = p_fatura_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Fatura não encontrada');
    END IF;

    IF v_fatura.status = 'PAID' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Fatura já processada', 'status', v_fatura.status);
    END IF;

    SELECT * INTO v_assinatura
    FROM public.assinaturas
    WHERE id = v_fatura.assinatura_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assinatura não encontrada');
    END IF;

    v_plano_id := COALESCE(v_fatura.plano_id, v_assinatura.plano_id);
    SELECT * INTO v_plano
    FROM public.planos
    WHERE id = v_plano_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Plano não encontrado');
    END IF;

    v_now := now();
    v_now_br := timezone('America/Sao_Paulo'::text, v_now);
    v_base_date_br := v_now_br;

    IF v_assinatura.status = 'ACTIVE' AND v_assinatura.data_vencimento IS NOT NULL THEN
        v_base_date_br := timezone('America/Sao_Paulo'::text, v_assinatura.data_vencimento);
        IF v_base_date_br < (v_now_br - INTERVAL '30 days') THEN
            v_base_date_br := v_now_br;
        END IF;

    ELSIF v_assinatura.status = 'PAST_DUE' AND v_assinatura.data_vencimento IS NOT NULL THEN
        v_base_date_br := timezone('America/Sao_Paulo'::text, v_assinatura.data_vencimento);
        IF v_base_date_br < (v_now_br - INTERVAL '30 days') THEN
            v_base_date_br := v_now_br;
        END IF;

    ELSE
        v_base_date_br := v_now_br;
    END IF;

    v_base_date_br := date_trunc('day', v_base_date_br) + INTERVAL '23 hours 59 minutes 59.999 seconds';

    IF v_plano.identificador = 'YEARLY' THEN
        v_new_expiry_br := v_base_date_br + INTERVAL '1 year';
    ELSE
        v_new_expiry_br := v_base_date_br + INTERVAL '1 month';
    END IF;

    v_new_expiry_br := date_trunc('day', v_new_expiry_br) + INTERVAL '23 hours 59 minutes 59.999 seconds';
    
    v_new_expiry := timezone('America/Sao_Paulo'::text, v_new_expiry_br);

    UPDATE public.assinatura_faturas
    SET 
        status = 'PAID',
        data_pagamento = v_now,
        updated_at = v_now
    WHERE id = p_fatura_id;

    UPDATE public.assinatura_faturas
    SET 
        status = 'CANCELED',
        updated_at = v_now
    WHERE usuario_id = v_fatura.usuario_id
      AND id != p_fatura_id
      AND status IN ('PENDING', 'FAILED');

    UPDATE public.assinaturas
    SET
        status = 'ACTIVE',
        plano_id = v_plano.id,
        data_vencimento = v_new_expiry,
        trial_ends_at = NULL,
        updated_at = v_now
    WHERE id = v_fatura.assinatura_id;

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
