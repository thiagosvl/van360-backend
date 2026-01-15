# Análise da Fila de Mensagens Existente no Van360

## 1. Arquitetura Atual

O Van360 utiliza **BullMQ** (fila baseada em Redis) para gerenciar o envio de mensagens do WhatsApp de forma assíncrona e resiliente.

### 1.1 Componentes Principais

| Componente | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **Queue Definition** | `src/queues/whatsapp.queue.ts` | Define a fila `whatsapp-queue` e a função `addToWhatsappQueue()` para enfileirar mensagens. |
| **Worker** | `src/workers/whatsapp.worker.ts` | Processa jobs da fila, tentando enviar via instância específica e fazendo fallback para a Global. |
| **Queue Service** | `src/services/queue.service.ts` | Inicializa e gerencia o ciclo de vida de todos os workers. |
| **Notification Service** | `src/services/notifications/notification.service.ts` | Prepara mensagens (gera QR Codes) e as enfileira via `addToWhatsappQueue()`. |

### 1.2 Fluxo Atual de Envio de Mensagem

```
1. notificationService.notifyPassenger() ou notifyDriver()
   ↓
2. Seleciona template de mensagem (ex: dueSoon, renewal, etc)
   ↓
3. Processa partes (gera QR Code se necessário)
   ↓
4. Chama _processAndEnqueue() que adiciona à whatsappQueue
   ↓
5. whatsappWorker processa o job
   ├─ Tenta enviar via instância específica (do motorista)
   └─ Se falhar, tenta fallback via instância Global
   ↓
6. Job concluído ou falha com retry automático (3 tentativas)
```

### 1.3 Configuração de Retry

No arquivo `src/queues/index.ts`, a fila é configurada com:
- **3 tentativas** em caso de falha
- **Backoff exponencial**: 1s, 2s, 4s (1000ms * 2^attempt)
- **Remove on Complete**: Job é removido do Redis após sucesso (economiza memória)
- **Remove on Fail**: Job é mantido no Redis após falha (para debug)

## 2. Problema Identificado

A fila atual **NÃO está integrada ao fluxo de desconexão do WhatsApp**. Quando um motorista desconecta:

1. O sistema detecta a desconexão (via Webhook ou Health Check)
2. Envia uma notificação de alerta ao motorista
3. **Mas**: As notificações de cobrança que chegam enquanto ele está desconectado são simplesmente perdidas ou falham

**Cenário Problemático:**
- Motorista desconecta às 10:00
- Sistema tenta enviar notificação de cobrança às 10:05 (job falha 3x e é descartado)
- Motorista reconecta às 10:30
- Nenhuma notificação de cobrança foi reenviada (motorista perdeu a informação)

## 3. Solução Proposta

Integrar a fila ao fluxo de desconexão para garantir que:

1. **Retenção de Mensagens**: Quando uma instância está `DISCONNECTED`, as mensagens enfileiradas para ela são marcadas com status especial (ex: `pending_reconnection`).
2. **Reenvio Automático**: Assim que a instância volta para `CONNECTED`, o sistema reprocessa automaticamente as mensagens pendentes.
3. **Reconexão Automática**: Antes de desistir de uma mensagem, tentar um "soft-reconnect" para recuperar instâncias que caíram temporariamente.

## 4. Implementação Necessária

### 4.1 Modificar o Worker (`src/workers/whatsapp.worker.ts`)

Adicionar lógica para verificar o status da instância antes de processar:

```typescript
// Verificar se a instância está conectada
const instanceStatus = await whatsappService.getInstanceStatus(targetInstance);

if (instanceStatus.state === WHATSAPP_STATUS.DISCONNECTED) {
    // Se está desconectada, tentar soft-reconnect
    logger.info({ targetInstance }, "Instância desconectada. Tentando soft-reconnect...");
    await whatsappService.connectInstance(targetInstance);
    
    // Aguardar um pouco para a reconexão se estabelecer
    await new Promise(r => setTimeout(r, 5000));
    
    // Verificar novamente
    const retryStatus = await whatsappService.getInstanceStatus(targetInstance);
    
    if (retryStatus.state !== WHATSAPP_STATUS.CONNECTED) {
        // Se ainda não conectou, manter o job na fila para retry
        throw new Error(`Instância ${targetInstance} ainda desconectada após soft-reconnect`);
    }
}

// Se chegou aqui, instância está conectada. Prosseguir com envio.
```

### 4.2 Adicionar Listener no Webhook (`src/services/handlers/webhook-evolution.handler.ts`)

Quando a instância reconectar, reprocessar jobs pendentes:

```typescript
if (state === "open" || state === "connected") {
    // Instância reconectou
    logger.info({ instanceName }, "Instância reconectou. Reprocessando mensagens pendentes...");
    
    // Buscar jobs que falharam para esta instância
    const failedJobs = await whatsappQueue.getFailed();
    const relevantJobs = failedJobs.filter(job => 
        job.data.options?.instanceName === instanceName
    );
    
    // Adicionar novamente à fila com prioridade
    for (const job of relevantJobs) {
        await whatsappQueue.add('send-message', job.data, {
            priority: 10, // Alta prioridade
            jobId: `retry-${job.id}`
        });
    }
}
```

### 4.3 Adicionar Monitoramento no Health Check

Se o Health Check detectar uma reconexão, também reprocessar mensagens pendentes.

## 5. Benefícios da Integração

| Benefício | Descrição |
| :--- | :--- |
| **Garantia de Entrega** | Mensagens não são perdidas quando a instância desconecta. |
| **Resiliência** | Soft-reconnect tenta recuperar instâncias antes de desistir. |
| **Experiência do Motorista** | Motorista não perde informações críticas de cobrança. |
| **Auditoria** | Histórico completo de tentativas de envio fica no Redis. |

## 6. Próximas Etapas

1. Modificar `whatsapp.worker.ts` para adicionar verificação de status e soft-reconnect.
2. Modificar `webhook-evolution.handler.ts` para reprocessar jobs ao reconectar.
3. Testar o fluxo completo de desconexão e reconexão.
4. Documentar o novo fluxo de resiliência.
