# 📋 Backlog e Plano de Migração: Sistema de Contratos (Van360)

Este documento detalha o cronograma de implementação e a estratégia de transição para o novo modelo relacional.

---

## 1. Backlog de Implementação (Fases)

As tarefas foram priorizadas para minimizar riscos de quebra de funcionalidade.

### 🏁 Fase 1: Infraestrutura e Migração (Backend)
1.  **[ ] Migrations SQL**: Criar `configuracoes_contratos` e `clausulas_contratos` no Supabase.
2.  **[ ] Script de Migração**: Desenvolver e testar o script que move os dados do `JSONB` legatário para as novas tabelas.
3.  **[ ] Refatoração do Service**: Atualizar `ContractService` para interagir com o novo modelo relacional.
4.  **[ ] Endpoint de Preview**: Implementar a geração de PDF dinâmico (Blob/Buffer) a partir de dados temporários.

### 💻 Fase 2: Interface do Motorista (Frontend)
1.  **[ ] Refatoração do Dialog**: Criar a nova UI com inputs independentes de Multa e Juros.
2.  **[ ] PDF Preview**: Integrar o componente de visualização de PDF real dentro do modal de configuração.
3.  **[ ] Card de Simulação**: Implementar a lógica de cálculo (Mensalidade + Multa + n x Juros Diários).

### 🧹 Fase 3: Limpeza e Estabilidade
1.  **[ ] Remoção de Legado**: Apagar a coluna `usuarios.config_contrato` após validação total.
2.  **[ ] Testes de Regressão**: Verificar se contratos antigos (já assinados) permanecem acessíveis e inalterados.
3.  **[ ] Ajuste de Performance**: Cache das cláusulas do motorista no Backend, se necessário.

---

## 2. Estratégia de Migração de Dados

A migração seguirá os passos abaixo para garantir a segurança dos dados dos motoristas atuais.

### Passo 1: "Dry Run"
- Rodar o script de migração em ambiente de testes.
- Validar se o total de cláusulas no `JSONB` corresponde ao total de registros criados em `clausulas_contratos`.

### Passo 2: Execução em Produção
- Inserir dados nas novas tabelas sem deletar a coluna antiga.
- O sistema lerá preferencialmente das novas tabelas (`configuracoes_contratos`). Caso não encontre, fará o fallback para o `usuarios.config_contrato` ou sinalizará erro (conforme definido).

### Passo 3: Validação em Campo
- Verificar se os motoristas ativos visualizam suas cláusulas corretamente no novo Dialog.

---

## 3. Próximos Passos (Ação Imediata)

- **[ ] Rodar a Migration SQL**: Criar a estrutura física do banco.
- **[ ] Implementar o Script de Migração**: Criar a função SQL ou script TS para mover os dados.

---

> [!CAUTION]
> **Aviso**: Não remova a coluna `JSONB` até que o sistema esteja rodando estável por pelo menos 1 semana no novo modelo.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-03
