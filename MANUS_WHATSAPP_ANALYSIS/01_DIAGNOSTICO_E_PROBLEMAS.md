# Diagnóstico: Integração WhatsApp (Evolution API) - Van360

## 🔴 Problemas Identificados

### 1. **Pairing Code Não Implementado**
- **Status**: ❌ Não existe suporte a Pairing Code no código atual
- **Impacto**: Motoristas só conseguem conectar via QR Code, o que é impraticável em dispositivos móveis
- **Causa Raiz**: O endpoint `/instance/connect/pairing/{instance}?number={phone}` da Evolution API não está implementado
- **Evidência**: 
  - `whatsapp.service.ts`: Método `connectInstance()` só gera QR Code
  - Não há lógica para enviar número de telefone e receber código de 8 dígitos

### 2. **Expiração de Código Não Gerenciada**
- **Status**: ⚠️ Sem tratamento de expiração
- **Tempo de Expiração Real**: 
  - **QR Code**: ~60 segundos (padrão WhatsApp Web)
  - **Pairing Code**: ~60 segundos (padrão WhatsApp)
- **Problema**: Sistema assume 45 segundos (provavelmente arbitrário), sem retry automático
- **Impacto**: Usuários recebem código expirado e não conseguem reconectar

### 3. **Status Mapping Inconsistente**
- **Status**: ⚠️ Mapeamento parcial entre Evolution API e DB
- **Problema**:
  ```
  Evolution API retorna: "open", "close", "connecting"
  DB espera: "CONNECTED", "DISCONNECTED", "CONNECTING"
  Constantes: WHATSAPP_STATUS.OPEN = "open" (inconsistente com DB!)
  ```
- **Evidência**:
  - `constants.ts` linha 44: `OPEN: "open"` (não é valor do enum)
  - `webhook-evolution.handler.ts` linha 31: Mapeia corretamente
  - `whatsapp-health-check.job.ts` linha 53: Compara com "open" (string literal)

### 4. **Health Check Job com Problemas de Confiabilidade**
- **Status**: ⚠️ Implementação frágil
- **Problemas**:
  1. Roda a cada 15 minutos (intervalo grande demais para detecção de queda)
  2. Não há retry logic se a API da Evolution falhar
  3. Notificação de desconexão usa instância global (pode falhar silenciosamente)
  4. Sem logging de falhas de notificação

### 5. **Webhook de Conexão Sem Confirmação**
- **Status**: ⚠️ Sem mecanismo de confirmação
- **Problema**: 
  - Webhook `connection.update` atualiza DB, mas não há confirmação de recebimento
  - Se webhook falhar silenciosamente, DB fica dessincronizado com Evolution
  - Sem retry queue para webhooks falhados

### 6. **Sem Polling de Status no Frontend**
- **Status**: ❌ Completamente ausente
- **Problema**: 
  - Frontend não verifica status do WhatsApp periodicamente
  - Usuário não sabe se conexão caiu até tentar enviar mensagem
  - Dialog de conexão não reabre automaticamente

### 7. **Sem Tratamento de Instância Travada**
- **Status**: ⚠️ Parcialmente implementado
- **Problema**:
  - Se instância ficar em "connecting" indefinidamente, não há timeout
  - `connectInstance()` tenta logout forçado, mas sem timeout
  - Sem limite de tentativas de reconexão

### 8. **Sem Validação de Número de Telefone**
- **Status**: ⚠️ Sem validação
- **Problema**:
  - Número pode estar vazio ou inválido
  - Evolution API pode rejeitar, mas sem feedback claro
  - Sem sanitização adequada

## 📊 Fluxo Atual vs. Esperado

### Fluxo Atual (Problemático)
```
1. Motorista clica em "Conectar WhatsApp"
   ↓
2. Frontend chama POST /api/whatsapp/connect
   ↓
3. Backend gera QR Code
   ↓
4. Motorista escaneia QR Code (impraticável no celular)
   ↓
5. Evolution API envia webhook "connection.update"
   ↓
6. DB atualiza whatsapp_status = "CONNECTED"
   ↓
7. Health Check a cada 15 min verifica status
   ↓
8. Se caiu, notifica via instância global (pode falhar)
```

### Fluxo Esperado (Proposto)
```
1. Motorista clica em "Conectar WhatsApp"
   ↓
2. Frontend envia número de telefone: POST /api/whatsapp/connect { phoneNumber: "11987654321" }
   ↓
3. Backend gera Pairing Code (8 dígitos)
   ↓
4. Frontend exibe código e countdown de 60s
   ↓
5. Motorista abre WhatsApp → Configurações → Dispositivos Vinculados → Vincular Dispositivo
   ↓
6. Motorista digita código de 8 dígitos
   ↓
7. Evolution API envia webhook "connection.update" com state="open"
   ↓
8. DB atualiza whatsapp_status = "CONNECTED"
   ↓
9. Frontend para de exibir dialog (via realtime subscription ou polling)
   ↓
10. Health Check a cada 5 min verifica status
   ↓
11. Se caiu, envia notificação via instância global + marca para reconectar
   ↓
12. Frontend reexibe dialog de conexão em tempo real
```

## 🔍 Raiz dos Problemas

### Problema 1: Pairing Code Expirado Rapidamente
- **Causa**: Código gerado mas não armazenado com timestamp
- **Solução**: Armazenar `pairing_code`, `pairing_code_generated_at`, `pairing_code_expires_at` na tabela `usuarios`

### Problema 2: Instâncias Caem Sem Motivo Aparente
- **Causa Possível 1**: Webhook não é recebido pela Evolution (falha de rede)
- **Causa Possível 2**: Instância principal está estável, mas instâncias de usuários não têm heartbeat
- **Causa Possível 3**: Evolution API tem limite de conexões simultâneas
- **Solução**: 
  1. Implementar heartbeat (ping) a cada 30s
  2. Aumentar frequência de health check para 5 minutos
  3. Implementar retry queue para webhooks

### Problema 3: QR Code Funciona Melhor que Pairing Code
- **Observação**: Você mencionou que QR Code parece mais estável
- **Explicação Possível**: QR Code cria conexão "web" (como WhatsApp Web), enquanto Pairing Code cria conexão "device" (como app)
- **Recomendação**: Oferecer ambas as opções, com Pairing Code como padrão para mobile

## 📋 Checklist de Implementação

- [ ] Adicionar suporte a Pairing Code no `whatsapp.service.ts`
- [ ] Adicionar colunas de Pairing Code na tabela `usuarios`
- [ ] Implementar heartbeat/ping a cada 30 segundos
- [ ] Aumentar frequência de health check para 5 minutos
- [ ] Implementar retry queue para webhooks falhados
- [ ] Adicionar polling de status no frontend
- [ ] Implementar timeout para instâncias travadas em "connecting"
- [ ] Adicionar validação de número de telefone
- [ ] Implementar notificação de reconexão no frontend
- [ ] Adicionar logs detalhados para debugging
- [ ] Testar fluxo completo de Pairing Code
- [ ] Testar fluxo de desconexão e reconexão

## 🎯 Próximos Passos

1. **Fase 1**: Implementar Pairing Code no backend
2. **Fase 2**: Otimizar Health Check Job
3. **Fase 3**: Adicionar polling no frontend
4. **Fase 4**: Implementar notificações de desconexão
5. **Fase 5**: Testes e validação
