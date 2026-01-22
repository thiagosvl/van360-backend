# Relatório de Status de Implementação - Van360

**Data:** 22/01/2026  
**Repositórios Analisados:**
- Frontend: `thiagosvl/van360` (commit: 053a13d)
- Backend: `thiagosvl/van360-backend` (commit: 3dd38a0)

---

## Visão Geral

Esta é a lista de implementações atualizada após a revisão do código e os ajustes realizados. A lista reflete o estado atual do projeto e o que ainda precisa ser feito para o lançamento.

---

## ✅ Concluído (8 itens)

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

---

## ⏳ Pendente (4 itens)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Ajuste de Preços** | ⏳ Pendente | Preços promocionais na seed ainda são valores de teste (R$ 0,01) |
| **Desconto de Lançamento** | ⏳ Pendente | Lógica de desconto para os primeiros 100 clientes não implementada |
| **Pricing Simplificado** | ⏳ Pendente | Verificar se o `pricing.service.ts` ainda calcula preço proporcional |
| **Rastreamento de Mensagens** | ⏳ Pendente | Implementar rastreamento de entrega de mensagens do WhatsApp |

---

## ❌ Não Será Implementado (2 itens)

| Item | Status | Detalhes |
| :--- | :--- | :--- |
| **Trial do Plano Profissional** | ❌ Não Implementado | Decisão de não oferecer trial do Profissional por ora |
| **Exclusão de Dados** | ❌ Não Implementado | Decisão de não excluir dados de usuários inativos |

---

## Próximos Passos Sugeridos:

1. **Definir e implementar a estratégia de desconto de lançamento** (backend)
2. **Ajustar os preços promocionais na seed** para os valores reais (backend)
3. **Verificar e ajustar a lógica de pricing** para usar preços fixos por tier (backend)
4. **Implementar o rastreamento de entrega de mensagens** do WhatsApp (backend)
