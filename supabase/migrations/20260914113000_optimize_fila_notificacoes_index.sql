CREATE INDEX IF NOT EXISTS idx_fila_notif_pending_retry 
ON public.fila_notificacoes (proxima_tentativa_em) 
WHERE status IN ('PENDING', 'RETRY_PENDING');
