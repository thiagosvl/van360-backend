# Relatório de Diagnóstico: Validação PIX e Arquitetura de Cobrança Van360

Este documento detalha a investigação técnica sobre a falha na validação de chaves PIX (fluxo de R$ 0,01) e propõe melhorias na arquitetura de assinaturas e repasses.

## 1. Diagnóstico da Falha de Validação (R$ 0,01)

A falha no fluxo de validação ocorre devido a uma **inconsistência no tratamento do tipo de destinatário** na integração com a API do Banco Inter (v4).

### Causa Raiz
No arquivo `inter.service.ts`, a função `realizarPagamentoPix` (utilizada pelo `validacao-pix.service.ts`) está configurada para enviar pagamentos PIX, mas a API do Inter exige a especificação explícita do `tipoDestinatario` (CPF ou CNPJ) ao realizar uma transferência para uma chave que não seja aleatória ou e-mail, ou em cenários onde a validação de titularidade é estrita.

**Evidências encontradas:**
*   O serviço `validacao-pix.service.ts` inicia o pagamento de R$ 0,01 chamando `interService.realizarPagamentoPix`.
*   A função `realizarPagamentoPix` no backend não está passando o campo `tipoDestinatario` no payload da requisição POST para `/pix/v2/pagamento`.
*   Isso causa um erro de validação na API do Inter quando a chave é um CPF ou CNPJ, impedindo a conclusão do micro-pagamento e, consequentemente, a validação da chave do motorista.

### Impacto
*   Motoristas não conseguem validar suas chaves PIX.
*   Sem chave validada, o sistema de repasse automático (`payoutWorker`) aborta as transferências, acumulando saldo pendente na plataforma.

---

## 2. Análise da Arquitetura de Cobrança e Taxas

A estrutura atual de assinaturas e taxas de intermediação foi analisada nos serviços `assinatura-pagamento.service.ts` e `cobranca-pagamento.service.ts`.

### Estrutura de Taxas
Atualmente, a taxa de intermediação é lida da tabela `configuracao_interna` através da chave `TAXA_INTERMEDIACAO_PIX`.
*   **Valor padrão:** R$ 0,99.
*   **Aplicação:** Deduzida do valor bruto pago pelo passageiro antes de enviar o repasse ao motorista.

### Tabela de Assinaturas
A tabela `assinaturas_usuarios` gerencia o estado do plano do motorista:
*   **Status:** `ativa`, `trial`, `suspensa`, `pendente_pagamento`, `cancelada`.
*   **Lógica de Upgrade:** O `subscription-upgrade.service.ts` calcula o valor pro-rata se houver uma assinatura ativa com vigência definida.

---

## 3. Plano de Ação e Correções Propostas

### Fase 1: Correção Imediata (Bug Fix)
1.  **Ajustar `inter.service.ts`**: Modificar o método `realizarPagamentoPix` para incluir o `tipoDestinatario` no payload.
2.  **Aprimorar `validacao-pix.service.ts`**: Garantir que o `tipo_chave_pix` seja passado corretamente para o serviço do Inter.

### Fase 2: Melhorias na Arquitetura de Cobrança
1.  **Histórico de Taxas**: Adicionar uma coluna `taxa_aplicada` na tabela `transacoes_repasse` para auditar exatamente quanto foi cobrado em cada transação, evitando dependência apenas da configuração global que pode mudar ao longo do tempo.
2.  **Validação de Saldo**: Implementar uma verificação prévia de saldo na conta do Inter antes de tentar o repasse no `payoutWorker`.
3.  **Notificação de Falha de Repasse**: Criar um gatilho para o `DRIVER_EVENT_REPASSE_FAILED` quando o PIX de R$ 0,01 ou o repasse principal falhar por motivos bancários (ex: limite excedido).

### Fase 3: Documentação e Deploy
1.  Atualizar a documentação da API no repositório.
2.  Submeter as correções via Pull Request para o repositório `thiagosvl/van360-backend`.

---
**Status da Análise:** Concluída.
**Próximo Passo:** Implementação das correções de código conforme detalhado na Fase 1.
