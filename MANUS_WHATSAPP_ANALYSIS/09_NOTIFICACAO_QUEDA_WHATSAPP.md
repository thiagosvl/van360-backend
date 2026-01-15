# Sistema de Notificação de Queda do WhatsApp

## 1. Objetivo

Quando a instância de WhatsApp de um motorista desconectar (status muda para `close` ou `disconnected`), o sistema deve:

1. Detectar a desconexão via Webhook ou Health Check Job.
2. Enviar uma mensagem automática ao motorista através da **Instância Principal do Van360** (número oficial da empresa).
3. A mensagem deve informar que o WhatsApp dele desconectou e pedir para reconectar na plataforma.
4. Quando o motorista entrar na plataforma, um diálogo deve aparecer com o Pairing Code pronto.

## 2. Fluxo Técnico

### 2.1 Detecção de Desconexão

**Via Webhook (Tempo Real)**:
```
Evolution API -> Webhook POST /api/evolution/webhook
-> Payload: { event: "connection.update", instance: "user_xyz", data: { state: "close" } }
-> webhook-evolution.handler.ts detecta state === "close"
-> Atualiza banco: whatsapp_status = "DISCONNECTED"
-> Dispara notificação
```

**Via Health Check Job (Fallback)**:
```
Job executa a cada 10 minutos
-> Consulta status de todas as instâncias na Evolution API
-> Compara com status no banco
-> Se divergência (ex: banco diz CONNECTED mas API diz close), atualiza e dispara notificação
```

### 2.2 Envio de Mensagem

A mensagem deve ser enviada através da **Instância Principal** (GLOBAL_WHATSAPP_INSTANCE):

```typescript
// Exemplo de chamada
await whatsappService.sendText(
  motorista.telefone,  // Número do motorista
  "Olá! Seu WhatsApp desconectou do Van360. Para manter o envio de notificações de cobranças ativo, reconecte em: [link]",
  GLOBAL_WHATSAPP_INSTANCE  // Instância oficial
);
```

**Pré-requisitos**:
- A Instância Principal deve estar **sempre conectada** (é a instância oficial da empresa).
- Deve haver retry logic caso o envio falhe.
- Deve haver logging detalhado para auditoria.

## 3. Implementação Proposta

### 3.1 Adicionar Função no webhook-evolution.handler.ts

```typescript
async handleConnectionUpdate(instanceName: string, data: any): Promise<boolean> {
    const { state } = data;
    
    // ... validações ...
    
    // Se desconectou, disparar notificação
    if (state === "close" || state === "disconnected") {
        await this.notifyMotoristaDisconnection(usuarioId);
    }
    
    return true;
}

private async notifyMotoristaDisconnection(usuarioId: string): Promise<void> {
    try {
        // 1. Buscar dados do motorista
        const { data: usuario } = await supabaseAdmin
            .from("usuarios")
            .select("id, telefone, nome")
            .eq("id", usuarioId)
            .single();
        
        if (!usuario?.telefone) {
            logger.warn({ usuarioId }, "Motorista sem telefone. Notificação não enviada.");
            return;
        }
        
        // 2. Montar mensagem
        const reconectLink = `${env.FRONTEND_URL}/assinatura?reconnect=true`;
        const mensagem = `Olá ${usuario.nome}! Seu WhatsApp desconectou do Van360. Para manter o envio de notificações ativo, reconecte em: ${reconectLink}`;
        
        // 3. Enviar via instância principal
        const enviado = await whatsappService.sendText(
            usuario.telefone,
            mensagem,
            GLOBAL_WHATSAPP_INSTANCE
        );
        
        if (enviado) {
            logger.info({ usuarioId }, "Notificação de desconexão enviada com sucesso");
        } else {
            logger.warn({ usuarioId }, "Falha ao enviar notificação de desconexão");
        }
    } catch (error) {
        logger.error({ error, usuarioId }, "Erro ao notificar desconexão");
    }
}
```

### 3.2 Adicionar Notificação no Health Check Job

```typescript
// No whatsapp-health-check.job.ts

if (realStatus !== dbStatus && realStatus === WHATSAPP_STATUS.DISCONNECTED) {
    // Instância caiu
    logger.warn({ usuarioId, oldStatus: dbStatus }, "Instância desconectou. Notificando motorista...");
    
    // Chamar a mesma função de notificação
    await notifyMotoristaDisconnection(usuarioId);
}
```

## 4. Considerações Importantes

### 4.1 Evitar Spam

- **Problema**: Se a instância fica oscilando (conecta/desconecta), pode gerar múltiplas notificações.
- **Solução**: Adicionar um campo `last_disconnection_notification_at` na tabela `usuarios`. Só enviar notificação se passou mais de 1 hora desde a última.

### 4.2 Instância Principal Offline

- **Problema**: Se a Instância Principal também cair, não conseguimos enviar notificações.
- **Solução**: Implementar um sistema de fila (Redis ou banco de dados) para armazenar mensagens pendentes e tentar reenviar quando a instância voltar.

### 4.3 Reconexão Automática

- **Problema**: Algumas desconexões são temporárias (oscilação de internet).
- **Solução**: Implementar retry automático na Evolution API antes de notificar o motorista. Só notificar se a desconexão persistir por mais de 5 minutos.

## 5. Próximas Fases

1. **Fase 1** (Atual): Implementar notificação básica de desconexão.
2. **Fase 2**: Adicionar sistema de fila para mensagens pendentes.
3. **Fase 3**: Implementar reconexão automática com retry.
4. **Fase 4**: Dashboard de monitoramento de instâncias (quais caem com frequência, por quê, etc).

## 6. Testes Recomendados

1. **Teste Manual**: Desconectar a instância de um motorista e verificar se a notificação chega.
2. **Teste de Carga**: Desconectar 100 instâncias simultaneamente e verificar se o sistema aguenta.
3. **Teste de Falha**: Desconectar a Instância Principal e verificar se as mensagens ficam em fila.
