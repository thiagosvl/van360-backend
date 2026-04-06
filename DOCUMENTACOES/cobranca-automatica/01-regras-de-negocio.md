# 💰 Regras de Negócio: Cobrança Automática (Van360)

Este documento detalha o funcionamento do módulo de cobrança automática entre Motoristas e Passageiros via Gateway de Pagamento.

---

## 1. Visão Geral
O sistema automatiza o recebimento das mensalidades via PIX dinâmico com regras de vencimento (`COBV`), permitindo o cálculo automático de encargos pelo Banco Central e a divisão (Split) imediata entre motorista e plataforma.

## 2. Independência Operacional SaaS

O motor de cobrança automática é **independente** do status da assinatura SaaS do motorista. Isso garante que a Van360 continue processando taxas e o motorista continue recebendo de seus passageiros, mesmo em caso de inadimplência do plano principal.

### Tabela de Comportamento por Status SaaS

| Status SaaS | Painel do Motorista | Cobrança Automática (Add-on) | Motivação |
| :--- | :--- | :--- | :--- |
| **ACTIVE** | Liberado (Full) | Operação Normal | Fluxo padrão. |
| **TRIAL** | Liberado (Full) | Operação Normal | Degustação do sistema. |
| **PAST_DUE** (1–3 dias) | **Readonly** | **Operação Normal** | Grace period (3 dias) — o motor não para. |
| **EXPIRED** | **Bloqueado** | **Operação Normal** | Garante receita da Van360 e fluxo do motorista, mas força regularização para gerir o negócio. |
| **CANCELED** | Bloqueado | Desativado (Stop) | Encerramento da relação comercial. |

---

## 3. Fluxo de Cobrança em Dois Níveis

Para garantir eficiência e evitar custos desnecessários com QR Codes não utilizados, o sistema opera em dois estágios:

1.  **Nível 1 (Registro Interno)**: No dia da geração (ex: todo dia 25), o sistema cria o registro na tabela `cobrancas_passageiros` com `status = pendente` e `gateway_id = null`.
2.  **Nível 2 (Cobrança Ativa)**: No momento do envio da notificação (Job 2), se o registro não possuir um `gateway_id`, o sistema solicita o QR Code ao provedor (Woovi) e atualiza o registro.

---

## 4. Taxas e Parametrização (Split Agnóstico)
No momento do **Onboarding**, as taxas são configuradas para garantir a sustentabilidade da plataforma:

| Componente | Armazenamento | Descrição |
| :--- | :--- | :--- |
| **Taxa de Serviço Total** | `usuarios.config_faturamento` (Per Motorista) | Valor bruto cobrado do motorista (ex: R$ 3,90). |
| **Custo Pix In** | `configuracoes_sistema` (Global) | Taxa do gateway para recebimento (ex: R$ 0,85). |
| **Custo Pix Out** | `configuracoes_sistema` (Global) | Taxa do gateway para saque/repasse (ex: R$ 1,00). |

> [!NOTE]
> **Modelo de Split (Lucro Fixo)**: A Van360 recebe um **Valor Fixo** (ex: R$ 2,05 de lucro líquido) definido no momento do split. O motorista recebe todo o **saldo remanescente** (Surplus), o que garante que 100% de eventuais juros e multas pagos pelo passageiro sejam entregues integralmente ao motorista. Veja mais em [05-split-e-repasses.md](./05-split-e-repasses.md).

### 🔄 Mudança de Valores
*   **Imutabilidade**: Uma cobrança PIX já gerada no banco e enviada ao passageiro é **imutável**.
*   **Primeira Cobrança (Ajuste Manual)**: Ao gerar a primeira cobrança de um passageiro, o sistema sugere o `valor_mensalidade` do cadastro. O motorista pode editar este valor livremente para ajustes (sem cálculo automático).
*   **Regeneração de PIX**: Caso um passageiro acesse o link de pagamento e o Pix ativo esteja expirado (validade de 30 dias), o sistema **regenera automaticamente** um novo código mantendo o estado da dívida.

---

## 5. Repasse de Taxas de Serviço (Pass-Through)
O Van360 permite que o motorista decida quem arcará com os custos da plataforma. Essa configuração é feita individualmente para cada passageiro através da flag `repassar_taxa_servico`.

*   **Cenário A: Taxa Repassada ao Pai (`repassar_taxa_servico: true`)**:
    *   **Valor da Cobrança**: `Mensalidade (Original) + Taxa de Serviço (Motorista)`.
    *   **Impacto**: O motorista recebe o valor integral da sua mensalidade após o split.
*   **Cenário B: Taxa Assumida pelo Motorista (`repassar_taxa_servico: false`)**:
    *   **Valor da Cobrança**: `Mensalidade (Original)`.
    *   **Impacto**: O custo da plataforma é descontado do valor recebido pelo motorista no momento do split.
*   **Independência de Encargos**: Multas e juros por atraso são **sempre** revertidos 100% para o motorista, independentemente da escolha de repasse da taxa de serviço.

---

## 6. Penalidades Financeiras (Multa e Juros)
Utilizamos a lógica do **Gateway** para gerenciar encargos sem necessidade de recalcular valores diariamente no banco de dados.

*   **Configuração**: O sistema envia os parâmetros `fines` (multa) e `interests` (juros) na criação da cobrança.
*   **Cálculo no Pagamento**: Quando o pai escaneia o QR Code após o vencimento, o próprio Banco Central calcula o montante final (Valor + Multa + Juros Pro-rata).
*   **Obrigatoriedade**: Para esta funcionalidade, o sistema utiliza o **CPF** e **Endereço Completo** do passageiro (Responsável), que já são obrigatórios e validados no cadastro.

---

## 7. Ciclo de Vida e Resiliência (Pix Out)
*   **Validação de Chave Pix**: Validada via interface do Gateway contra o DICT (Bacen) no onboarding.
*   **Falha no Repasse (Pix Out)**: Se a chave do motorista estiver inválida no momento do pagamento do passageiro:
    1.  O status da transação vai para `REPASSE_FALHA`.
    2.  O motorista é notificado para atualizar seus dados.
    3.  **Reprocessamento Automático**: Após a atualização para uma chave válida, o sistema tenta o repasse de todas as cobranças travadas.
*   **Pagamento Externo (Dinheiro)**: O motorista registra o recebimento manual.
    1.  **Tentativa de Cancelamento**: O sistema tenta enviar o comando de cancelamento ao gateway por "boa prática", mas não bloqueia a ação em caso de erro de rede.
    2.  **Soberania do Ledger**: A auditoria do `ledger_faturamento` é a verdade absoluta. Se o passageiro pagar o Pix mesmo após a baixa manual, o sistema registra o evento como um pagamento duplicado no histórico para tratamento manual do motorista.
    3.  **Visual**: Uma vez recebido manualmente, a interface do passageiro (via link) deixa de exibir o QR Code ativo.

---

## 8. Estratégia de Gateways e Adapters (Agnóstico)
O sistema utiliza o padrão **Strategy** para garantir que a inteligência de cobrança resida no Van360, e não no provedor.

*   **Diferenciação de Recursos (Feature Leveling)**:
    *   **Provedores "Smart" (Ex: Woovi)**: Utilizam recursos nativos de multa e juros. O código Pix é único e se auto-atualiza no banco do pagador.
    *   **Provedores "Dumb" (Ex: Asaas)**: Caso o provedor não suporte juros nativos, o **Adapter** do Van360 realiza o "Trabalho Sujo":
        1.  Cancela o Pix antigo no provedor.
        2.  Gera um novo Pix com o valor atualizado (Principal + Encargos).
        3.  Notifica o passageiro sobre a atualização.
*   **Imutabilidade de Dívida**: Para o Van360, a cobrança é uma só. Os diferentes IDs externos gerados (em caso de re-emissão) são tratados no `billing_external_metadata` como instâncias de pagamento da mesma dívida.

---

## 9. Arquitetura de Webhooks e Notificações (Conciliação)
Para garantir a integridade, o processamento de eventos segue um padrão descentralizado e resiliente:

1.  **Endpoints Especializados**:
    *   `/webhooks/saas/efi`: Processamento exclusivo de assinaturas Van360.
    *   `/webhooks/billing/woovi`: Processamento de cobranças de passageiros.
2.  **Idempotência**: Cada evento recebido é verificado contra o `ledger_faturamento`. Se o ID da transação externa já foi processado, o evento é ignorado.
3.  **Fluxo de Notificações (Responsabilidade do Core)**:
    *   Sempre que um **novo Pix** for gerado, o sistema dispara notificações multicanal (E-mail, WhatsApp e/ou SMS) conforme configurado.
    *   Sempre que um **Pix anterior for cancelado**, o sistema notifica a invalidade do código antigo.
4.  **Autocura e Sincronização**:
    *   **Botão de Check**: Interface do motorista permite forçar `Manual Sync`.
    *   **Jobs (Cron)**: Tarefas periódicas de **Reconciliação** que consultam o Gateway para verificar pagamentos cujos webhooks falharam, garantindo auto-cura do sistema.
5.  **Observabilidade**: 
    *   Monitoramento via **Sentry** e **Better Stack** para falhas de gateway e webhooks.

---

## 10. Abstração e Extensibilidade (Plug-and-Play)
O sistema é projetado para ser **Gateway-Agnostic**, o que significa que o Van360 não é "refém" de nenhum provedor específico.

*   **Interface Única (`IBillingProvider`)**: Todas as ações financeiras (gerar Pix, registrar cartão, processar webhook) passam por uma casca técnica comum.
*   **Troca de Provedor (Ex: Efipay -> C6)**:
    1.  **Pix**: A troca é quase instantânea. Basta implementar o novo `Adapter` do C6 e o motor de recorrência do Van360 passará a solicitar QR Codes para o novo banco sem alterar uma linha de lógica de negócio.
    2.  **Cartão**: Exige uma transição controlada (pois os cartões salvos no Efipay não são migráveis automaticamente). O sistema suporta coexistência de múltiplos adapters durante períodos de transição.
*   **Independência de Recorrência**: O Van360 não utiliza as assinaturas nativas dos bancos (que travam o usuário ao gateway). Nós controlamos o agendamento, o que garante 100% de mobilidade para o negócio.

---

---



---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06 (Revisão Repasse)
