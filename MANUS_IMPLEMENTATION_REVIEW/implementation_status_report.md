# Relatório de Status de Implementação - Van360

**Data:** 22/01/2026  
**Repositórios Analisados:**
- Frontend: `thiagosvl/van360` (commit: 053a13d)
- Backend: `thiagosvl/van360-backend` (commit: c8ddc88)

---

## Visão Geral

Esta é a lista de implementações atualizada após a revisão do código e os ajustes realizados. A lista reflete o estado atual do projeto e o que ainda precisa ser feito para o lançamento.

---

## ✅ Concluído (9 itens)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Remoção do Plano Gratuito** | ✅ Concluído | Removido do backend, frontend e landing page |
| **Trial de 21 Dias (Essencial)** | ✅ Concluído | Implementado no backend e refletido no frontend |
| **Dialogs de Expiração** | ✅ Concluído | `TrialExpiredDialog` e `SubscriptionExpiredDialog` criados |
| **Hook de Status da Assinatura** | ✅ Concluído | `useSubscriptionStatus` implementado e funcional |
| **Slider de Franquias** | ✅ Concluído | Componente `FranchiseSelection.tsx` criado e integrado |
| **Bloqueio Read-Only** | ✅ Concluído | Implementado no backend e frontend |
| **Privacidade da Evolution API** | ✅ Concluído | Configurações de privacidade aplicadas |
| **Tratamento Básico de Webhooks** | ✅ Concluído | Handlers básicos implementados |
| **Pricing Simplificado** | ✅ Concluído | Ajustado para usar preço fixo do tier |

---

## ⏳ Pendente (1 item)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Rastreamento de Mensagens** | ⏳ Pendente | Implementar rastreamento de entrega de mensagens do WhatsApp |

---

## ✅ Resolvido pelo Usuário (2 itens)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Ajuste de Preços** | ✅ Resolvido | Usuário ajustará manualmente antes do lançamento |
| **Desconto de Lançamento** | ✅ Resolvido | Usuário controlará manualmente |

---

## ❌ Não Será Implementado (2 itens)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Trial do Plano Profissional** | ❌ Não Implementado | Decisão de não oferecer trial do Profissional por ora |
| **Exclusão de Dados** | ❌ Não Implementado | Decisão de não excluir dados de usuários inativos |

---

## Próximos Passos Sugeridos:

1. **Implementar rastreamento de entrega de mensagens** do WhatsApp (quando necessário)
2. **Ajustar preços promocionais na seed** antes do lançamento (usuário)

---

## ✅ Correções Realizadas:

### 22/01/2026 - Correção de Pricing
- **Problema:** `pricing.service.ts` calculava preço proporcional para sub-planos
- **Solução:** Ajustado para usar preço fixo do tier (sem cálculo proporcional)
- **Commit:** `c8ddc88` - fix: usar preço fixo do tier em vez de cálculo proporcional
- **Impacto:** Agora quando o usuário escolhe uma quantidade dentro dos sub-planos (≤ 90), o sistema retorna o preço fixo do tier que encaixa a quantidade, sem cálculo proporcional
