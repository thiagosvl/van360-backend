# Simulação de 60 Dias: Ciclo de Vida do Motorista e Cobranças
## Parâmetros do Cenário
- **Motorista**: João Vanzeiro
- **Início**: Dia 0 (01/01/2026)
- **Plano Inicial**: Essencial (Trial 7 dias)
- **Migração**: Dia 3 -> Upgrade para Profissional (Até 50 Cobranças)
- **Status Pagamento (Mês 1)**: Pago (Upgrade)
- **Status Pagamento (Mês 2 - Renovação)**: NÃO PAGO (Inadimplente)
- **Regra de Suspensão**: Atual (D+7 após vencimento)
- **Passageiros**:
    1. **Alice** (Vencimento dia 05) - R$ 350,00
    2. **Bruno** (Vencimento dia 10) - R$ 400,00
    3. **Carla** (Vencimento dia 20) - R$ 300,00

---

## Linha do Tempo Detalhada

### DIA 0 (01/01) - Cadastro "Essencial"
- **Ação Usuário**: João baixa o app e cria conta. Escolhe plano "Essencial" (Trial Grátis).
- **Sistema**:
    - Cria `usuarios` (Motorista, Ativo=True).
    - Cria `assinaturas_usuarios` (Plano Essencial, Status=TRIAL, `trial_end_at`=08/01, `vigencia_fim`=08/01).
    - **Notificação (Motorista)**: `DRIVER_EVENT_WELCOME_TRIAL`
        - *"Bem-vindo ao Van360! Você tem 7 dias grátis para testar..."*
- **Ação Usuário**: Cadastra 3 passageiros (Alice, Bruno, Carla).
- **Banco de Dados**: `passageiros` criados.


### DIA 3 (04/01) - O Upgrade "Profissional"
- **Ação Usuário**: João decide que quer automação. Vai em "Planos" e assina "Profissional (Até 50)".
- **Sistema**:
    - `SubscriptionService.upgradePlano` é chamado.
    - O Trial é encerrado imediatamente.
    - Nova `assinaturas_cobrancas` gerada (BillingType='upgrade', Valor=R$ 147,00, Vencimento=Hoje/D+1).
    - Status da assinatura vira `PENDENTE_PAGAMENTO` até compensar (ou se ele pagar na hora).
    - **Notificação (Motorista)**: `DRIVER_EVENT_ACTIVATION` ("PIX Gerado")
- **Ação Usuário**: João paga o PIX de R$ 147,00.
- **Sistema (Webhook Pagamento)**:
    - Pagamento confirmado.
    - `assinaturas_usuarios` atualizada: Status `ATIVA`, `anchor_date`: 04/01, `vigencia_fim`: 04/02.
    - **Notificação (Motorista)**: `DRIVER_EVENT_PAYMENT_CONFIRMED` ("Assinatura Ativa")
- **Ação Usuário**: Ativa "Cobrança Automática" para os 3 passageiros.
- **Sistema (AutomationService)**:
    - Ativa flag `enviar_cobranca_automatica`.
    - **Catch-up (Mês Atual)**: Detecta que passageiros não tem cobrança de Jan/2026.
    - **Ação**: Gera cobranças para o mês atual (Jan) para Alice, Bruno e Carla.
    - **PIX Retroativo**: Gera PIX para essas cobranças novas e quaisquer outras antigas pendentes.
    - **Notificação (Motorista)**: `DRIVER_EVENT_REACTIVATION_EMBARGO` ("Ambiente em preparação por 24h")

### DIA 4 (05/01) - Vencimento Alice (Manhã)
- **Sistema (Job `daily-charge-monitor`)**:
    - Encontra cobrança de Alice (Venc 05/01).
    - Status Motorista: `ATIVA`.
    - **Notificação (Passageiro)**: `PASSENGER_EVENT_DUE_TODAY`

### DIA 5 a 7 (06/01 a 08/01) - Alice em Atraso
- **Sistema**: Encontra cobrança de Alice vencida.
- **Notificação (Passageiro)**: `PASSENGER_EVENT_OVERDUE`

### DIA 7 (07/01) - Aviso Prévio Bruno
- **Sistema**: Encontra cobrança de Bruno (Venc 10/01).
- **Notificação (Passageiro)**: `PASSENGER_EVENT_DUE_SOON`

### DIA 10 (10/01) - Vencimento Bruno
- **Sistema**: Encontra cobrança de Bruno.
- **Notificação (Passageiro)**: `PASSENGER_EVENT_DUE_TODAY`

### DIA 20 (21/01) - Preparação do Próximo Mês (Fevereiro)
- **Contexto**: O sistema roda rotina de geração de mensalidades (dia 21 na simulação).
- **Sistema**: Gera cobranças para **Fevereiro** (Mês 2) para Alice, Bruno e Carla.

### DIA 29 (30/01) - Aviso de Renovação da Assinatura
- **Sistema**: Gera renovação da assinatura (R$ 147,00, Vencimento 04/02).

### DIA 34 (04/02) - Vencimento da Assinatura (Mês 2)
- **Ação Usuário**: João **NÃO PAGA** a renovação.
- **Sistema**: Status muda para `PENDENTE_PAGAMENTO`.
- **Notificação (Motorista)**: `DRIVER_EVENT_SUBSCRIPTION_DUE` ("Vence Hoje")

### DIA 35 (05/02) - O BLOQUEIO (Suspensão D+1)
- **Motorista**: Atraso D+1.
- **Sistema (Job `daily-subscription-monitor`)**:
    - Regra: `dataBloqueio = dataVencimento + 1 dia`. (04/02 + 1 = 05/02).
    - Ação: **SUSPENDER ASSINATURA**.
    - Atualiza `assinaturas_usuarios`: Status = `SUSPENSA`, `ativo` = `false`.
    - **Notificação (Motorista)**: `DRIVER_EVENT_ACCESS_SUSPENDED` ("Conta Suspensa")
- **Passageiro (Alice - Venc 05/02)**:
    - Cobrança existe e tem PIX válido (gerado dia 21/01).
    - O disparo da notificação de cobrança (WhatsApp) é **ABORTADO** (Motorista Suspenso).
    - *Nota*: Se a mãe da Alice tentar pagar o PIX gerado antes, o pagamento entra normalmente.

### DIA 40 (10/02) - Vencimento Bruno com Motorista Suspenso
- **Passageiro (Bruno)**:
    - Cobrança existe. Notificação abortada.
    - Bruno não recebe mensagem.

### DIA 60 (02/03) - Cenário Final (Suspensão Mantida)
- **Motorista**:
    - Status: Suspensa há ~25 dias.
    - Dívida: R$ 147,00 (Fev).
- **Passageiros**:
    - Fev: Cobranças existiram, PIX eram válidos, mas pais não receberam o lembrete.
    - Março: **NÃO GERADAS** (Job mensal pula motoristas suspensos).

### RESUMO DAS REGRAS IMPLEMENTADAS
1.  **Upgrade**: Corrige falhas anteriores gerando cobranças e PIX retroativos automaticamente.
2.  **Suspensão D+1**: Venceu, não pagou -> Bloqueia no dia seguinte.
3.  **PIX Passageiro**: Continua válido no banco, permitindo pagamento espontâneo, mas o sistema para de enviar lembretes (economiza custo para motorista inadimplente).
