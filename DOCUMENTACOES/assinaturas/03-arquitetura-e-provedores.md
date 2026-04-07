# 🔌 Arquitetura e Provedores: Assinaturas SaaS (Van360)

O coração técnico do sistema SaaS deve ser **Provider-Agnostic** (Independente de Provedor), permitindo que possamos plugar ou desativar gateways de pagamento conforme taxas e benefícios mudam.

---

## 1. Estratégia de Abstração
Utilizamos o padrão **Provider Pattern** para garantir que a lógica de negócio do Van360 não conheça os detalhes do gateway (Efí Bank, Asaas, C6, etc.).

### 📂 Estrutura de Pastas
- `src/services/payments/payment.provider.ts`: Interface base (Contrato).
- `src/services/payments/providers/efipay.provider.ts`: Implementação real.
- `src/services/subscriptions/subscription.service.ts`: Lógica de negócio que chama o provider ativo.

---

## 2. Fluxo Efí Bank (Gateway Inicial)
O Efí Bank será o provedor padrão para PIX e Cartão de Crédito, utilizando APIs distintas para cada método.

### 💳 Cartão de Crédito (API Cobranças)
- **Tipo**: Pagamento avulso (One-Step Charge) com **Token Reutilizável**.
- **Recorrência**: O Van360 gerencia o calendário (Regra de Aniversário). No vencimento, o Job dispara uma nova cobrança usando o `payment_token` salvo (`reuse: true`).
- **Segurança**: Dados sensíveis nunca tocam o backend; tokenização 100% via SDK da Efí no Frontend.
- **Webhook**: O sistema usa o **Notification Token** enviado pela Efí para conciliação.

### 💨 Pix (Motor Interno)
- **Tipo**: Cobrança imediata via QR Code Dinâmico geretado sob demanda pelo Van360.
- **Segurança (mTLS)**: Obrigatório o uso de certificado digital (.p12/.pem) para requisições e recepção de Webhooks de Pix.
- **Funcionamento**: O Van360 identifica o vencimento, solicita um novo QR Code ao gateway e notifica o motorista. O gateway não gerencia a recorrência do Pix; o Van360 é o motor.

---

## 3. Gestão de Webhooks
Os webhooks são a fonte da verdade para o status da transação. Centralizamos o recebimento em um único endpoint que redireciona conforme o tipo de payload (Pix vs Cartão).

| Provedor | Endpoint | Segurança / Protocolo |
| :--- | :--- | :--- |
| **Efí Bank (Pix)** | `/api/webhooks/efi` | **mTLS (Mutual TLS)** + Certificado |
| **Efí Bank (Cartão)** | `/api/webhooks/efi` | **Notification Token** (OneStepCharge) |

### 🛠️ Processamento
1. **Pix**: O corpo contém o `txid` e o `valor`. O sistema valida o certificado e chama `subscriptionService.activateByFatura()`.
2. **Cartão**: O corpo contém apenas um `notification` (token). O sistema faz uma requisição `GET` para a Efí usando esse token para obter os detalhes da transação (`charge_id`, `status`, `custom_id`) e processa a ativação se o status for `paid`.

---

## 4. CronWorker: Auditoria Diária
Um Job agendado (Cron) roda diariamente para:
- Mudar motoristas de `TRIAL` para `EXPIRED` (Exatamente 15 dias cravados).
- Mudar motoristas de `ACTIVE` para `PAST_DUE` (Assinatura vencida hoje).
- Mudar motoristas de `PAST_DUE` para `EXPIRED` (Atrasado há mais de 3 dias corridos).
- **Renovação Automática**: Gera cobrança antecipada (5 dias) no cartão salvo ou emite um novo Pix.

---

## 5. Fluxo de Recorrência (Cartão vs Pix)
- **Cartão**: Ao renovar, o sistema tenta cobrar no `payment_token` salvo. Se for `declined`, o sistema notifica o motorista sugerindo o pagamento via Pix.
- **Pix**: O sistema gera um QR Code e envia via WhatsApp/SMS. Caso não seja pago até o fim da carência (3 dias), bloqueia o acesso.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
