# 🚀 Regras de Negócio: Assinaturas SaaS (Van360)

Este documento define a estratégia comercial e técnica para fidelização e recorrência dos motoristas na plataforma.

---

## 1. Estratégia de Gateway (MVP)
Para o lançamento, simplificaremos a operação utilizando um único provedor para todos os métodos.

*   **Provedor Único**: **Efí Bank** para Cartão de Crédito e Pix.
*   **Cartão de Crédito**: Utiliza tokenização para renovação automática. Em Sandbox, o resultado da transação é definido pelo **último dígito** do cartão (Ex: final 4 a 0 aprovam; final 2 nega por segurança).
*   **Pix**: O Van360 é o motor de recorrência. Em Sandbox, a simulação de pagamento é automática para cobranças de **R$ 0,01 a R$ 10,00** (o status muda para CONCLUÍDA em segundos). Valores acima de R$ 10,00 permanecem como ATIVA. O Pix automático (recorrência nativa) está descartado.

---

## 2. Ciclo de Vida e Renovação
A saúde financeira e a operação do motorista são protegidas por regras de vencimento imutáveis.

*   **Ciclo de Cobrança (Modelo Netflix)**: A data de aniversário da assinatura é fixa pelo **primeiro pagamento realizado**. Pagamentos em atraso não alteram a data do próximo ciclo.
*   **Geração Antecipada**: A fatura/Pix de renovação é gerada com **N dias de antecedência** (ex: 5 dias), conforme definido na tabela de configurações (`SAAS_DIAS_VENCIMENTO`).
*   **Renovação Automática (Cartão)**: Para motoristas com cartão de crédito salvo, o Job de monitoramento tenta realizar a cobrança automática (`OneStepCharge`) na data de aniversário da assinatura. 
    - **Sucesso**: A assinatura é renovada imediatamente.
    - **Falha**: Se a cobrança falhar (cartão recusado, expirado, etc.), o sistema **NÃO bloqueia o acesso imediatamente**. Em vez disso, envia uma notificação inteligente ao motorista sugerindo a troca do cartão ou o pagamento via Pix para evitar o bloqueio após o período de carência.
*   **Renovação Manual (Pix)**: Caso o motorista não utilize cartão ou a cobrança automática falhe, o sistema gera um QR Code Pix e o envia via notificação.
*   **Gestão de Cartões**: O motorista pode gerenciar seus cartões na interface de "Assinatura". O sistema utiliza a bandeira e os últimos 4 dígitos para identificação, mantendo o `payment_token` para futuras cobranças.
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
