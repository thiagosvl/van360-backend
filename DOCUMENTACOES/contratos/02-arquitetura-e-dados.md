# 🏗️ Arquitetura e Modelo de Dados: Sistema de Contratos (Van360)

Este documento detalha o modelo relacional e os detalhes técnicos para a implementação da refatoração do sistema de contratos.

---

## 1. Modelo de Dados (PostgreSQL)

Configurações e cláusulas serão isoladas da tabela de usuários.

### `configuracoes_motoristas`
Tabela central para parametrização do negócio do motorista.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `uuid` | Chave primária. |
| `usuario_id` | `uuid` | Referência ao motorista (UNIQUE). |
| `taxa_servico_van360` | `numeric` | Valor que o motorista paga à plataforma por cobrança. |
| `faturamento_repasse_padrao` | `boolean` | Define se, por padrão, a taxa é repassada ao passageiro. |
| `faturamento_habilitado_padrao` | `boolean` | Define se, por padrão, novos passageiros têm cobrança automática. |
| `multa_padrao_valor` | `numeric` | Sugestão base para novos passageiros. |
| `juros_padrao_valor` | `numeric` | Sugestão base para novos passageiros. |
| `usar_contratos` | `boolean` | Habilita o módulo de contratos na interface. |

### `passageiros` (Campos Financeiros e de Controle)
Configurações específicas que regem a inteligência de cobrança e contratos para este indivíduo.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `faturamento_habilitado` | `boolean` | Se FALSE, este passageiro nunca receberá cobranças automáticas. |
| `faturamento_repasse_taxa` | `boolean` | Se TRUE, o valor da `taxa_servico_van360` do motorista é somado à mensalidade. |
| `multa_valor` | `numeric` | Valor da multa por atraso. |
| `juros_valor` | `numeric` | Taxa de juros por atraso. |
| `multa_rescisao` | `numeric` | Valor informativo para o contrato. |
| `isento_encargos` | `boolean` | Se TRUE, ignora multa e juros (mesmo se atrasar). |

### `clausulas_contratos_personalizadas`
Tabela para armazenamento de cláusulas individuais (1:N com `usuarios`).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `uuid` | Chave primária. |
| `usuario_id` | `uuid` | Referência direta ao motorista (vincular ao contrato do usuário). |
| `ordem` | `integer` | Ordem de exibição no PDF (1 a 19). |
| `texto` | `text` | Conteúdo da cláusula (Editável pelo motorista). |
| `ativa` | `boolean` | Flag de exibição (Permite "remover" sem deletar). |

### `assinaturas_contratos` (Log de Aceite)
Tabela para registro das assinaturas digitais dos responsáveis.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `uuid` | Chave primária. |
| `passageiro_id` | `uuid` | Referência ao passageiro/vínculo. |
| `data_assinatura` | `timestamp` | Momento exato do aceite. |
| `ip_assinatura` | `varchar` | IP do responsável. |
| `user_agent` | `text` | Dispositivo utilizado. |
| `assinatura_svg` | `text` | Representação visual do desenho manual. |

---

## 2. Lógica de Persistência (Snapshots)
O sistema diferencia cláusulas **Modelo** (Código) de cláusulas **Efetivas** (Banco).

*   **Cláusulas Modelo**: Mantidas no backend como constantes. Estas são as 19 cláusulas padrão sugeridas.
*   **Primeiro Salve (Snapshot)**: Quando o motorista configura seus termos pela primeira vez, o sistema copia as cláusulas modelo para a tabela `clausulas_contratos_personalizadas` vinculadas a ele.
*   **Fonte da Verdade**: Uma vez persistidas, o sistema ignora as constantes e usa apenas os registros do banco para este motorista.
*   **Edição**: O motorista pode editar o texto, desativar ou reordenar as cláusulas. Mudanças afetam apenas novos contratos; os antigos são preservados em seus respectivos arquivos PDF gerados.

---

## 3. Geração de PDF e Placeholders
O motor do contrato realiza a substituição dinâmica de termos técnicos no momento da geração do documento.

### Placeholders Suportados:
*   `[[VALOR_MENSAL]]`: Valor bruto da mensalidade do passageiro.
*   `[[DIA_VENCIMENTO]]`: Dia fixo pactuado.
*   `[[MULTA_ATRASO]]`: Valor fixo (R$) ou percentual (%) de multa.
*   `[[JUROS_DIARIOS]]`: Valor fixo (R$) ou percentual (%) de juros.
*   `[[NOME_PASSAGEIRO]]`: Nome completo do beneficiário.

### Fluxo de Geração:
1.  **Cálculo**: O core recupera os dados do `passageiro` e as cláusulas do `motorista`.
2.  **Substituição**: Realiza o `replaceAll` nos placeholders dentro do campo `texto`.
3.  **Renderização**: Concatena as cláusulas ativas por `ordem` e gera o documento final (HTML -> PDF).

---

## 4. Assinatura Digital e Validade
A formalização do contrato é feita via link único enviado ao responsável.

*   **Registro de Evidências**: No momento do aceite, o sistema armazena:
    - **IP** do originador.
    - **Data/Hora** (UTC).
    - **User Agent** (Navegador/Dispositivo).
    - **Assinatura Visual**: Captura do desenho manual (dedo/mouse) convertido em imagem/SVG embutida no PDF.
*   **Imutabilidade**: Uma vez assinado, o sistema gera o **Arquivo PDF Final**. Este documento é a prova jurídica final e contém o texto aceito na época. O sistema não armazena o texto redundante no banco, apenas as evidências da assinatura e o arquivo gerado.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-03
> **Schema de Referência**: Ver `supabase/migrations/` para detalhes de tipos e constraints.
