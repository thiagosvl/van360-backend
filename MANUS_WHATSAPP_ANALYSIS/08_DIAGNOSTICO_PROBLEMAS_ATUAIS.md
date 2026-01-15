# Diagnóstico Detalhado: Problemas no Fluxo Atual de WhatsApp

## 1. Problemas Identificados

### 1.1 Backend - whatsapp.service.ts

**Problema 1: Timeout Inadequado na Criação de Instância**
- **Localização**: Linha 219
- **Código**: `await new Promise(r => setTimeout(r, 1200));`
- **Problema**: 1.2 segundos é insuficiente para a Evolution API registrar a instância internamente. Isso causa falhas silenciosas ao tentar conectar logo em seguida.
- **Impacto**: O Pairing Code falha porque a instância ainda não está pronta.
- **Solução**: Aumentar para 3 segundos e adicionar retry logic.

**Problema 2: Lógica de Limpeza Agressiva**
- **Localização**: Linhas 258-264
- **Código**: Força `disconnect` + `delete` toda vez que um Pairing Code é solicitado.
- **Problema**: Se o motorista clicar 2x rapidamente, a segunda requisição deleta a instância que está gerando o código da primeira.
- **Impacto**: O Pairing Code nunca chega ao frontend porque a instância foi deletada.
- **Solução**: Verificar se já existe um código válido antes de resetar.

**Problema 3: Modo QR Code Desativado**
- **Localização**: Linhas 270-271
- **Código**: `await this.createInstance(instanceName, false);` (false = desativa QR)
- **Problema**: O comentário diz "Lite Mode é mais rápido" mas a Evolution API precisa de tempo para inicializar o Chromium.
- **Impacto**: O QR Code demora muito ou não é gerado.
- **Solução**: Usar `true` para Full Mode e aumentar o timeout.

**Problema 4: Loop de Tentativas com Delays Inconsistentes**
- **Localização**: Linhas 276-304
- **Código**: 8 tentativas com 2.5s de delay, mas sem backoff exponencial.
- **Problema**: Se a API está lenta, 8 × 2.5s = 20 segundos é muito tempo. O motorista acha que travou.
- **Impacto**: Experiência ruim do usuário.
- **Solução**: Usar backoff exponencial (1s, 2s, 4s, 8s) e máximo 5 tentativas.

### 1.2 Backend - webhook-evolution.handler.ts

**Problema 5: Falta de Validação de Payload**
- **Localização**: Linhas 25-32
- **Código**: Não valida se `data.pairingCode` é uma string válida antes de salvar.
- **Problema**: Pode salvar valores inválidos ou nulos no banco.
- **Impacto**: Frontend recebe código inválido e exibe erro.
- **Solução**: Adicionar validação rigorosa e logging de debug.

**Problema 6: Sem Tratamento de Erro de Atualização**
- **Localização**: Linhas 93-100
- **Código**: Se a atualização falhar, apenas loga mas não retorna false.
- **Problema**: O webhook retorna true mesmo que o banco não tenha sido atualizado.
- **Impacto**: Frontend acha que status foi atualizado mas não foi.
- **Solução**: Retornar false e tentar novamente.

### 1.3 Frontend - useWhatsapp.ts

**Problema 7: Realtime Listener Não Invalida Query Corretamente**
- **Localização**: Linhas 46-50
- **Código**: `queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });`
- **Problema**: Invalida a query mas não força um refetch imediato. Há delay de até 5 segundos (staleTime).
- **Impacto**: O motorista vê o código antigo por alguns segundos.
- **Solução**: Usar `refetchType: "all"` ou fazer refetch manual.

**Problema 8: Buffer Local Pode Ficar Desincronizado**
- **Localização**: Linhas 30, 111-114
- **Código**: `mutationPairingData` é um buffer local que pode divergir do banco.
- **Problema**: Se o Webhook chegar antes da mutação ser processada, há conflito.
- **Impacto**: Frontend mostra código antigo enquanto o novo já está no banco.
- **Solução**: Priorizar dados do banco (Realtime) sobre buffer local.

### 1.4 Frontend - WhatsappStatusView.tsx

**Problema 9: Auto-Renewal Failsafe Muito Agressivo**
- **Localização**: Linhas 117-121
- **Código**: Força renovação se passou 20 segundos após expiração.
- **Problema**: A Evolution API pode estar renovando o código mas o Webhook ainda não chegou. Isso gera duplicatas.
- **Impacto**: Dois códigos válidos ao mesmo tempo, confunde o motorista.
- **Solução**: Aumentar threshold para 45 segundos e adicionar debounce.

**Problema 10: Cooldown de 10 Segundos Muito Longo**
- **Localização**: Linhas 140-142
- **Código**: `if (now - lastRequestTime.current > 10000)`
- **Problema**: Se o Realtime falhar, o motorista espera 10s para uma nova tentativa.
- **Impacto**: Experiência lenta em caso de falha.
- **Solução**: Reduzir para 3 segundos com jitter.

## 2. Causa Raiz: Por Que Não Funciona?

O fluxo atual falha porque:

1. **Timing Inadequado**: A instância não está pronta quando o código é solicitado.
2. **Limpeza Prematura**: A instância é deletada antes do código chegar ao frontend.
3. **Falta de Sincronização**: O Realtime não força refetch imediato, causando delay.
4. **Sem Retry Inteligente**: Falhas temporárias da API não são tratadas com backoff.

## 3. Próximas Ações

As correções serão aplicadas em:
- `src/services/whatsapp.service.ts`: Timing, retry logic, validação.
- `src/services/handlers/webhook-evolution.handler.ts`: Validação, error handling.
- `src/hooks/useWhatsapp.ts`: Realtime listener, refetch strategy.
- `src/components/Whatsapp/WhatsappStatusView.tsx`: Auto-renewal logic, cooldown.
