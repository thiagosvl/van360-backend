# Pesquisa e Recomendações sobre a Evolution API

Este documento resume a pesquisa realizada na documentação da Evolution API e em fontes externas para entender os principais parâmetros, tempos de expiração e melhores práticas para a integração com o Van360.

## 1. Versão da API

O `docker-compose.yml` do projeto utiliza a imagem `evoapicloud/evolution-api:latest`, o que significa que o sistema está rodando a versão mais recente da Evolution API. A documentação relevante é a da **v2**, que pode ser encontrada em [https://doc.evolution-api.com/v2/](https://doc.evolution-api.com/v2/).

## 2. Tempos de Expiração: QR Code e Pairing Code

*   **QR Code**: A documentação e a prática da comunidade indicam que o QR Code gerado pela Evolution API tem um tempo de vida de aproximadamente **60 segundos**. Após esse período, ele se torna inválido e é necessário solicitar um novo.
*   **Pairing Code**: O Pairing Code, que é a alternativa ao QR Code para conexão em dispositivos móveis, também tem um tempo de vida de aproximadamente **60 segundos**. O código de 8 dígitos deve ser inserido no aplicativo WhatsApp dentro desse intervalo.

**Implicação para o Van360**: O frontend precisa de um temporizador visual (countdown) para informar ao usuário o tempo restante para usar o código. Ao final do tempo, o sistema deve oferecer uma opção para gerar um novo código automaticamente.

## 3. Estados de Conexão

A Evolution API utiliza os seguintes estados principais para uma instância:

| Estado | Descrição |
| :--- | :--- |
| `open` / `connected` | A instância está conectada e funcionando corretamente. |
| `close` / `disconnected` | A instância está desconectada. |
| `connecting` | A instância está em processo de conexão. Pode ser após a leitura do QR Code ou durante uma tentativa de reconexão. |
| `NOT_FOUND` | A instância não existe no servidor da Evolution API. |
| `ERROR` | A instância encontrou um erro e não pode ser iniciada. |

**Implicação para o Van360**: O backend precisa mapear corretamente todos esses estados para o enum `WhatsappStatus` no banco de dados. O frontend deve interpretar esses estados para fornecer feedback claro ao usuário.

## 4. Webhooks: Configuração e Melhores Práticas

A documentação da Evolution API recomenda o uso de webhooks para receber atualizações de status em tempo real. As seguintes configurações são cruciais:

*   **`WEBHOOK_GLOBAL_ENABLED: true`**: Ativa o webhook global para todas as instâncias.
*   **`WEBHOOK_GLOBAL_URL: https://seu-backend.com/api/evolution/webhook`**: Define a URL para a qual a Evolution API enviará os eventos.
*   **`webhookByEvents: false`**: Quando definido como `false` na criação da instância ou no `setWebhook`, a Evolution API enviará todos os eventos para a URL principal, em vez de exigir uma URL por evento. Isso simplifica a configuração no Van360.
*   **Eventos Recomendados**: Para o caso de uso do Van360, os eventos mais importantes a serem ouvidos são:
    *   `connection.update`: Notifica sobre mudanças no estado da conexão (`open`, `close`, `connecting`).
    *   `qrcode.updated`: Notifica quando um novo QR Code é gerado, permitindo que o frontend o exiba sem a necessidade de polling.

**Implicação para o Van360**: O backend deve configurar o webhook para receber esses eventos e o frontend deve ter uma lógica de polling como fallback caso o webhook falhe.

## 5. Parâmetros de Instância Recomendados

Ao criar ou gerenciar instâncias, os seguintes parâmetros no `docker-compose.yml` da Evolution API podem melhorar a estabilidade:

| Parâmetro | Valor Recomendado | Motivo |
| :--- | :--- | :--- |
| `INSTANCE_READ_MESSAGES` | `true` | Marcar mensagens como lidas pode ajudar a manter a sessão do WhatsApp ativa. |
| `CLEAN_TICKET_AT_LOGOUT` | `true` | Garante que as credenciais da sessão sejam limpas ao desconectar, evitando sessões "fantasmas" que podem impedir a reconexão. |
| `CREATE_INSTANCE_ON_RECEIVED_MESSAGE` | `false` | Desativar para evitar a criação acidental de instâncias por mensagens recebidas em números não registrados. |

## 6. Lógica de "Clean Slate" para Pairing Code

Um dos problemas mais comuns ao usar o Pairing Code é a rejeição do código pelo WhatsApp se houver uma sessão anterior ativa ou em estado inconsistente. A melhor prática é garantir uma "Clean Slate" (um estado limpo) antes de solicitar um novo código:

1.  **Verificar Status**: Antes de solicitar um novo código, verifique o status da instância.
2.  **Desconectar e Deletar**: Se a instância existir e não estiver `open`, execute um `logout` e, em seguida, um `delete` na instância.
3.  **Aguardar**: Aguarde alguns segundos para garantir que a Evolution API processe a exclusão.
4.  **Criar Nova Instância**: Crie uma nova instância com o mesmo nome.
5.  **Solicitar Pairing Code**: Agora, com a instância limpa, solicite o Pairing Code.

**Implicação para o Van360**: O `whatsapp.service.ts` no backend deve implementar rigorosamente esse fluxo para garantir a máxima taxa de sucesso na conexão via do Pairing Code.
