UPDATE public.fila_notificacoes fn
SET passageiro_id = c.passageiro_id
FROM public.cobrancas c
WHERE fn.passageiro_id IS NULL
  AND fn.evento IN (
    'PASSAGEIRO_VENCIMENTO_PROXIMO',
    'PASSAGEIRO_VENCIMENTO_HOJE',
    'PASSAGEIRO_ATRASADO'
  )
  AND (fn.payload->>'cobrancaId') IS NOT NULL
  AND c.id::text = (fn.payload->>'cobrancaId');
