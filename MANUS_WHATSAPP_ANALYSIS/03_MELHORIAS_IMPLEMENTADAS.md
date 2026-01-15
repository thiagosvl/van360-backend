# Melhorias Implementadas e Próximas Fases na Integração WhatsApp

Este documento descreve as melhorias já implementadas na Fase 1 e as próximas fases de aprimoramento da integração do WhatsApp no Van360, incluindo um roadmap e estimativas de tempo.

## 1. Fase 1: Suporte a Pairing Code e Robustez Inicial (Já Implementado)

**Objetivo**: Habilitar a conexão via Pairing Code e aumentar a robustez da detecção de status.

**Alterações no Backend (`van360-backend`)**:

*   **`src/types/dtos/whatsapp.dto.ts`**: Adicionado o tipo `PairingCodeResponse` para lidar com a resposta da Evolution API ao solicitar um Pairing Code.
*   **`src/services/whatsapp.service.ts`**: Implementada a lógica para:
    *   Solicitar um Pairing Code à Evolution API, priorizando-o sobre o QR Code se um número de telefone for fornecido.
    *   Realizar um "Clean Slate" mais robusto antes de gerar um novo código (desconectar e deletar a instância existente para evitar conflitos).
    *   Configurar o webhook para incluir o evento `qrcode.updated` e garantir que `webhookByEvents` seja `false`.
*   **`src/controllers/whatsapp.controller.ts`**: Atualizado para expor o endpoint que permite ao frontend solicitar o Pairing Code.
*   **`src/services/handlers/webhook-evolution.handler.ts`**: Mapeamento de status expandido para incluir `connected` e `disconnected` além de `open`, `close` e `connecting`, garantindo que o banco de dados seja atualizado corretamente com os estados da Evolution API.

**Alterações no Frontend (`van360`)**:

*   **`src/hooks/useWhatsapp.ts`**: Adicionado suporte a polling inteligente. Quando o diálogo de conexão está aberto, o hook consulta o status no backend a cada 5 segundos, garantindo que o frontend receba a atualização mesmo se o webhook falhar.
*   **`src/components/Whatsapp/WhatsappConnect.tsx`**: Atualizado para ativar o polling no `useWhatsapp` quando o componente está ativo, proporcionando feedback em tempo real ao usuário.

**Status**: ✅ Concluído e enviado para o GitHub.

## 2. Próximas Fases de Melhoria (Roadmap)

As seguintes fases são propostas para garantir a máxima estabilidade, usabilidade e resiliência da integração do WhatsApp.

### Fase 2: Otimização do Health Check e Notificações Proativas

**Objetivo**: Detectar e reagir rapidamente a desconexões, notificando o motorista.

*   **Aumentar Frequência do Health Check**: Ajustar o `whatsappHealthCheckJob` para rodar a cada 1 minuto (ou 30 segundos) para detecção quase em tempo real de instâncias desconectadas.
*   **Notificação de Desconexão**: Implementar a lógica para que, ao detectar uma instância `DISCONNECTED` (e o status anterior era `CONNECTED`), o sistema envie uma mensagem para o motorista (via instância global `GLOBAL_WHATSAPP_INSTANCE`) informando sobre a queda e instruindo-o a reconectar.
*   **Lógica de Retry no Health Check**: Aprimorar a lógica de retry para `getInstanceStatus` para lidar com falhas temporárias da Evolution API.

**Estimativa**: 1-2 dias.

### Fase 3: Implementação de Heartbeat e Timeout para Instâncias Travadas

**Objetivo**: Manter as conexões ativas e limpar instâncias que ficam presas no estado `connecting`.

*   **Health Check Robusto**: O `whatsappHealthCheckJob` foi aprimorado para não apenas verificar o status, mas também para forçar um `logout` ou `delete` em instâncias que não respondem ou estão em estado `connecting` por um tempo excessivo (ex: mais de 5 minutos).
*   **Timeout para `connecting`**: No `whatsappHealthCheckJob`, foi implementado um mecanismo para identificar instâncias que estão em `connecting` por mais de X minutos e forçar um `disconnect` seguido de `delete` para liberar o recurso e permitir uma nova conexão limpa.

**Estimativa**: 1 dia.

### Fase 4: Gerenciamento de Expiração de Códigos no Frontend

**Objetivo**: Melhorar a experiência do usuário com QR Code e Pairing Code que expiram.

*   **Countdown Visual**: No frontend, implementar um contador regressivo (60 segundos) para o QR Code e Pairing Code.
*   **Re-geração Automática**: Ao final do countdown, o frontend deve automaticamente solicitar um novo QR Code/Pairing Code ao backend, sem a necessidade de o usuário clicar em um botão.
*   **Feedback de Expiração**: Mensagem clara no frontend quando o código expira.

**Estimativa**: 1-2 dias.

### Fase 5: Fila de Retentativa para Webhooks (Backend)

**Objetivo**: Garantir que nenhum evento de webhook seja perdido, mesmo com falhas temporárias no backend.

*   **Implementar Fila de Webhooks**: Se o processamento de um webhook falhar, enfileirar o evento em uma fila de retentativa (ex: usando BullMQ ou similar) para ser processado posteriormente.
*   **Mecanismo de Dead-Letter Queue (DLQ)**: Para eventos que falham repetidamente, movê-los para uma DLQ para análise manual.

**Estimativa**: 2-3 dias.

### Fase 6: Atualização do Banco de Dados e Armazenamento de Metadados

**Objetivo**: Armazenar informações adicionais da instância para depuração e melhor gestão.

*   **Adicionar Colunas à Tabela `usuarios`**: Incluir campos como `whatsapp_instance_id`, `whatsapp_last_connected_at`, `whatsapp_last_disconnected_at`, `whatsapp_pairing_code` (para depuração, não para reuso), `whatsapp_webhook_url`.
*   **Atualizar Lógica de Persistência**: O backend deve persistir esses dados na tabela `usuarios` sempre que houver uma mudança de status ou geração de código.

**Estimativa**: 1 dia.

## 3. Considerações Gerais

*   **Monitoramento de Logs**: Manter um monitoramento rigoroso dos logs da Evolution API e do backend do Van360 para identificar padrões de falha e otimizar as configurações.
*   **Testes de Estresse**: Realizar testes de estresse com múltiplas instâncias para garantir que o sistema se comporte bem sob carga.
*   **Documentação Contínua**: Manter a documentação atualizada com cada nova melhoria e decisão técnica.
