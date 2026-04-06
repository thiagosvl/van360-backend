# 🤝 Sistema de Indicação: Indique e Ganhe (Van360)

O sistema de indicação visa o crescimento viral da plataforma, recompensando tanto quem convida quanto quem é convidado.

---

## 1. Regras de Elegibilidade
A indicação é válida apenas para **conversão de novos pagadores**.

| Ator | Requisito de Elegibilidade |
| :--- | :--- |
| **Indicador** | Deve ter uma conta ativa (Trial ou Assinatura). |
| **Indicado** | Deve ser um usuário que **nunca teve assinatura paga** (mesmo que já tenha tido conta ou trial anteriormente). |

---

## 2. Recompensas e Benefícios (Parametrizáveis)
As recompensas são disparadas automaticamente pelo sistema após a confirmação do pagamento, seguindo os valores definidos na tabela de configurações administrativas.

### 🎁 Para o Indicado (Refere)
- **Benefício**: Desconto de **X%** (ajustável via Admin) na **primeira mensalidade** ou na anuidade inicial.
- **Momento**: Aplicado no checkout da primeira assinatura.

### 🏆 Para o Indicador (Referrer)
- **Recompensa**: **N dias gratuitos** (ex: +30 dias, ajustável via Admin).
- **Momento**: Creditado assim que o pagamento do indicado for **Confirmado**.
- **Caso Anual**: Se o indicador tiver plano anual, o sistema somará +30 dias ao vencimento atual da anuidade dele.

---

## 3. Fluxo de Atribuição (Referral Flow)
Para garantir simplicidade e robustez, o sistema utiliza links estáticos vinculados ao perfil do motorista.

1. **Link Permanente**: O motorista possui um link fixo de indicação baseado em um identificador único (ex: `van360.app/cadastro?ref=UUID`), que pode ser compartilhado infinitamente.
2. **Vínculo Direto**: Ao realizar o cadastro através do link, o `id_indicador` é associado imediatamente ao perfil do novo usuário no banco de dados.
3. **Ativação (Trigger)**: Os benefícios (Desconto e Dias Grátis) são processados automaticamente apenas quando o indicado realiza o **primeiro pagamento** da sua assinatura.
4. **Resgate de Convite (Fallback)**: Caso o usuário tenha se cadastrado via App Store ou fora do link, ele pode vincular um indicador manualmente.
    - **Identificação**: O usuário informa o **WhatsApp do indicador** na tela de Assinatura para validar o vínculo.
    - **Validação**: O sistema verifica se o WhatsApp pertence a um motorista cadastrado. 
        - Se **não existir**: Retorna erro ("Motorista não encontrado").
        - Se **existir**: Cria o vínculo de indicação imediatamente.
    - **Limite**: Permitido apenas um resgate (vínculo único).

---

## 4. Painel do Motorista (Auditoria)
Para transparência e engajamento, o motorista indicador terá acesso a um histórico de suas métricas de indicação:

*   **Total de Indicações**: Número total de usuários que se cadastraram usando seu link.
*   **Conversões**: Número de indicados que se tornaram assinantes pagantes.
*   **Bônus Acumulados**: Soma total de dias gratuitos recebidos através do programa.
*   **Log de Eventos (Privacidade)**: Histórico contendo a data, o status da indicação e o benefício gerado (ex: "Cadastro Realizado", "Assinatura Ativada", "Bônus +30 dias Creditado").
    - **Regra de Ouro**: Para proteger a privacidade (LGPD), o sistema **não expõe nome ou contato** do indicado para o indicador. O foco é exclusivamente no status do benefício.
*   **Snapshot de Recompensa**: No momento em que o indicado realiza o primeiro pagamento, o sistema "congela" (Snapshot) os valores de bônus e desconto vigentes naquele instante, protegendo o usuário de alterações futuras nas configurações globais.

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
