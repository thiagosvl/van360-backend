# Plano de Implementação: Estabilidade WhatsApp (Antigravity) 🚀

Este plano foi gerado pela **Antigravity AI** após analisar o diagnóstico do **Manus AI**, o estado atual do código (Backend e Frontend) e as execuções realizadas.

## 📝 Diagnóstico Técnico (Antigravity vs. Manus)

| Ponto | Diagnóstico Manus | Diagnóstico Antigravity | Ação Realizada |
|-------|-------------------|--------------------------|------|
| **Pairing Code** | Não implementado | Implementado, mas com "Deadlock" no connecting | ✅ Implementado com "Clean Slate" |
| **Instância Travada** | Timeout 30s | Reset/Kill imediato se sujo | ✅ Reset antes de novo código |
| **Persistência** | Necessária no DB | Essencial para Refresh de página | ✅ Colunas adicionadas (`pairing_code`...) |
| **Frequência Health** | 15 min (lento) | 5 min (ideal) | ✅ Aumentada para 5 min + Heartbeat |
| **Heartbeat** | Proposto 30s | Bom, mas consome infra | ✅ Implementado (45s no server.ts) |

---

## 🛠️ Mudanças Realizadas (Status Atual)

### Fase 1: Estabilidade e Persistência (✅ CONCLUÍDO)
- [x] **Fix DTO & Syntax**: Erros de compilação do `whatsapp.service.ts` e duplicidade no DTO corrigidos.
- [x] **DB Migration**: Colunas `pairing_code`, `pairing_code_generated_at`, `pairing_code_expires_at` adicionadas e migradas.
- [x] **Unified Connect**: `whatsapp.service.ts` refatorado para usar uma única função `connectInstance` que lida com QR e Pairing Code.
- [x] **Clean Slate**: Lógica implementada para desconectar instância existente antes de gerar novo Pairing Code.
- [x] **Frontend Polling**: Otimizado para 5s e corrigido bug de "white screen" (crash `code.replace`).
- [x] **Frontend Handling**: Corrigido bug onde o frontend quebrava ao receber objeto em vez de string.
- [x] **Crash 500 Fix**: Corrigido erro no `whatsapp.controller.ts` quando o body vinha undefined (QR Code request).
- [x] **Pairing Code Validation**: Backend agora ignora códigos muito longos (>20 chars) que na verdade são QR Codes vazando da API.

### Fase 2: Monitoramento Proativo (✅ CONCLUÍDO)
- [x] **Heartbeat Job**: Criado `whatsapp-heartbeat.job.ts` que roda a cada 45s (configurado no `server.ts` e Orchestrator) para manter a conexão viva.
- [x] **Health Check V2**: Otimizado `whatsapp-health-check.job.ts` para tolerar "connecting" por 15s antes de matar, e rodar a cada 5 minutos.
- [x] **Job Orchestrator**: Atualizado para incluir os novos jobs de alta frequência.
- [x] **Server.ts**: Configurado `setInterval` local para garantir execução em ambiente de desenvolvimento.

### Fase 3: Próximos Passos (Pendentes)
- [ ] **Webhook Retry**: Implementar `webhook-evolution.queue.ts` (BullMQ) para garantir que mensagens recebidas não sejam perdidas se o backend piscar.
- [ ] **Frontend Status Hook**: Refatorar `useWhatsapp` para separar melhor as responsabilidades (opcional, código atual está funcional).

---

## 📐 Soluções Técnicas Detalhadas

### 1. O Problema do "Código Gigante"
A Evolution API, ao falhar na geração do Pairing Code (por timing ou estado interno), retornava o payload do QR Code (Base64) no campo `code`.
**Solução**: Adicionada validação em `whatsapp.service.ts`:
```typescript
if (pCode && pCode.length < 20) {
    return { pairingCode: { code: pCode } };
}
```

### 2. O Problema da Instabilidade (Queda após 5min)
A conexão com a Evolution/Baileys cai se não houver tráfego ("idle timeout").
**Solução**: Implementado **Heartbeat**:
```typescript
// server.ts e job-orchestrator.service.ts
setInterval(() => {
    whatsappHeartbeatJob.run(); // Pinga a API a cada 45s
}, 45000);
```

### 3. Persistência
Agora o Pairing Code é salvo no banco assim que gerado, permitindo que o usuário recarregue a página sem perder o código visual.

---
**Atualizado por**: Antigravity AI
**Data**: 14 de Janeiro de 2026
