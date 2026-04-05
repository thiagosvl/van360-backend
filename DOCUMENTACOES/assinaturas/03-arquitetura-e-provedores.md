# 🔌 Arquitetura e Provedores: Assinaturas SaaS (Van360)

O coração técnico do sistema SaaS deve ser **Provider-Agnostic** (Independente de Provedor), permitindo que possamos plugar ou desativar gateways de pagamento conforme taxas e benefícios mudam.

---

## 1. Estratégia de Abstração
Utilizamos o padrão **Provider Pattern** para garantir que a lógica de negócio do Van360 não conheça os detalhes do gateway (Efipay, Asaas, C6, etc.).

### 📂 Estrutura de Pastas
- `src/services/payments/payment.provider.ts`: Interface base (Contrato).
- `src/services/payments/providers/efipay.provider.ts`: Implementação real.
- `src/services/subscriptions/subscription.service.ts`: Lógica de negócio que chama o provider ativo.

---

## 2. Fluxo Efipay (Gateway Inicial)
O Efipay será o provedor padrão para PIX e Cartão de Crédito, utilizando APIs distintas para cada método.

### 💳 Cartão de Crédito (API Cobranças)
- **Tipo**: Assinatura recorrente via **API de Assinaturas**.
- **Webhook**: O sistema aguarda o callback simples enviado pela Efipay para confirmar a renovação.
- **Segurança**: Validação via IP de origem e chave secreta no payload.

### 💨 Pix (Motor Interno)
- **Tipo**: Cobrança imediata via QR Code Dinâmico geretado sob demanda pelo Van360.
- **Segurança (mTLS)**: Obrigatório o uso de certificado digital (.p12/.pem) para requisições e recepção de Webhooks de Pix.
- **Funcionamento**: O Van360 identifica o vencimento, solicita um novo QR Code ao gateway e notifica o motorista. O gateway não gerencia a recorrência do Pix; o Van360 é o motor.

---

## 3. Gestão de Webhooks
Os webhooks são a fonte da verdade para o status da transação.

| Provedor | Endpoint | Segurança / Protocolo |
| :--- | :--- | :--- |
| **Efipay (Cartão)** | `/api/v1/webhooks/efi/card` | Secret Key + IP |
| **Efipay (Pix)** | `/api/v1/webhooks/efi/pix` | **mTLS (Mutual TLS)** + Certificado |

### 🛠️ Processamento
1. O Webhook recebe o evento.
2. Identifica o `usuario_id` no banco via `provider_txid`.
3. Chama `subscriptionService.processPayment()`.
4. Atualiza a assinatura e dispara bônus de indicação se houver.

---

## 4. CronWorker: Auditoria Diária
Um Job agendado (Cron) roda diariamente para:
- Mudar motoristas de `TRIAL` para `EXPIRED` (Exatamente 15 dias cravados).
- Mudar motoristas de `ACTIVE` para `PAST_DUE` (Assinatura vencida hoje).
- Mudar motoristas de `PAST_DUE` para `EXPIRED` (Atrasado há mais de 72h/3 dias).

---

## 5. Job de Renovação de Pix (SaaS)
Para garantir que o motorista tenha o QR Code disponível antes do vencimento, o sistema utiliza um job focado em emissão e manutenção:

*   **Geração Antecipada**: O job consulta a `data_vencimento` e gera um novo QR Code Pix com **N dias de antecedência** (configurável em `configuracoes_sistema`).
*   **Validade do QR**: Todo Pix de assinatura gerado deve ter **vencimento mínimo de 1 mês** no gateway. O sistema armazena essa data em `qr_expires_at`.
*   **Regra de Unicidade (Single Active Pix)**: 
    - O sistema mantém apenas **um Pix de assinatura pendente** por usuário. 
    - Ao gerar um novo Pix (por upgrade de plano ou regeneração de expiração), o sistema deve **cancelar explicitamente** o Pix anterior no gateway para evitar pagamentos duplicados ou de valores incorretos.
*   **Auto-Regeneração**: Se o motorista tentar acessar um Pix cuja `qr_expires_at` já passou, o sistema regenera um novo QR Code automaticamente, invalidando o anterior.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-03
