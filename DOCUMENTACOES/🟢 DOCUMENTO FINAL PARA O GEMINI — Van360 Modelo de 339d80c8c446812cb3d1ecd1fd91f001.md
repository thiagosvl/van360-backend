# 🟢 DOCUMENTO FINAL PARA O GEMINI — Van360 Modelo de Negócio

> ⚠️ Este é o documento definitivo para o Gemini. Substitui todos os arquivos de ajuste anteriores. Copie e cole integralmente.
> 

> **Última atualização:** abril de 2026
> 

---

# CONTEXTO DA SESSÃO

Após longa sessão de definição de modelo de negócio, o nó lógico da **inadimplência cruzada** foi resolvido. A documentação atual tem conceitos que não existem mais. Este documento instrui o que mudar.

O sistema ainda não tem código implementado para assinaturas/planos. O foco é atualizar as documentações.

---

# PARTE 1 — DECISÃO CENTRAL

**O motor de cobrança automática é operacionalmente independente do status do SaaS.**

O sistema nunca para de processar cobranças por causa do status da assinatura SaaS do condutor. A única exceção é o Job 1 (gerar mensalidades do mês seguinte), que não roda para condutores `EXPIRED`.

**Por que:** Se o condutor tem 35 passageiros no add-on e não paga o SaaS de R$39,90, bloquear o motor = Van360 perde R$71,75/mês de receita + 35 pais sem cobrança + condutor culpa a Van360. Não bloquear = Van360 recebe R$2,05 por passageiro. O painel bloqueado é a pressão natural para regularizar.

**Condutor SEM add-on que não paga o SaaS:** trava total faz sentido. Sem add-on = sem receita de transação = regras normais de inadimplência.

> **Remoção de dados:** NÃO é feita automaticamente em nenhuma circunstância. O sistema nunca apaga dados automaticamente. Qualquer remoção é ação manual ou futura decisão de produto.
> 

---

# PARTE 2 — O QUE DELETAR

## No documento de Cobrança Automática

**Deletar a Seção 2 inteira — "Dependência SaaS (Fila de Inadimplência)"**

Substituir por:

> O módulo de cobrança automática é operacionalmente independente do status da assinatura SaaS. Ver regras de comportamento por cenário na seção de FSM.
> 

**Deletar o estado `WAIT_DRIVER_SaaS` da FSM e todas as transições associadas**

**Deletar qualquer referência a:**

- "agenda remoção de dados em 7 dias"
- "presume abandono"
- Exclusão automática por inatividade
- `prazo_retencao` e `margem_tolerancia` das configurações administrativas
- Subseção "Análise de Resiliência — Fila de Retenção SaaS"
- Linha `EXPIRED +60 dias sem liquidação` das tabelas

**Substituir o diagrama Mermaid do cron:**

Atual (deletar):

```
A[Data de Geração Chegou] --> B{Motorista Ativo no SaaS?}
B -- Sim --> C[Gerar Cobrança no Gateway]
B -- Não --> D[Status: WAIT_DRIVER_SaaS]
```

Novo (adicionar):

```
A[Data de Geração Chegou] --> B{Passageiro com faturamento habilitado?}
B -- Sim --> C{Vencimento em N dias e gateway_id nulo?}
C -- Sim --> D[Gerar COBV na Woovi]
C -- Não --> E[Ignorar — próximo ciclo]
B -- Não --> E
```

---

# PARTE 3 — O QUE ADICIONAR

## No documento de Cobrança Automática — após Visão Geral

### Regras de comportamento por cenário

| Status SaaS | Add-on ativo? | Painel | Motor | Observação |
| --- | --- | --- | --- | --- |
| `TRIAL` | Pode ativar | Acesso total | Ativo | Trial 15 dias completo |
| `ACTIVE` | Sim/Não | Acesso total | Ativo | Estado normal |
| `PAST_DUE` (1–3 dias) | **Sim** | Readonly | **Ativo** | Grace period — motor não para |
| `PAST_DUE` (1–3 dias) | **Não** | Readonly | N/A | Grace period |
| `EXPIRED` | **Sim** | Bloqueado | **Ativo** | Motor continua até COBVs existentes expirarem no gateway (30 dias). Nenhuma ação automática. |
| `EXPIRED` | **Não** | Bloqueado | N/A | Sem receita = trava faz sentido |

### Dois caminhos para EXPIRED

**Trial não assinou:** dia 15 → `TRIAL → EXPIRED` direto (sem PAST_DUE). Nunca pagou, sem grace period.

**Assinante não renovou:** vencimento → `ACTIVE → PAST_DUE` → 3 dias grace period → `PAST_DUE → EXPIRED`.

`EXPIRED` é o **mesmo enum** nos dois casos. Comportamento idêntico. Para distinguir (ex: notificação diferente), usar presença de `provider_subscription_id` na tabela `assinaturas`.

### Pressão natural para regularizar

Mesmo com motor ativo, condutor `EXPIRED` sente pressão: não consegue adicionar passageiros, gerar contratos, ver relatórios. Recebe notificações no app.

## No documento de Assinaturas SaaS

Após descrição do estado `EXPIRED`, adicionar:

> **Regra especial — condutor com add-on ativo:** `EXPIRED` bloqueia o painel mas não interrompe o motor. O condutor e a Van360 continuam recebendo. O bloqueio do painel é a alavanca de pressão.
> 

---

# PARTE 4 — ARQUITETURA DE DOIS NÍVEIS (novo)

**Nível 1 — Mensalidade (registro interno):** tabela `cobrancas`. Status `pendente`, `gateway_id = null`. Sem Pix, sem gateway. **Existe para todos os condutores** — gestão manual também. A diferença é que `faturamento_habilitado = false` impede os Jobs 2 e 3 de agir.

**Nível 2 — Cobrança ativa (QR Code):** criada apenas no envio da primeira notificação. Van360 chama Woovi, gera COBV, armazena `pix_copia_cola` em `billing_external_metadata`.

## Três jobs

### Job 1 — Geração de mensalidades (batch dia 25)

- Roda dia 25, uma vez por mês
- **Para TODOS os condutores `ACTIVE` ou `PAST_DUE`** — com ou sem add-on
- Para cada passageiro com `faturamento_habilitado = true`
- Insere em `cobrancas`: `status = pendente`, `gateway_id = null`, `vencimento = dia X do mês seguinte`
- **Zero chamadas externas. Zero Pix. Zero Woovi.**
- Para condutores que assinam/renovam entre dia 26 e fim do mês: job pontual com mesma lógica

### Job 2 — Envio / geração do Pix (cron diário)

- Busca `cobrancas` com `status = pendente` + `vencimento - N dias == hoje` + `gateway_id = null`
- **Não verifica status do SaaS**
- Gera COBV na Woovi, armazena `pix_copia_cola`, atualiza `gateway_id`
- Envia WhatsApp ao pai com QR Code — **mesmo com SaaS EXPIRED** (pai não tem culpa, Van360 recebe a taxa)

### Job 3 — Régua de inadimplência (cron diário)

- Busca `cobrancas` com `status = pendente` + `vencimento < hoje` + `gateway_id != null`
- Envia lembretes D+1, D+2, D+3
- COBV aplica multa/juros automaticamente via Banco Central
- **Roda mesmo com SaaS EXPIRED** — cobrança foi gerada, fluxo segue até o fim

## Impacto por status

| Job | ACTIVE | PAST_DUE | EXPIRED (add-on ativo) | EXPIRED (sem add-on) |
| --- | --- | --- | --- | --- |
| Job 1 (batch dia 25) | ✅ | ✅ | ❌ | ❌ |
| Job 2 (envio Pix) | ✅ | ✅ | ✅ | ❌ |
| Job 3 (régua) | ✅ | ✅ | ✅ | ❌ |

---

# PARTE 5 — JOB DE RECUPERAÇÃO (novo)

**Gatilho:** quando SaaS transita para `ACTIVE` (vindo de `PAST_DUE`, `EXPIRED` ou `TRIAL`).

**Lógica:** para cada passageiro com `faturamento_habilitado = true`:

| Situação | Ação |
| --- | --- |
| Já existe cobrança ativa | Ignorar |
| Vencimento não chegou | Cria com data original |
| Vencimento foi hoje | Cria com data hoje |
| Passou há 1–7 dias | Cria com data hoje (COBV aplica multa) |
| Passou há mais de 7 dias | Não cria — aguarda próximo ciclo |

Limite de 7 dias configurável via `configuracoes_sistema`. **Não é catch-up complexo** — não há fila, não há estados intermediários.

---

# PARTE 6 — TRIAL + ADD-ON

- Condutor **pode ativar o add-on durante o trial** com Pix real
- Trial expira sem assinar → Job 1 para; COBVs existentes continuam válidos 30 dias; Job 3 congela
- Ao assinar → Job de Recuperação dispara
- Sistema **nunca gera cobranças retroativas** automaticamente

---

# PARTE 7 — ATIVAÇÃO DO ADD-ON

Fluxo de contratação separado:

1. Aceite de termos
2. Cadastro e validação da chave Pix via DICT (Woovi valida nativamente — sem transação de teste)
3. Tela com todos passageiros pré-selecionados — condutor desmarca quem não entra
4. Por passageiro: condutor indica se absorve o custo (R$3,90) ou repassa ao pai

---

# PARTE 8 — CAMPO `faturamento_habilitado`

Campo booleano em `passageiros`. Duas camadas:

**Camada 1:** condutor tem add-on ativo? Se não, `false` para todos.

**Camada 2:** passageiro específico está marcado?

Definido: no fluxo de ativação do add-on, ao cadastrar passageiro novo (sistema pergunta), ou a qualquer momento no painel.

**Fluxo ao cadastrar passageiro novo:**

1. Sistema pergunta: "Deseja registrar a mensalidade deste mês?" (se vencimento futuro)
2. Se sim: cria registro em `cobrancas` com `status = pendente`
3. Se `faturamento_habilitado = true` e vencimento dentro da janela N dias → Job 2 gera COBV automaticamente

**Sistema nunca gera retroativo.** Datas passadas não são processadas.

---

# PARTE 9 — GATEWAYS

| Produto | Gateway | Notas |
| --- | --- | --- |
| Assinatura SaaS | **Efí Bank** | Pix (1,19%) + Cartão (3,49%) + trial sem cartão. Já aprovado. |
| Add-on de Cobrança Automática | **Woovi** | Split na liquidação, CPF aceito, 100% API, self-service, plano fixo |

**Custo add-on por passageiro:** R$0,85 (Pix In) + R$1,00 (Pix Out) = **R$1,85 fixo**

**Receita Van360:** R$3,90 — **Margem líquida: R$1,82 (47%)**

**Data de vencimento SaaS — modelo Netflix:** definida pelo primeiro pagamento real. Imutável para sempre. Pagamentos atrasados não movem a data.

> Asaas: avaliado anteriormente, não adotado. Pode ser reavaliado futuramente se Woovi apresentar problemas.
> 

---

# PARTE 10 — O QUE ESTÁ CONFIRMADO (não muda)

**No documento de Assinaturas SaaS:**

- FSM: `trial → active → past_due → expired` ✅
- Grace period 3 dias no `past_due` ✅
- Readonly durante `past_due` ✅
- `ledger_faturamento` como tabela de idempotência ✅
- Sistema de indicações (referral) — todas as regras ✅
- Conversão de trial: dias restantes somados ao período contratado ✅
- Upgrade mensal → anual: sem downgrade durante vigência ✅
- Provider Pattern / Zero Vendor Lock-in ✅
- CronWorker de auditoria diária ✅
- Job de renovação de Pix (SaaS) ✅

**No documento de Cobrança Automática:**

- COBV como formato de cobrança ✅
- Multa e juros via COBV — confirmado para MVP ✅
- Condutor configura multa/juros globalmente, com sobrescrita por passageiro ✅
- Vencimento configurável por passageiro ✅
- N dias de antecedência configurável (padrão 3 dias) ✅
- Strategy Pattern / IBillingProvider ✅
- Woovi como implementação padrão ✅
- `billing_external_metadata` para rastreabilidade ✅
- Self-healing de chave Pix inválida ✅
- "Recebi por fora" com cancelamento no gateway ✅
- Webhooks especializados ✅
- Split: Van360 recebe valor fixo, motorista recebe saldo remanescente ✅
- Surplus (juros/multas) vai ao motorista ✅
- Sentry + Better Stack ✅

---

# CHECKLIST FINAL

- [ ]  Deletar estado `WAIT_DRIVER_SaaS` da FSM
- [ ]  Deletar Seção 2 (Fila de Inadimplência) do doc de Cobrança Automática
- [ ]  Deletar lógica de auto-reativação com catch-up
- [ ]  Deletar `prazo_retencao` e `margem_tolerancia`
- [ ]  Deletar qualquer referência a exclusão automática de dados / "remoção em 7 dias"
- [ ]  Deletar linha `EXPIRED +60 dias` das tabelas de comportamento
- [ ]  Atualizar diagrama Mermaid do cron (remover branch de verificação de SaaS)
- [ ]  Adicionar tabela de comportamento por cenário (com dois caminhos para EXPIRED)
- [ ]  Adicionar regra especial no doc SaaS: `EXPIRED` com add-on ativo não bloqueia motor
- [ ]  Adicionar Arquitetura de Dois Níveis (Parte 4)
- [ ]  Adicionar Job de Recuperação (Parte 5)
- [ ]  Padronizar nomenclatura: `status = pendente` (não `agendada`)
- [ ]  Confirmar que Job 1 roda para todos os condutores `ACTIVE` ou `PAST_DUE` (com ou sem add-on)
- [ ]  Confirmar que Job 2 e Job 3 rodam mesmo com SaaS `EXPIRED` quando add-on ativo
- [ ]  Confirmar que Job 2 envia WhatsApp ao pai mesmo com SaaS EXPIRED
- [ ]  Adicionar campo `faturamento_habilitado` (Parte 8)
- [ ]  Substituir referências a Stark Bank por Woovi em todo o código/docs

[📋 Briefing para o Gemini — Atualização do Modelo de Negócio](https://www.notion.so/Briefing-para-o-Gemini-Atualiza-o-do-Modelo-de-Neg-cio-339d80c8c44681adb04cf6967eecbe3f?pvs=21)