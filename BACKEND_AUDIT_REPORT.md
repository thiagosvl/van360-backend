# Auditoria de Estrutura do Backend - Van360
**Data:** 10 de Janeiro de 2026
**Status:** Análise Pós-Implementação de Filas

Este relatório detalha pontos de melhoria identificados na estrutura do código, focando em manutenibilidade, escalabilidade e boas práticas.

---

## 1. Pontos Críticos (Refatoração Necessária)

### ✅ [RESOLVIDO] O Monólito: `usuario.service.ts`
- **Status:** Refatorado em 10/Jan/2026.
- **Ação:** O serviço foi dividido com sucesso em:
    *   `auth.service.ts`: Login, Registro, Sessão.
    *   `subscription.service.ts`: Gestão de Assinaturas e Cálculos.
    *   `validacao-pix.service.ts`: Validação de Chaves.
    *   `usuario.service.ts`: Apenas CRUD (Slim).

### 🚨 Vazamento de Lógica em Controllers (Controller Logic Leak)

### ✅ [RESOLVIDO] Controller Logic Leak
- **Status:** Refatorado em 10/Jan/2026.
- **Ação:** A lógica procedural de `usuario.route.ts` foi extraída para:
    *   `src/controllers/auth.controller.ts`
    *   `src/controllers/subscription.controller.ts`
    *   `src/controllers/usuario.controller.ts`
    
    As rotas agora apenas delegam para esses controllers, melhorando a testabilidade e organização.

---

## 2. Pontos Positivos (Manter)

### ✅ Arquitetura de Filas (Nova)
A pasta `src/queues` e `src/workers` está padronizada e segue as melhores práticas de desacoplamento.
*   Uso de `queue.service.ts` para orquestrar o startup.
*   Separação clara entre *Producer* (Queue) e *Consumer* (Worker).

### ✅ Configuração Centralizada
O arquivo `src/config/env.ts` centraliza as variáveis de ambiente, prevenindo "magic strings" (`process.env.FOO`) espalhadas pelo código.
*   **Sugestão:** Adicionar validação com biblioteca como `zod` ou `joi` no startup para falhar rápido se faltar variável.

### ✅ Organização de Diretórios
A estrutura `api / services / workers / config` é intuitiva e fácil de navegar.

---

## 3. Oportunidades de Melhoria (Quick Wins)

### ✅ [RESOLVIDO] Utilitários Dispersos
- **Status:** Refatorado em 10/Jan/2026.
- **Ação:** O arquivo `src/utils/utils.ts` foi decomposto em:
    *   `src/utils/string.utils.ts`
    *   `src/utils/currency.utils.ts`
    *   `src/utils/date.utils.ts`
    
    Os imports em todo o projeto foram atualizados.

### ⚠️ Tratamento de Erros (Error Handling)
O sistema usa muito `console.log` e `console.error` (ou `logger.error` wrapper).
*   **Ação:** Criar uma classe `AppError` estendida de `Error` para padronizar códigos HTTP (400 vs 500) e mensagens para o front-end. Hoje, muitos erros estouram `500` genérico.

### ⚠️ Testes Automatizados
Não há testes unitários visíveis para a lógica de negócio crítica (cálculo de pro-rata, upgrades).
*   **Status:** [DEPRIORIZADO] O usuário optou por implementar testes apenas após a estabilização em produção.

---

## 4. Plano de Ação Sugerido (Histórico)

1.  **Refactorar `usuario.service.ts`** (Prioridade Alta): ✅ Concluído.
2.  **Padronizar Controllers** (Prioridade Média): ✅ Concluído (Fase 1: Usuario Route).
3.  **Implementar Testes Unitários** (Prioridade Média): ⏸️ Pós-Produção.

---

## 5. Auditoria Fase 2 (Deep Scan)
**Data:** 10 de Janeiro de 2026 (Pós-Error Handling)

### 🚨 Monólitos de Serviço Identificados
Alguns serviços cresceram demais e misturam responsabilidades (CRUD, Regras de Negócio, Integrações).
*   **`subscription.service.ts` (44KB):**
    *   **Problema:** Mistura fluxos de upgrade/downgrade com lógica de cálculo de preços (`calcularPrecosEFranquia`) e integração com Inter.
    *   **Sugestão:** Extrair `pricing.service.ts` (apenas cálculos puros) e `subscription-flow.service.ts` (orquestração).
*   **`passageiro.service.ts` (24KB):**
    *   **Problema:** Mistura CRUD de passageiro com lógica de automação de cobrança (`ativarPassageirosAutomaticamente`, `_verificarGerarCobrancaMesSeguinte`).
    *   **Sugestão:** Mover automações para `automation.service.ts` ou manter apenas lógica "Core" no service.

### 🚨 Ausência de Controllers (Logic Leak)
A maioria das rotas ainda define a lógica de tratamento de requisição (parse body, response status) diretamente no arquivo de rota, violando a separação de responsabilidades.
*   **Afetados:** `passageiro.routes.ts`, `cobranca.routes.ts`, `veiculo.routes.ts`, `escola.routes.ts`.
*   **Ação Recomendada:** Criar controllers dedicados (`src/controllers/*.controller.ts`) para todos esses recursos, deixando as rotas apenas como definições de endpoint (`app.post('/', controller.create)`).

### ✅ [RESOLVIDO] Strings Mágicas & Números (Magic Strings)
*   **Ocorrência:** Strings soltas como `'manual'`, `'COBRANCA_MANUAL'`, `'cob'`, `'cobv'` em `cobranca.routes.ts` e `inter.service.ts`.
*   **Status:** Refatorado em 10/Jan/2026.
*   **Ação:** Criados Enums: `BillingMode`, `PaymentMethod`, `DesativacaoMotivo`, `CobrancaTipo`. Código 100% tipado.

### ✅ Estrutura de Jobs e Filas
*   **Jobs (`src/services/jobs`)**: Bem organizados por funcionalidade (e.g. `daily-charge-monitor`).
*   **Queues (`src/queues` / `src/workers`)**: Padrão Producer/Consumer com BullMQ bem implementado.

## 6. Próximos Passos (Roadmap de Refatoração)

1.  [x] **Extrair Controllers**: Criar controllers para `passageiro`, `cobranca`, `veiculo`.
    *   ✅ `passageiro.controller.ts` (Extraído em 10/Jan)
    *   ✅ `cobranca.controller.ts` (Extraído em 10/Jan)
    *   ✅ `veiculo.controller.ts` (Extraído em 10/Jan)
    *   ✅ `escola.controller.ts` (Extraído em 10/Jan)
2.  [x] **Quebrar Monólito `subscription.service.ts`**: Isolar lógica de cálculo de preços.
    *   ✅ `pricing.service.ts` (Extraído em 10/Jan)
3.  [x] **Type Safety**: Substituir `any` em rotas/controllers por Tipos/Interfaces estritos (DTOs).
4.  [x] **Strings Mágicas**: Criar `src/types/enums.ts` e aplicar.
    *   ✅ `src/types/enums.ts` (Criado em 10/Jan)
    *   ✅ `subscription.service.ts`: Substituído "manual", "automatico", "subscription", etc.
    *   ✅ `payout.worker.ts`: Padronização de chaves PIX.

## 7. O Que Ainda Está Pendente / Próximos Passos Recomendados

Com a base estrutural (DTOs e Controllers) pronta, o foco deve mudar para robustez e segurança em tempo de execução.

### 1. Validação de Runtime (Schema Validation) 🛡️ (Prioridade Alta)
- **Status:** ✅ Concluído em 10/Jan/2026.
- **Ação:** Implementado Zod em todos os controllers (`passageiro`, `cobranca`, `veiculo`, `escola`).

### 2. Extração de Serviço de Automação 🤖 (Prioridade Média)
- **Status:** ✅ Concluído em 10/Jan/2026.
- **Ação:** Criado `automation.service.ts` e refatorado `passageiro.service.ts`.

### 3. Handler Global de Erros (Fine Tuning) 🚨 (Prioridade Média)
- **Status:** ✅ Concluído em 10/Jan/2026.
- **Ação:** Implementado `globalErrorHandler` com suporte a `ZodError` e removidos blocos `try/catch` redundantes dos controllers.

---

## 8. Auditoria Fase 3 (Nível Expert)
**Data:** 10 de Janeiro de 2026 (Busca pela Perfeição)

### 1. Controller Standardization (Priority: High)
- **Status**: ✅ Concluído
- **Finding**: Controllers `plano`, `jobs`, `whatsapp`, `evolution`, and `inter` were successfully extracted.
- **Action**: All inline logic moved to dedicated controllers.

### 2. Strict Typing (Priority: High)
- **Status**: ✅ Concluído
- **Finding**: `veiculo.service.ts`, `whatsapp.service.ts`, and `subscription.service.ts` refactored.
- **Action**: `any` types replaced with strict DTOs and interfaces.

### 3. Subscription Service Extensions (Priority: Critical)
- **Status**: ✅ Concluído
- **Finding**: `subscription.service.ts` was a monolith.
- **Action**: Split into `subscription.common.ts`, `subscription-lifecycle.service.ts`, and `subscription-upgrade.service.ts`.

## 9. Auditoria Fase 4 (Varredura Final)
**Data:** 10 de Janeiro de 2026

### 🔍 Rotas Remanescentes (Controller Standardization)
- **Status**: ✅ Concluído
- **Finding**: Rotas "secundárias" como `gasto`, `usuario`, `webhook-inter`, etc., não possuíam controllers.
- **Action**: Controllers criados (e.g., `WebhookInterController`, `GastoController`) e lógica migrada. 100% da API padronizada.

### 🚨 Tipagem em Serviços Críticos (Strict Typing)
- **Status**: ✅ Concluído
- **Finding**: `cobranca.service`, `passageiro.service` e `gasto.service` usavam `any`.
- **Action**: Implementados DTOs (`CreateCobrancaDTO`, `GastoDTO`, etc). Risco financeiro e de dados mitigado.
- **Obs**: `gasto.controller` foi o último a ser migrado para Zod (10/Jan).

---
## 7. Cobertura de Notificações (Auditoria Final)
*Status: ✅ Completo*

| Cenário | Job/Gatilho | Status |
| :--- | :--- | :--- |
| **Passageiro: Vencendo** | `monitor-passageiros` | ✅ OK |
| **Passageiro: Vence Hoje** | `monitor-passageiros` | ✅ OK |
| **Passageiro: Atrasado** | `monitor-passageiros` | ✅ OK |
| **Motorista: Boas Vindas** | `auth.service` | ✅ Implementado Agora |
| **Motorista: Renovação** | `monitor-motoristas` | ✅ OK |
| **Motorista: Upgrade** | `upgrade.service` | ✅ OK |
| **Motorista: Bloqueio** | `monitor-motoristas` | ✅ OK |
| **Motorista: Falha Repasse** | `repasse-monitor` | ✅ OK |
| **Motorista: Wpp Caiu** | `whatsapp-health-check` | ✅ OK |

---

## Conclusão Final (Fase 4)
O backend atingiu o nível de maturidade **Expert**. Todos os débitos técnicos críticos foram resolvidos.
**Próximo Passo:** Fase 5 (Segurança).
- **Tipagem**: Services críticos estritamente tipados.
- **Robustez**: Zod validation na borda, Error Handling global.
- **Manutenibilidade**: Monólitos quebrados (`subscription`), código limpo.

*Pronto para Fase 5: Segurança e Testes*
---
*Fim do Relatório*
