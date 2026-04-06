# 🚀 Regras de Negócio: Assinaturas SaaS (Van360)

Este documento define a estratégia comercial e técnica para fidelização e recorrência dos motoristas na plataforma.

---

## 1. Estratégia de Gateway (MVP)
Para o lançamento, simplificaremos a operação utilizando um único provedor para todos os métodos.

*   **Provedor Único**: **Efí Bank** para Cartão de Crédito e Pix.
*   **Cartão de Crédito**: Utiliza tokenização para renovação automática.
*   **Pix**: O Van360 é o motor de recorrência. No dia do vencimento, o sistema gera o QR Code via Efí Bank e notifica o motorista. O Pix automático (recorrência nativa) está descartado.

---

## 2. Ciclo de Vida e Renovação
A saúde financeira e a operação do motorista são protegidas por regras de vencimento imutáveis.

*   **Ciclo de Cobrança (Modelo Netflix)**: A data de aniversário da assinatura é fixa pelo **primeiro pagamento realizado**. Pagamentos em atraso não alteram a data do próximo ciclo.
*   **Geração Antecipada**: A fatura/Pix de renovação é gerada com **N dias de antecedência**, conforme definido na tabela de configurações administrativas do sistema.
*   **Falha na Cobrança (Cartão)**: O sistema **não faz fallback automático** para Pix. Em caso de falha, o motorista é notificado e deve agir manualmente.
*   **Período de Tolerância e Bloqueios**: 
    - **ACTIVE -> PAST_DUE**: O motorista atrasou a mensalidade, mas mantém acesso total por **3 dias de carência**.
    - **PAST_DUE -> EXPIRED**: Após os 3 dias de carência, a assinatura transita para `EXPIRED` e o acesso ao painel administrativo é **BLOQUEADO**.
    - **TRIAL -> EXPIRED**: Ao término dos 15 dias de Trial sem assinatura ativa, o status transita diretamente para `EXPIRED` e o acesso é **BLOQUEADO**.
    - **Independência do Add-on**: O motor de cobrança automática (Woovi) **CONTINUA ATIVO** mesmo em `EXPIRED`, processando mensalidades dos passageiros e garantindo as taxas da Van360 e o fluxo do motorista.
*   **Conversão de Trial**: Ao assinar durante o trial, os dias restantes são somados ao primeiro mês pago. Caso o trial esteja expirado, o período inicia na data do pagamento.

---

## 3. Gestão de Planos (Upgrade e Cancelamento)

### Upgrade (Mensal -> Anual)
- **Comunicação**: O app deve exibir explicitamente na tela de upgrade a data de início do plano anual e esclarecer que o valor total da anuidade será cobrado imediatamente.
- **Lógica**: O plano anual é agendado para iniciar após o término do período mensal vigente. O ciclo de 12 meses é somado ao tempo já pago.

### Inexistência de Downgrade (Anual -> Mensal)
- **Regra**: Não é permitida a migração de um plano anual para mensal durante a vigência da anuidade paga. Essa funcionalidade não faz parte do modelo de serviço.
- **Cancelamento**: O cancelamento interrompe apenas a renovação da anuidade seguinte, mantendo o acesso até o fim dos 12 meses pagos.

---

## 4. Reembolsos e Segurança
- **Reembolso**: Apenas em casos excepcionais (ex: arrependimento legal de 7 dias), processado manualmente via painel do gateway.
- **Idempotência**: Todas as confirmações de pagamento passam pelo `ledger_faturamento` para evitar duplicidade de tempo de acesso.

---

## 5. Flexibilidade de Gateway (Plug-and-Play)
O módulo SaaS segue a premissa de **Zero Vendor Lock-in**.

*   **Recorrência Interna**: O Van360 é o "dono" da data de renovação. O gateway é apenas um emissor de ordens de pagamento.
*   **Troca Simplificada**: Se o motorista optar por outro banco ou se o Van360 mudar de parceiro bancário, os QR Codes Pix gerados passarão a vir do novo gateway imediatamente através de novos `Adapters`.

---

## 6. Configurações Administrativas
Para garantir flexibilidade comercial, os seguintes parâmetros são definidos via interface administrativa e não são fixos no código:

*   **Dias de Antecedência (Renovação)**: Define com quantos dias de antecedência o Pix de renovação é gerado.
*   **Bônus de Indicação (Indicador)**: Quantidade de dias gratuitos creditados ao motorista que realiza a indicação.
*   **Desconto de Indicação (Indicado)**: Percentual de desconto aplicado na primeira fatura do novo motorista.

### ⚙️ Regras Dinâmicas de Indicação
- **Gatilho de Recompensa**: O bônus (indicador) e o desconto (indicado) são liberados apenas após a **confirmação do primeiro pagamento** do indicado.
- **Janela de Resgate**: O "Resgate de Convite" manual é permitido exclusivamente durante os 15 dias de **Trial**.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
