# 🔗 Mapeamento API e Interface (Cobrança Automática)

Este documento detalha a integração técnica entre o Frontend (React), Backend (Fastify) e o Gateway de Pagamento (atualmente com implementação de referência na Woovi/OpenPix).

---

## 1. Mapeamento de Payload (Woovi API)

Para habilitar multa e juros automáticos, o payload de criação da cobrança deve seguir a estrutura baseada nos termos do Gateway (Exemplo abaixo baseado na Woovi API):

| Campo Van360 | Campo Provedor (Ex: Woovi) | Regra de Transformação / Descrição |
| :--- | :--- | :--- |
| `valor_total` | `value` | Inteiro em centavos. |
| `cpf_cnpj` | `customer.taxID` | CPF ou CNPJ do pagador (limpo). |
| `nome_responsavel` | `customer.name` | Nome do pagador. |
| `multa_valor` | `fines.value` | Valor fixo da multa em centavos. |
| `juros_valor` | `interests.value` | Juros diários em BIPS (ex: 1% ao mês = 3,33 BIPS/dia aprox). |
| `vencimento` | `expiresDate` | Formato ISO (Ex: 2026-04-10T23:59:59Z). |

> [!IMPORTANT]
> **Padrão Adapter/Strategy**: O Backend do Van360 utiliza uma camada de abstração (Adapter). Os nomes de campos internos são mapeados para os campos específicos de cada gateway em tempo de execução. A Woovi é utilizada como a implementação padrão inicial.

---

## 2. Ações de Interface (Frontend)

### 🟢 Ativação de Passageiro (Onboarding de Cobrança)
Ao ativar o módulo para um passageiro:
1.  **Modal de Configuração**: Exibe o valor da mensalidade e campos financeiros (multa/juros) pré-preenchidos com os padrões do motorista.
2.  **Primeira Mensalidade (Pro-rata)**: Permite editar o valor apenas para a cobrança inicial.
3.  **Confirmação**: Gera a primeira cobrança e agenda as próximas.

### 🔴 Registro de Pagamento Manual ("Recebi por fora")
Opção na listagem de cobranças para quando o passageiro paga em mãos (espécie):
1.  **Registro**: O motorista informa que o pagamento foi realizado externamente.
2.  **PIX**: O sistema tenta cancelar o PIX no gateway para evitar pagamentos duplicados. Caso o cancelamento no gateway falhe (erro de API), o sistema registra o pagamento manual localmente mas o PIX pode permanecer ativo no Banco Central.
3.  **Conflito de Timing**: Se o passageiro pagar via PIX Dinâmico *após* o motorista ter dado baixa manual, o sistema processa o pagamento automático normalmente, sobrescrevendo os metadados da baixa manual (o status continua `PAGO`), mas garantindo o Split e a auditoria no Ledger. O motorista fica com o valor em mãos + o valor no banco (resolução interpessoal).
4.  **Flexibilidade**: Permite que motoristas sem o módulo de cobrança automática também registrem pagamentos manuais.

---

## 3. Webhooks Principais (Incoming)

| Evento Provedor (Ex: Woovi) | Ação Van360 |
| :--- | :--- |
| `CHARGE_COMPLETED` | Move cobrança para `PAGO`. Registra Ledger de Entrada. Dispara o Saque Automático (Pix Out). |
| `WITHDRAW_COMPLETED` | Move estado do repasse para `CONCLUIDO`. Registra Ledger de Saída com ID de transação real. |
| `TRANSFER_FAILED` | Move cobrança para `REPASSE_FALHA`. Notifica o motorista via App/Push para correção da chave PIX. |
| `WITHDRAW_FAILED` | Registra erro no log e move para `REPASSE_FALHA` para retentativa via Worker/Job. |

---

## 4. Análise de Resiliência (Corners Cases)

### Fila de Retenção SaaS
Se o motorista estiver bloqueado por inadimplência com o Van360, as cobranças ficam no estado `WAIT_DRIVER_SaaS`.
*   **Ação**: O sistema retém por um período limitado (**[EM DISCUSSÃO]**). Se não regularizado, ignora o motorista para novos ciclos.
*   **Auto-reativação**: Ao pagar o SaaS, o sistema processa automaticamente a fila de cobranças pendentes conforme a política de vencimento definida (**[EM DISCUSSÃO]**).

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-03
