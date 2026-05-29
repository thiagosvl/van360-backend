# Guia de Testes de Assinaturas (SaaS) - Efí Pay

Este documento descreve como realizar testes de ponta a ponta nas assinaturas do Van360 utilizando o gateway Efí Pay em ambiente de **Homologação**.

## 1. Configuração do Ambiente
Para que os testes funcionem, o backend deve estar configurado com as credenciais de **Homologação** da Efí Pay:
- `EFI_CLIENT_ID` e `EFI_CLIENT_SECRET` (obtidos no painel Efí > Aplicações > Homologação).
- `EFI_SANDBOX=true` deve estar configurado nas variáveis de ambiente.
- **Certificado:** Um certificado `.p12` de homologação deve estar presente e referenciado no código (usualmente em `src/certs/`).

---

## 2. Testando Pagamentos via Pix

No ambiente de homologação da Efí, o comportamento do Pix é simulado com base no **valor da cobrança**.

### Cenário: Aprovação Automática (Sucesso)
- **Como testar:** Realize um checkout selecionando Pix e garanta que o valor total esteja entre **R$ 0,01 e R$ 10,00**.
- **Resultado esperado:** 
  1. O sistema gera a fatura e o QR Code.
  2. A Efí simula o pagamento automaticamente em poucos segundos.
  3. O webhook do Van360 (`/api/webhooks/efi`) recebe a confirmação.
  4. A assinatura é ativada/renovada automaticamente.
  5. Verifique na tabela `assinatura_faturas` se o status mudou para `PAID`.

### Cenário: Pagamento Pendente
- **Como testar:** Gere um Pix com valor **superior a R$ 10,00**.
- **Resultado esperado:** 
  1. A cobrança ficará com status `ATIVO` indefinidamente no ambiente de homologação.
  2. Isso permite testar a interface de "Aguardando Pagamento" e cenários de expiração.

---

## 3. Testando Pagamentos via Cartão de Crédito

Os testes de cartão dependem do **último dígito** do número do cartão utilizado.

### Cartões de Teste Sugeridos (Visa)
Use números que comecem com `4485...` ou use geradores de cartão de teste que terminem com estes dígitos.

| Final do Cartão | Cenário Simulado | Resultado no Van360 |
| :--- | :--- | :--- |
| **0, 4, 5, 6, 7, 8, 9** | **Sucesso (Aprovado)** | Fatura `PAID` / Assinatura `ACTIVE` |
| **1** | **Erro: Dados Inválidos** | Fatura `FAILED` |
| **2** | **Erro: Segurança/Risco** | Fatura `FAILED` |
| **3** | **Erro Temporário (Try Again)** | Fatura `FAILED` |

### Fluxo de Teste:
1. Vá para a tela de Assinaturas no frontend.
2. Escolha um plano (Mensal ou Anual).
3. Insira um cartão com final **7** para sucesso.
4. Insira um cartão com final **2** para testar a tratativa de erro na UI.

---

## 4. Testando Periodicidade (Mensal vs Anual)

### Mensal
- Ao confirmar o pagamento, verifique se a coluna `data_vencimento` na tabela `assinaturas` foi estendida em **1 mês**.

### Anual
- Ao confirmar o pagamento, verifique se a coluna `data_vencimento` na tabela `assinaturas` foi estendida em **1 ano**.

---

## 5. Validação Técnica (Checklist)

Para garantir que o teste foi concluído com sucesso no backend:
1. **Logs:** Verifique os logs do servidor procurando por `[WebhookController] Confirmando pagamento de assinatura SaaS`.
2. **Banco de Dados (Supabase):**
   - Tabela `assinatura_faturas`: Coluna `status` deve ser `PAID`.
   - Tabela `assinaturas`: 
     - `status` deve ser `ACTIVE`.
     - `trial_ends_at` deve ser `NULL` (se era a primeira vez após trial).
     - `data_vencimento` deve estar no futuro.

---

## 6. Cenários [EM ABERTO]

Os seguintes cenários não possuem automação direta pela API de Homologação da Efí e exigem intervenção manual ou são dependentes de tempo:

1. **Simulação de Renovação Automática (Task Cron):**
   - A Efí não possui um "acelerador de tempo" para disparar a cobrança do próximo mês.
   - **[EM ABERTO]**: Como testar a virada de mês automaticamente? *Sugestão:* Altere a `data_vencimento` para o passado e execute o `subscriptionMonitor` manualmente.

2. **Cenário de Estorno (Refund):**
   - **[EM ABERTO]**: Nenhuma instrução clara na documentação de credenciais/homologação sobre como simular um recebimento de estorno no webhook (`PAYMENT_REFUNDED`).

3. **Webhook Localhost:**
   - Para receber webhooks da Efí no seu computador de desenvolvimento, você DEVE utilizar um túnel (ex: Ngrok). Sem um IP público, a Efí não conseguirá notificar seu backend local.
