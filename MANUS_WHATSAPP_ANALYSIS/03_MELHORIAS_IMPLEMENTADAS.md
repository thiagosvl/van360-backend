# Melhorias Implementadas - WhatsApp Integration

## ✅ Fase 1: Suporte a Pairing Code (IMPLEMENTADO)

### Arquivos Modificados

#### 1. **src/types/dtos/whatsapp.dto.ts**
```typescript
// ADICIONADO:
export interface EvolutionPairingCode {
    code: string;
}

// MODIFICADO:
export interface ConnectInstanceResponse {
    qrcode?: EvolutionQrCode;
    pairingCode?: EvolutionPairingCode;  // ← NOVO
    instance?: EvolutionInstance;
}
```

**Justificativa**: Permitir retorno de Pairing Code além de QR Code.

---

#### 2. **src/services/whatsapp.service.ts**
```typescript
// MODIFICADO: connectInstance()
async connectInstance(instanceName: string, phoneNumber?: string): Promise<ConnectInstanceResponse> {
    // 1. Garantir que instância existe
    await this.createInstance(instanceName);

    // 2. Se tiver número de telefone, gera Pairing Code
    if (phoneNumber) {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
        
        const url = `${EVO_URL}/instance/connect/pairing/${instanceName}?number=${finalPhone}`;
        const { data } = await axios.get<{ code: string }>(url, { headers: { "apikey": EVO_KEY } });
        
        if (data?.code) {
            return { pairingCode: { code: data.code } };
        }
    }

    // 3. Caso contrário, gera QR Code (ou se pairing falhar)
    // ... resto do código
}
```

**Justificativa**: 
- Se usuário fornecer número de telefone, tenta gerar Pairing Code
- Se falhar ou não fornecer número, volta para QR Code (fallback)
- Permite ambas as opções com prioridade para Pairing Code

---

#### 3. **src/controllers/whatsapp.controller.ts**
```typescript
// MODIFICADO: connect()
connect: async (request: FastifyRequest, reply: FastifyReply) => {
    const authUid = (request as any).user?.id;
    const { phoneNumber } = request.body as { phoneNumber?: string };  // ← NOVO

    logger.info({ authUid, phoneNumber }, "WhatsappController.connect - Request received");
    
    // ... resto do código
    
    const result: ConnectInstanceResponse = await whatsappService.connectInstance(
        instanceName, 
        phoneNumber  // ← NOVO
    );
}
```

**Justificativa**: Aceitar número de telefone do frontend para gerar Pairing Code.

---

## 🔄 Próximas Fases (A Implementar)

### Fase 2: Otimizar Health Check Job

#### Problema
- Roda a cada 15 minutos (muito lento para detecção de queda)
- Sem retry logic se Evolution API falhar
- Notificação pode falhar silenciosamente

#### Solução
```typescript
// Aumentar frequência para 5 minutos
// Adicionar retry logic com exponential backoff
// Adicionar logging detalhado
// Implementar circuit breaker para Evolution API
```

#### Arquivo a Modificar
- `src/services/jobs/whatsapp-health-check.job.ts`

---

### Fase 3: Adicionar Colunas de Pairing Code no DB

#### Problema
- Sem armazenamento de código gerado
- Sem timestamp de geração/expiração
- Sem forma de validar se código ainda é válido

#### Solução
```sql
ALTER TABLE usuarios ADD COLUMN pairing_code VARCHAR(8);
ALTER TABLE usuarios ADD COLUMN pairing_code_generated_at TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN pairing_code_expires_at TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN pairing_code_attempts INT DEFAULT 0;
```

#### Arquivo a Criar
- `supabase/migrations/20260114_add_pairing_code_columns.sql`

---

### Fase 4: Implementar Heartbeat/Ping

#### Problema
- Sem verificação periódica de saúde da conexão
- Instâncias podem cair sem serem detectadas

#### Solução
```typescript
// A cada 30 segundos, fazer ping na instância
// Se falhar, marcar para reconexão
// Se estado mudou, atualizar DB
```

#### Arquivo a Criar
- `src/services/jobs/whatsapp-heartbeat.job.ts`

---

### Fase 5: Implementar Polling no Frontend

#### Problema
- Frontend não verifica status do WhatsApp
- Usuário não sabe se conexão caiu

#### Solução
```typescript
// A cada 5 segundos, verificar status
// Se status mudou para DISCONNECTED, reexibir dialog
// Se status mudou para CONNECTED, fechar dialog
```

#### Arquivo a Modificar/Criar
- `src/hooks/api/useWhatsappStatus.ts` (NOVO)
- `src/components/dialogs/WhatsappConnectionDialog.tsx` (NOVO)

---

### Fase 6: Implementar Retry Queue para Webhooks

#### Problema
- Webhook pode não ser entregue
- Sem mecanismo de retry

#### Solução
```typescript
// Enfileirar webhook em Redis
// Retry a cada 5 segundos, máximo 3 tentativas
// Após 3 falhas, marcar para revisão manual
```

#### Arquivo a Criar
- `src/queues/webhook-evolution.queue.ts`

---

### Fase 7: Implementar Timeout para Instâncias Travadas

#### Problema
- Instância pode ficar em "connecting" indefinidamente
- Sem mecanismo de timeout

#### Solução
```typescript
// Se instância fica em "connecting" por mais de 30s, fazer logout forçado
// Oferecer novo código de conexão
```

#### Arquivo a Modificar
- `src/services/whatsapp.service.ts` (método `connectInstance`)

---

## 📋 Checklist de Implementação

### Fase 1 ✅
- [x] Adicionar interface `EvolutionPairingCode`
- [x] Modificar `ConnectInstanceResponse`
- [x] Implementar lógica de Pairing Code em `connectInstance()`
- [x] Aceitar `phoneNumber` no controller

### Fase 2 ⏳
- [ ] Aumentar frequência de health check para 5 minutos
- [ ] Adicionar retry logic com exponential backoff
- [ ] Adicionar logging detalhado
- [ ] Implementar circuit breaker

### Fase 3 ⏳
- [ ] Criar migration SQL para colunas de Pairing Code
- [ ] Atualizar tipos TypeScript
- [ ] Atualizar service para armazenar/validar código

### Fase 4 ⏳
- [ ] Criar job de heartbeat
- [ ] Implementar ping a cada 30 segundos
- [ ] Atualizar DB com resultado do ping
- [ ] Notificar se status mudou

### Fase 5 ⏳
- [ ] Criar hook `useWhatsappStatus`
- [ ] Criar dialog de conexão `WhatsappConnectionDialog`
- [ ] Implementar polling a cada 5 segundos
- [ ] Testar em mobile

### Fase 6 ⏳
- [ ] Criar queue de webhook
- [ ] Implementar retry logic
- [ ] Adicionar logging de falhas
- [ ] Testar com webhook falhando

### Fase 7 ⏳
- [ ] Adicionar timeout para "connecting"
- [ ] Implementar logout forçado
- [ ] Oferecer novo código
- [ ] Testar cenário de travamento

---

## 🧪 Testes Recomendados

### Teste 1: Pairing Code Básico
```
1. Motorista clica "Conectar WhatsApp"
2. Insere número de telefone
3. Recebe código de 8 dígitos
4. Digita código no WhatsApp
5. Conexão estabelecida
```

### Teste 2: Pairing Code Expirado
```
1. Motorista recebe código
2. Aguarda 65 segundos
3. Tenta usar código
4. Recebe mensagem "Código expirado"
5. Oferece gerar novo código
```

### Teste 3: Desconexão e Reconexão
```
1. Motorista conectado
2. Desconecta WhatsApp do dispositivo
3. Frontend detecta desconexão em até 5 minutos
4. Reexibe dialog de conexão
5. Motorista reconecta
```

### Teste 4: Instância Travada
```
1. Motorista gera código
2. Instância fica em "connecting" por 35 segundos
3. Sistema faz logout forçado
4. Oferece novo código
5. Motorista reconecta com sucesso
```

---

## 📊 Métricas de Sucesso

1. **Taxa de Conexão**: > 95% de motoristas conseguem conectar
2. **Tempo de Conexão**: < 30 segundos (Pairing Code)
3. **Tempo de Detecção de Queda**: < 5 minutos
4. **Taxa de Reconexão**: > 90% reconectam automaticamente
5. **Taxa de Erro**: < 1% de erros por conexão

---

## 🚀 Roadmap

| Fase | Descrição | Prioridade | Estimativa |
|------|-----------|-----------|-----------|
| 1 | Pairing Code | 🔴 CRÍTICA | 1h |
| 2 | Health Check Otimizado | 🔴 CRÍTICA | 2h |
| 3 | DB Pairing Code | 🟠 ALTA | 1h |
| 4 | Heartbeat | 🟠 ALTA | 2h |
| 5 | Polling Frontend | 🟠 ALTA | 3h |
| 6 | Retry Queue | 🟡 MÉDIA | 2h |
| 7 | Timeout Instância | 🟡 MÉDIA | 1h |

**Total Estimado**: 12 horas

---

## 📝 Notas Importantes

1. **Compatibilidade**: Manter suporte a QR Code como fallback
2. **Mobile First**: Priorizar Pairing Code para mobile
3. **Logging**: Adicionar logs detalhados para debugging
4. **Monitoramento**: Implementar métricas no Datadog/New Relic
5. **Documentação**: Atualizar README com novo fluxo
