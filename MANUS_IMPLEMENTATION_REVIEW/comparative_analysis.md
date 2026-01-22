# Análise Comparativa: Implementações Propostas vs. Código Atual

**Data:** 22/01/2026  
**Repositórios Analisados:**
- Frontend: `thiagosvl/van360` (commit: 4716e70)
- Backend: `thiagosvl/van360-backend` (commit: 4dcb7ae)

---

## 1. Remoção do Plano Gratuito

### ✅ Status: **IMPLEMENTADO**

**Backend:**
- ✅ Seed atualizada: Apenas planos Essencial e Profissional existem
- ✅ Nenhuma referência a "gratuito" ou "free" no código TypeScript

**Frontend:**
- ✅ Constantes atualizadas: Apenas `PLANO_ESSENCIAL` e `PLANO_PROFISSIONAL`
- ⚠️ Landing Page (`pages/lp/Index.tsx`): Ainda contém referências a "free" na tabela de comparação
  - **Ação Necessária:** Atualizar a landing page para remover a coluna "Gratuito"

---

## 2. Ajuste de Preços

### ⚠️ Status: **PARCIALMENTE IMPLEMENTADO**

**Backend (Seed):**
- ✅ Plano Essencial: R$ 89,90 (com promoção R$ 0,01 ativa)
- ✅ Plano Profissional 25: R$ 107,00 (com promoção R$ 0,01 ativa)
- ✅ Plano Profissional 50: R$ 147,00 (com promoção R$ 0,02 ativa)
- ✅ Plano Profissional 90: R$ 227,00 (com promoção R$ 0,03 ativa)

**Observações:**
- ⚠️ Os preços promocionais estão como R$ 0,01, R$ 0,02, R$ 0,03 (valores de teste)
- ⚠️ A promoção está marcada como ativa (`promocao_ativa: true`)
- **Decisão Pendente:** Definir se o preço promocional será R$ 49,90 para os primeiros 100 clientes ou manter R$ 69,90 sem promoção

---

## 3. Trial de 21 Dias para Essencial

### ✅ Status: **IMPLEMENTADO**

**Backend:**
- ✅ Seed: `trial_days: 21` para o plano Essencial
- ✅ Configuração interna: `TRIAL_DIAS_ESSENCIAL: 21`

**Frontend:**
- ✅ Hook `useUsuarioResumo`: Busca `trial_dias_total` do backend

---

## 4. Dialogs de Upgrade e Expiração

### ✅ Status: **IMPLEMENTADO**

**Novos Componentes Criados:**
- ✅ `TrialExpiredDialog.tsx`: Dialog para conversão pós-trial
- ✅ `SubscriptionExpiredDialog.tsx`: Dialog para renovação de assinatura expirada
- ✅ `useSubscriptionStatus.ts`: Hook para controlar exibição dos dialogs

**PlanUpgradeDialog:**
- ✅ Lógica de `salesContext` ajustada (mas ainda usa `"acquisition"` como fallback)
- ✅ Lógica de `hideTabs` implementada
- ⚠️ Mensagens contextuais: Não foram implementadas (ainda usa props `title` e `description`)

**Ações Necessárias:**
- Ajustar `salesContext` para usar `"trial_conversion"` em vez de `"acquisition"`
- Implementar função `getContextualContent()` para mensagens dinâmicas

---

## 5. Slider de Franquias

### ✅ Status: **IMPLEMENTADO**

**Novo Componente:**
- ✅ `FranchiseSelection.tsx`: Slider inteligente com tiers fixos (25, 50, 90)
- ✅ Modo personalizado para quantidades acima de 90
- ✅ Cálculo de preço em tempo real
- ✅ Recomendação baseada em quantidade de passageiros

**Integração:**
- ✅ Componente criado e funcional
- ⚠️ Verificar se está sendo usado no `ProfissionalPlanContent.tsx`

---

## 6. Bloqueio Read-Only (Pós-Trial e Pós-Assinatura)

### ✅ Status: **IMPLEMENTADO**

**Backend:**
- ✅ Serviço `access-control.service.ts` criado
- ✅ Método `validateWriteAccess` implementado
- ✅ Integrado nos controllers de Escola, Passageiro e Veículo
- ✅ Lança exceção 403 quando trial ou assinatura expirados

**Frontend:**
- ✅ `GlobalExpiryBanner.tsx`: Banner para modo read-only
- ✅ Hooks de permissões (`usePermissions.ts`) implementados

**Observações:**
- ✅ Período de graça: 30 dias para trial, 90 dias para assinatura (conforme proposto)
- ⚠️ Verificar se todos os controllers de escrita estão protegidos

---

## 7. Pricing Simplificado (Preços Fixos por Tier)

### ⚠️ Status: **NÃO IMPLEMENTADO**

**Proposta:**
- Usar preços fixos dos tiers (R$ 107, R$ 147, R$ 227)
- Não calcular preço proporcional

**Código Atual:**
- ⚠️ Verificar se o `pricing.service.ts` ainda calcula preço proporcional
- **Ação Necessária:** Ajustar lógica de cálculo de preço

---

## 8. Desconto de Lançamento (Early Adopter)

### ⚠️ Status: **NÃO IMPLEMENTADO**

**Proposta:**
- Preço original: R$ 69,90
- Preço promocional: R$ 49,90 para os primeiros 100 clientes

**Código Atual:**
- ⚠️ Seed tem promoções ativas, mas com valores de teste (R$ 0,01)
- **Ação Necessária:** Implementar lógica de desconto por quantidade de clientes ou por período

---

## 9. Exclusão de Dados Após X Dias

### ✅ Status: **NÃO SERÁ IMPLEMENTADO**

**Decisão do Usuário:**
- Não haverá exclusão automática de dados
- Usuário pode voltar a qualquer momento

---

## Resumo de Divergências Identificadas:

| Item | Status | Ação Necessária |
| :--- | :--- | :--- |
| **Landing Page** | ⚠️ Divergente | Remover coluna "Gratuito" |
| **PlanUpgradeDialog** | ⚠️ Incompleto | Implementar mensagens contextuais |
| **Pricing Simplificado** | ⚠️ Não implementado | Ajustar cálculo de preço |
| **Desconto de Lançamento** | ⚠️ Não implementado | Definir e implementar estratégia |
| **Preços Promocionais** | ⚠️ Valores de teste | Definir valores reais |

---

## Próximos Passos:

1. Ajustar Landing Page
2. Implementar mensagens contextuais no `PlanUpgradeDialog`
3. Verificar e ajustar lógica de pricing
4. Definir estratégia de desconto de lançamento
5. Atualizar preços promocionais na seed
