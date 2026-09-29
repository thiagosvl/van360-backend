-- Atualiza retroativamente o usuario_id (motorista) nas notificacoes vinculadas a passageiros
UPDATE fila_notificacoes fn
SET usuario_id = p.usuario_id
FROM passageiros p
WHERE p.id = fn.passageiro_id AND fn.usuario_id IS NULL;
