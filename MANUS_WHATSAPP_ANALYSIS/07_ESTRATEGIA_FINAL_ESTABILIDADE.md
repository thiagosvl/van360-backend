# Estratégia Final de Estabilidade: WhatsApp Van360

## 1. Arquitetura de Sincronização
A solução agora prioriza o **Realtime** e o **Webhook**, eliminando o Polling desnecessário que sobrecarregava o frontend e a API.

*   **Webhook (Evolution -> Backend)**: Captura eventos de `connection.update` e `qrcode.updated` instantaneamente.
*   **Realtime (Backend -> Frontend)**: O backend atualiza a tabela `usuarios` no Supabase, e o frontend reflete a mudança na UI em milissegundos via canal de Realtime.
*   **Health Check (Job)**: Roda a cada 10 minutos para garantir que nenhuma instância ficou "zumbi" e para disparar notificações de queda.

## 2. Notificações de Queda e Reconexão
*   **Notificação Proativa**: Se o Webhook ou o Job detectarem uma desconexão, o sistema envia uma mensagem automática ao motorista através da **Instância Principal do Van360**.
*   **Reconexão Automática**: A Evolution API já possui lógica interna para tentar reconectar em erros de rede. Se o erro for `401 (Unauthorized)`, a reconexão automática é impossível sem intervenção do usuário, e a notificação é disparada.

## 3. Causas de Desconexão Mapeadas
1.  **Remoção Manual**: Usuário removeu o aparelho no celular.
2.  **Expiração de Sessão**: WhatsApp invalidou os tokens (comum em APIs não oficiais).
3.  **Inatividade**: Celular sem internet por mais de 14 dias.
4.  **Recursos do Servidor**: Sobrecarga de RAM/CPU no servidor da Evolution API.

## 4. Próximos Passos para o Gemini
*   **Monitoramento de Recursos**: Implementar um alerta se o servidor da Evolution API estiver com uso de RAM > 90%.
*   **Log de Erros de Conexão**: Criar uma tabela `whatsapp_logs` para mapear quais motoristas caem com mais frequência e por qual motivo (statusReason).
