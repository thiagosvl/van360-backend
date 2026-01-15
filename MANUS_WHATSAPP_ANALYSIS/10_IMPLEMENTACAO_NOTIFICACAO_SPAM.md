# Implementação do Sistema de Notificação de Queda e Prevenção de Spam

## 1. Objetivo

Implementar a lógica de notificação de desconexão do WhatsApp via Instância Principal, garantindo a estabilidade do sistema e prevenindo o envio excessivo de mensagens (spam) ao motorista.

## 2. Alterações no Banco de Dados (Migração SQL)

Para controlar o spam e o histórico de desconexões, foram adicionadas as seguintes colunas à tabela `usuarios` através da migração `20250115000000_add_whatsapp_disconnection_tracking.sql`:

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `last_disconnection_notification_at` | `timestamp with time zone` | Último momento em que uma notificação de queda foi enviada. |
| `disconnection_notification_count` | `integer` | Contador de notificações enviadas no dia (para limite diário). |
| `whatsapp_last_status_change_at` | `timestamp with time zone` | Último momento em que o `whatsapp_status` foi alterado. |

## 3. Implementação no Backend

### 3.1 `webhook-evolution.handler.ts` (Notificação em Tempo Real)

A função `notifyMotoristaDisconnection` foi implementada para ser chamada sempre que o status de conexão muda para `close` ou `disconnected`.

**Controle de Spam:**
- **Cooldown de 1 Hora**: Uma nova notificação só é enviada se a última tiver sido enviada há mais de 1 hora (`DISCONNECTION_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000`).
- **Limite Diário**: O motorista não receberá mais de 5 notificações por dia (`MAX_NOTIFICATIONS_PER_DAY = 5`).
- **Reset do Contador**: O contador `disconnection_notification_count` é zerado sempre que a instância volta para o status `open` ou `connected`.

### 3.2 `whatsapp-health-check.job.ts` (Rede de Segurança)

O Job de Health Check foi atualizado para utilizar a mesma função `webhookEvolutionHandler.notifyMotoristaDisconnection`.

**Fluxo de Notificação:**
1. O Job detecta que o `whatsapp_status` no banco está `CONNECTED`, mas a Evolution API retorna `close`.
2. O Job corrige o status no banco para `DISCONNECTED`.
3. O Job chama `webhookEvolutionHandler.notifyMotoristaDisconnection(usuarioId)`.
4. A função de notificação verifica o cooldown e o limite diário antes de enviar a mensagem, garantindo que o Job não cause spam.

## 4. Próximos Passos Sugeridos

Com a estabilidade e o sistema de notificação implementados, as próximas etapas para aprimorar a resiliência do sistema são:

| Prioridade | Ação | Descrição |
| :--- | :--- | :--- |
| **Alta** | **Implementar Fila de Mensagens** | Criar um sistema de fila (usando Redis ou uma tabela no Supabase) para armazenar mensagens de notificação de cobrança que falharam devido à instância do motorista estar offline. As mensagens seriam reenviadas automaticamente quando a instância voltasse a ficar `CONNECTED`. |
| **Média** | **Reconexão Automática Inteligente** | Implementar uma lógica no Health Check Job para tentar um "soft-reconnect" (chamar o endpoint `/instance/connect`) antes de notificar o motorista, dando uma chance para a instância se recuperar de falhas temporárias. |
| **Baixa** | **Dashboard de Monitoramento** | Criar um painel de administração que mostre o histórico de desconexões e notificações por motorista, facilitando o suporte e a identificação de motoristas com problemas crônicos de conexão. |
