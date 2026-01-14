# Solução para Estabilidade e Webhook da Integração WhatsApp

Este documento detalha as correções e melhorias implementadas para resolver a falha na atualização de status do WhatsApp e garantir uma conexão estável via Pairing Code e QR Code.

## 1. Problema Central: Falha na Atualização de Status Pós-Conexão

O problema principal era que, após o motorista conectar o WhatsApp, o frontend não recebia a atualização de status em tempo real. Isso ocorria devido a uma combinação de fatores:

*   **Webhooks da Evolution API não estavam sendo processados corretamente**: O `webhook-evolution.handler.ts` no backend não mapeava todos os estados possíveis da Evolution API para o `WhatsappStatus` do sistema, e a configuração do webhook na Evolution API não estava otimizada.
*   **Dependência exclusiva do Realtime do Supabase no frontend**: O frontend dependia apenas do Supabase para atualizações de status, sem um mecanismo de fallback robusto.

## 2. Soluções Implementadas

Para resolver esses problemas, foram aplicadas as seguintes melhorias no backend e no frontend:

### 2.1. Backend (`van360-backend`)

#### 2.1.1. Mapeamento de Status Expandido no Webhook Handler

O `src/services/handlers/webhook-evolution.handler.ts` foi atualizado para mapear de forma mais abrangente os estados da Evolution API para os estados internos do sistema (`WhatsappStatus`).

**Alteração**: O `webhook-evolution.handler.ts` agora inclui um mapeamento mais completo para os estados `open`, `close`, `connecting`, `connected` e `disconnected` da Evolution API, garantindo que o `whatsapp_status` na tabela `usuarios` seja atualizado corretamente.

```typescript
// src/services/handlers/webhook-evolution.handler.ts

// ... (imports)

export const webhookEvolutionHandler = {
  async handle(payload: WebhookEvolutionPayload) {
    const { instance, connection, qrcode } = payload;
    const instanceName = instance.instanceName;

    if (!instanceName) {
      logger.error({ payload }, "Webhook Evolution: instanceName não encontrado no payload.");
      return;
    }

    const usuarioId = whatsappService.getUserIdFromInstanceName(instanceName);
    if (!usuarioId) {
      logger.error({ instanceName }, "Webhook Evolution: Usuário não encontrado para a instância.");
      return;
    }

    let dbStatus: WhatsappStatus = WhatsappStatus.UNKNOWN;

    if (connection) {
      switch (connection.status) {
        case "open":
        case "connected": // Adicionado
          dbStatus = WhatsappStatus.CONNECTED;
          break;
        case "close":
        case "disconnected": // Adicionado
          dbStatus = WhatsappStatus.DISCONNECTED;
          break;
        case "connecting":
          dbStatus = WhatsappStatus.CONNECTING;
          break;
        default:
          dbStatus = WhatsappStatus.UNKNOWN;
          break;
      }
    } else if (qrcode) {
      // Se houver um QR Code, a instância está tentando conectar
      dbStatus = WhatsappStatus.CONNECTING;
    }

    if (dbStatus !== WhatsappStatus.UNKNOWN) {
      await supabaseAdmin
        .from("usuarios")
        .update({ whatsapp_status: dbStatus })
        .eq("id", usuarioId);
      logger.info({ usuarioId, dbStatus }, "Webhook Evolution: Status do WhatsApp atualizado no DB.");
    }
  },
};
```

#### 2.1.2. Configuração de Webhook Global e Eventos na Criação da Instância

O `src/services/whatsapp.service.ts` foi aprimorado para garantir que o webhook global seja configurado corretamente e que os eventos `qrcode.updated` sejam incluídos.

**Alteração**: O método `connectInstance` no `whatsapp.service.ts` agora define o webhook global e os eventos necessários para a instância. Isso garante que o backend receba notificações sobre novos QR Codes e atualizações de conexão.

```typescript
// src/services/whatsapp.service.ts

// ... (imports e outras lógicas)

  async connectInstance(userId: string): Promise<WhatsappConnectResponse> {
    const instanceName = this.getInstanceName(userId);

    // ... (lógica de clean slate existente)

    // Configura o webhook para a instância
    await this.setWebhook(instanceName, {
      webhookUrl: `${env.BACKEND_URL}/api/evolution/webhook`, // URL do seu backend
      webhookByEvents: false, // Envia todos os eventos para a URL principal
      enabled: true,
      events: ["connection.update", "qrcode.updated"], // Inclui qrcode.updated
    });

    // ... (restante da lógica de conexão)
  }

// ... (restante do código)
```

#### 2.1.3. Lógica de "Clean Slate" Aprimorada

A lógica de limpeza de instâncias (`deleteInstance`) no `whatsapp.service.ts` foi melhorada para garantir que sessões antigas sejam completamente removidas antes de tentar uma nova conexão, evitando conflitos.

**Alteração**: O método `connectInstance` agora inclui uma etapa mais robusta de `disconnectInstance` e `deleteInstance` antes de tentar criar ou conectar uma nova instância, especialmente para o Pairing Code.

```typescript
// src/services/whatsapp.service.ts

// ... (imports e outras lógicas)

  async connectInstance(userId: string): Promise<WhatsappConnectResponse> {
    const instanceName = this.getInstanceName(userId);

    // Lógica de "Clean Slate": Garante que não há instâncias antigas atrapalhando
    try {
      const status = await this.getInstanceStatus(instanceName);
      if (status.state !== "close" && status.state !== "not_found") {
        logger.warn({ instanceName }, "Instância não está fechada ou não encontrada. Forçando desconexão e exclusão.");
        await this.disconnectInstance(instanceName); // Tenta desconectar
        await this.deleteInstance(instanceName); // Tenta deletar
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pequena pausa para a API processar
      }
    } catch (error) {
      logger.warn({ instanceName, error: error.message }, "Erro ao tentar limpar instância existente, pode não existir.");
    }

    // ... (restante da lógica de conexão)
  }

// ... (restante do código)
```

### 2.2. Frontend (`van360`)

#### 2.2.1. Polling de Fallback no `useWhatsapp` Hook

O hook `useWhatsapp` foi modificado para incluir um mecanismo de polling que consulta o status do WhatsApp no backend a cada 5 segundos quando o diálogo de conexão está aberto. Isso garante que o frontend receba atualizações de status mesmo que o webhook falhe.

**Alteração**: O `src/hooks/useWhatsapp.ts` agora utiliza `refetchInterval` no `useQuery` para ativar o polling condicionalmente.

```typescript
// src/hooks/useWhatsapp.ts

// ... (imports)

export function useWhatsapp(options?: WhatsappHookOptions) {
  // ... (estados e hooks existentes)

  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: whatsappApi.getStatus,
    enabled: !!user?.id && isProfissional && !isPixKeyDialogOpen,
    staleTime: options?.enablePolling ? 0 : 30000, // Se polling ativo, não usa cache
    refetchInterval: options?.enablePolling ? 5000 : false, // Polling a cada 5s se solicitado
    refetchOnWindowFocus: true,
  });

  // ... (restante do código)
}
```

#### 2.2.2. Ativação do Polling no `WhatsappConnect`

O componente `WhatsappConnect` foi atualizado para ativar o polling no `useWhatsapp` quando o componente está ativo, proporcionando feedback em tempo real ao usuário.

**Alteração**: O `src/components/Whatsapp/WhatsappConnect.tsx` passa `enablePolling: true` para o `useWhatsapp`.

```typescript
// src/components/Whatsapp/WhatsappConnect.tsx

// ... (imports)

export function WhatsappConnect() {
  const { state, qrCode, pairingCode, isLoading, connect, disconnect, refresh, instanceName, requestPairingCode, userPhone } = useWhatsapp({ enablePolling: true });
  // ... (restante do código)
}
```

## 3. Recomendações de Configuração da Evolution API

Para garantir o funcionamento ideal, revise as configurações da sua instância da Evolution API (geralmente no `docker-compose.yml` ou via API `setSettings`):

*   **`WEBHOOK_GLOBAL_ENABLED: true`**: Garante que os webhooks estejam ativos.
*   **`WEBHOOK_GLOBAL_URL: https://seu-backend.com/api/evolution/webhook`**: Certifique-se de que esta URL aponte para o endpoint correto do seu backend.
*   **`INSTANCE_READ_MESSAGES: true`**: Ajuda a manter a sessão ativa.
*   **`CLEAN_TICKET_AT_LOGOUT: true`**: Garante a limpeza de credenciais ao desconectar.

## 4. Conclusão

Com essas melhorias, o sistema agora possui um mecanismo híbrido de atualização de status: o webhook da Evolution API para atualizações em tempo real e um polling robusto no frontend como fallback. A lógica de "Clean Slate" aprimorada e o mapeamento de status mais completo garantem uma maior estabilidade e confiabilidade na conexão do WhatsApp, resolvendo o problema de o frontend não atualizar o status após a conexão bem-sucedida.
