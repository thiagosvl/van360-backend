# ⚖️ Regras de Negócio: Sistema de Contratos (Van360)

Este documento detalha as regras de negócio acordadas para a gestão de contratos e penalidades financeiras.

---

## 1. Penalidades Financeiras
As penalidades foram separadas em dois pilares independentes para garantir flexibilidade aos motoristas.

| Tipo | Descrição | Regra de Cálculo |
| :--- | :--- | :--- |
| **Multa por Atraso** | Penalidade única aplicada no primeiro dia de atraso. | Valor Fixo (R$) ou Percentual (%) sobre a parcela. |
| **Juros de Mora** | Penalidade acumulativa diária por atraso. | Calculado como Juros Simples sobre a parcela, usando base de 30 dias para conversão de taxas mensais. |
| **Multa de Rescisão** | Aplicada no encerramento antecipado do contrato. | Valor Fixo (R$) ou Percentual (%) sobre o valor total/restante. |

### 📅 Lógica de Juros
- **Base de Cálculo**: 30 dias.
- **Exemplo**: Se o juros mensal for 1%, o juros diário aplicado será de `1% / 30 = 0,033%` por dia.
- **Fórmula**: `Encargos_Totais = Parcela + Multa_Fina + (Parcela * (Taxa_Diaria / 100) * Dias_Atraso)`.

---

## 2. Imutabilidade e Ciclo de Vida
- **Contratos Gerados**: Uma vez que uma minuta ou contrato assinado é gerado, ele é persistido como um PDF estático no Storage. 
- **Preservação Histórica**: Alterações nas configurações globais do motorista (ex: mudar o valor da multa) **não retroagem** aos contratos já existentes.
- **Independência**: Cada contrato é imutável e independente. Não há alertas de divergência se o motorista mudar de ideia no futuro para novos clientes; o que foi assinado no PDF é a verdade definitiva para aquele vínculo.

---

## 3. Gestão de Cláusulas
- O motorista pode editar, ativar ou desativar cláusulas individualmente.
- A ordenação das cláusulas é respeitada na montagem final do PDF.
- **Mensalidade Proporcional (Pro-rata)**: *"Fica acordado que a primeira mensalidade do transporte escolar poderá ser cobrada de forma proporcional (pro-rata) aos dias de serviço efetivamente prestados no mês da contratação, servindo o valor registrado na primeira cobrança como quitação deste período inicial."*

---

## 4. Onboarding Simplificado (Fricção Seletiva)
Para reduzir a barreira de entrada e facilitar o trabalho do motorista escolar, o sistema adota as seguintes premissas:

### 📱 Cadastro de Passageiros
- **Flexibilidade**: Campos como Gênero e outros dados não-essenciais passam a ser **opcionais**. O motorista não deve ser impedido de cadastrar um aluno por falta de informações secundárias.
- **Modalidade de Transporte**: O termo correto é "Modalidade de Transporte" (Ex: Ida, Volta, Ida e Volta), e deve ser tratado como um dado variável no contrato.
- **Tratamento de Dados Vazios**: O gerador de PDF (Contrato) e a Carteirinha Escolar devem ser resilientes a campos não preenchidos, ocultando as informações correspondentes ou exibindo "Não Informado" de forma elegante, garantindo que o documento final mantenha o profissionalismo.
- **Link de Autocadastro**: O motorista terá a opção de enviar um link para o Responsável preencher os próprios dados (incluindo CPF e Endereço mandatórios para o faturamento), retirando o peso do preenchimento manual do motorista.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
