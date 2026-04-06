# 💻 Interface e Fluxo do Usuário (Motorista)

Este documento descreve as mudanças na interface do usuário (Frontend) para o módulo de configuração de contratos.

---

## 1. Janela de Configuração (`ContractSetupDialog.tsx`)

O diálogo de configuração será refatorado para suportar as novas regras relacionais e penalidades independentes.

### Estrutura de Passos (Wizard)
1.  **Ativação**: Toggle mestre `usar_contratos`.
2.  **Multa por Atraso**: Configuração de flag, valor e tipo (fixo/percentual).
3.  **Juros de Mora**: Configuração de flag, valor e tipo diários.
4.  **Cláusulas**: Listagem editável com suporte a reordenação e exclusão.
5.  **Preview Fiel**: Visualização em PDF real antes da publicação final.

### ✨ Melhorias de UX
- **Labels Dinâmicas**: Exibição clara de "Valor (R$)" ou "Taxa (%)" conforme o tipo selecionado.
- **Simulação em Tempo Real**: Novo card de simulação que calcula o valor total devido após 10 dias de atraso (Total = Parcela + Multa_Fina + 10x Juros_Diarios).
- **Mobile First**: Ajuste de espaçamento e tipografia para telas de 320px, garantindo que os cards de simulação não quebrem o layout.

---

## 2. Visualizador de PDF (Preview)

A visualização de texto plano será substituída por um componente de renderização de PDF para garantir paridade visual entre motoristas e responsáveis legais.

### Funcionamento do Preview
1.  **Solicitação**: O motorista altera uma configuração ou uma cláusula.
2.  **Botão "Atualizar Preview"**: Dispara uma requisição ao endpoint de geração de PDF do Backend.
3.  **Exibição**: O PDF retornado é renderizado no Dialog usando `react-pdf` ou um visualizador nativo via URL temporária do Storage (recomendado para maior estabilidade mobile).
4.  **Validação**: O motorista confirma se as multas e juros estão descritos corretamente nas cláusulas geradas.

---

## 3. Estados e Hooks

- **Hook `useContratos`**: Refatorado para lidar com o novo formato de dados (`configuracoes_contratos`).
- **Estado Local (Formulário)**: Uso de `react-hook-form` com `Zod` para validar se valores existem quando a flag de ativação (multa/juros) estiver ligada.

---

> [!TIP]
> **Dica**: Utilize o componente `LayoutContext` para disparar os diálogos de configuração em vez de instanciá-los localmente nos componentes.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
