# Evolution API - Pesquisa e Documentação

## 🔗 Referência Oficial
- **URL**: https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect
- **Versão**: Evolution API v2
- **Integração**: WHATSAPP-BAILEYS

## 📌 Endpoints Relevantes

### 1. **GET /instance/connect/{instance}**
- **Propósito**: Gera QR Code para conexão
- **Retorno**: 
  ```json
  {
    "base64": "data:image/png;base64,...",
    "code": "12345678" // Opcional, pode ser usado para Pairing
  }
  ```
- **Timeout QR Code**: ~60 segundos
- **Comportamento**: Se já conectado, pode retornar `{ instance: { state: "open" } }`

### 2. **GET /instance/connect/pairing/{instance}?number={phone}**
- **Propósito**: Gera Pairing Code (8 dígitos)
- **Parâmetros**:
  - `instance`: Nome da instância (ex: "user_uuid")
  - `number`: Número de telefone (ex: "5511987654321")
- **Retorno**:
  ```json
  {
    "code": "12345678"
  }
  ```
- **Timeout Pairing Code**: ~60 segundos
- **Formato do Código**: 8 dígitos numéricos
- **Uso**: Usuário abre WhatsApp → Configurações → Dispositivos Vinculados → Vincular Dispositivo → Digita código

### 3. **GET /instance/connectionState/{instance}**
- **Propósito**: Verifica estado atual da conexão
- **Retorno**:
  ```json
  {
    "instance": {
      "state": "open" | "close" | "connecting",
      "statusReason": 0
    }
  }
  ```
- **Estados Possíveis**:
  - `"open"`: Conectado e pronto para enviar mensagens
  - `"close"`: Desconectado
  - `"connecting"`: Tentando conectar (pode ficar preso aqui!)
  - `"NOT_FOUND"`: Instância não existe (404)
  - `"UNKNOWN"`: Estado desconhecido (erro)

### 4. **POST /instance/create**
- **Propósito**: Cria nova instância
- **Body**:
  ```json
  {
    "instanceName": "user_uuid",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }
  ```
- **Nota**: Deve ser chamado antes de `/instance/connect`

### 5. **DELETE /instance/logout/{instance}**
- **Propósito**: Faz logout da instância
- **Efeito**: Limpa sessão, permite nova conexão

### 6. **DELETE /instance/delete/{instance}**
- **Propósito**: Deleta a instância completamente
- **Efeito**: Remove todos os dados da instância

### 7. **Webhook: connection.update**
- **Evento**: Disparado quando estado da conexão muda
- **Payload**:
  ```json
  {
    "event": "connection.update",
    "instance": "user_uuid",
    "data": {
      "state": "open" | "close" | "connecting",
      "statusReason": 0
    }
  }
  ```
- **Confiabilidade**: Pode falhar ou ser entregue fora de ordem
- **Recomendação**: Sempre validar com `/instance/connectionState` antes de confiar no webhook

## ⏱️ Tempos de Expiração (Pesquisa)

### QR Code
- **Tempo de Expiração**: ~60 segundos (padrão WhatsApp Web)
- **Fonte**: Comportamento padrão do WhatsApp
- **Observação**: Pode variar dependendo da versão da Evolution API

### Pairing Code
- **Tempo de Expiração**: ~60 segundos (padrão WhatsApp)
- **Fonte**: Comportamento padrão do WhatsApp
- **Observação**: Código de 8 dígitos é válido por ~60s após geração

### Sessão de Conexão
- **Duração**: Indefinida (até logout ou desconexão)
- **Heartbeat**: Recomenda-se verificar status a cada 30-60 segundos
- **Timeout Inatividade**: Evolution API pode desconectar após ~24h sem atividade

## 🔄 Fluxo Recomendado para Pairing Code

### Backend
```
1. Recebe POST /api/whatsapp/connect { phoneNumber: "11987654321" }
2. Valida número de telefone
3. Chama GET /instance/connect/pairing/user_{uuid}?number=5511987654321
4. Recebe: { code: "12345678" }
5. Armazena no DB:
   - pairing_code: "12345678"
   - pairing_code_generated_at: now()
   - pairing_code_expires_at: now() + 60s
6. Retorna código para frontend
```

### Frontend
```
1. Exibe código: "12345678"
2. Exibe countdown: "Válido por 60 segundos"
3. Polling a cada 5 segundos para verificar status
4. Se expirar, oferece botão "Gerar novo código"
5. Se conectar, fecha dialog e exibe sucesso
```

### Validação de Expiração
```
1. Health Check a cada 5 minutos
2. Se pairing_code_expires_at < now(), limpa código
3. Se status mudou para "CONNECTED", limpa código
4. Se status é "DISCONNECTED", oferece reconectar
```

## 🚨 Problemas Conhecidos da Evolution API

### 1. **Instância Travada em "connecting"**
- **Sintoma**: Estado fica "connecting" indefinidamente
- **Causa**: Erro de conexão com WhatsApp ou timeout
- **Solução**: Implementar timeout de 30s e fazer logout forçado

### 2. **Webhook Não Entregue**
- **Sintoma**: Estado muda na Evolution, mas webhook não chega
- **Causa**: Falha de rede, timeout, ou fila cheia
- **Solução**: Sempre validar com `/instance/connectionState` antes de confiar

### 3. **Múltiplas Instâncias do Mesmo Usuário**
- **Sintoma**: Usuário conecta em dois dispositivos, ambos recebem mensagens
- **Causa**: Não há validação de instância única
- **Solução**: Implementar lógica de "desconectar outras instâncias"

### 4. **Limite de Conexões Simultâneas**
- **Sintoma**: Novas instâncias falham a conectar
- **Causa**: Evolution API tem limite (geralmente 1000-5000 por servidor)
- **Solução**: Monitorar número de instâncias, implementar limpeza de instâncias inativas

## 📈 Recomendações de Implementação

### 1. **Heartbeat/Ping**
```typescript
// A cada 30 segundos, verificar status
setInterval(async () => {
  const status = await whatsappService.getInstanceStatus(instanceName);
  if (status.state !== expectedState) {
    // Atualizar DB e notificar
  }
}, 30000);
```

### 2. **Retry Logic para Webhooks**
```typescript
// Se webhook falhar, enfileirar para retry
// Retry a cada 5 segundos, máximo 3 tentativas
```

### 3. **Timeout para Pairing Code**
```typescript
// Se código não for usado em 60s, limpar
// Se status não mudar para "CONNECTED" em 120s, oferecer novo código
```

### 4. **Limpeza de Instâncias Inativas**
```typescript
// A cada 24h, deletar instâncias que:
// - Estão em "DISCONNECTED" há mais de 7 dias
// - Nunca foram usadas (criadas mas nunca conectadas)
```

## 🔐 Segurança

### 1. **API Key**
- Armazenar em variável de ambiente
- Nunca expor ao frontend
- Usar em header `apikey`

### 2. **Validação de Webhook**
- Verificar que `instance` começa com "user_"
- Validar que usuário existe no DB
- Implementar assinatura de webhook (se suportado)

### 3. **Rate Limiting**
- Limitar requisições de `/instance/connect` a 1 por 5 segundos por usuário
- Limitar requisições de `/instance/connectionState` a 1 por 10 segundos por usuário

## 📝 Conclusão

A Evolution API é robusta, mas requer:
1. Implementação de Pairing Code para mobile
2. Heartbeat/polling para detecção de queda
3. Retry logic para webhooks
4. Timeout para instâncias travadas
5. Limpeza periódica de instâncias inativas

O tempo de expiração de ~60 segundos é padrão e não pode ser alterado.
