# Relatório de Debug e Pedido de Ajuda: Integração WhatsApp (Evolution API)

**Status Final (14/01 16:45):**
*   ✅ **Pairing Code:** FUNCIONANDO (Gerado instantaneamente via `qrcode: false`).
*   ✅ **Conexão:** O WhatsApp Mobile aceita o código e conecta.
*   ❌ **Webhook:** MORTO (O Backend nunca recebe o evento `connection.update`).

---

## 1. O Cenário Atual (O que funciona)

Ao contrário de diagnósticos anteriores, confirmamos que o **Modo Lite (`qrcode: false`)** está funcionando perfeitamente para a geração do código.
1.  **Geração:** O código é gerado em milissegundos.
2.  **Notificação:** A notificação chega no celular imediatamente.
3.  **Aceite:** Ao digitar o código, o WhatsApp móvel aceita a conexão e mostra a instância como "Ativa".

**Código Atual do Service (`whatsapp.service.ts`):**
```typescript
// createInstance é chamado com qrcode: false
await this.createInstance(instanceName, false);

// Aguardamos 2.5s para a Evolution "acordar"
await new Promise(r => setTimeout(r, 2500));

// Solicitamos o pairing code
const { data } = await axios.get(..., { headers: { "apikey": ... } });
```
A arquitetura de conexão está **RESOLVIDA**. Não mexa nisso.

---

## 2. O Problema (Onde precisamos de ajuda)

**A Evolution API não está enviando Webhooks.**

O usuário conecta, o celular diz "Conectado", mas o backend (Fastify) fica às cegas. O status no banco de dados e no frontend nunca sai de "UNKNOWN" ou "CONNECTING" porque o evento `connection.update` nunca chega.

**Já Validamos (Não é isso):**
*   **URL:** A URL está correta: `http://host.docker.internal:3000/api/evolution/webhook`.
*   **Acesso:** O container Docker consegue ver o host (testamos outros endpoints).
*   **Payload de Configuração:** Estamos enviando o wrapper correto na criação:
    ```json
    {
      "webhook": {
        "enabled": true,
        "url": "...",
        "events": ["connection.update"]
      }
    }
    ```

**O Mistério:**
Mesmo com `enabled: true`, a Evolution silencia.

## 3. O Que Precisa Ser Feito (Para quem pegar esse BO)

Precisamos de alguém com experiência profunda em **Evolution API v1.8.x + Docker** para entender por que os webhooks morrem no limbo.

**Sugestões de Investigação:**
1.  **Logs da Evolution:** Olhar o terminal do Docker onde a Evolution roda. Tem erro de `ECONNREFUSED`? Tem erro de parser?
2.  **Global Webhook:** Tentar configurar o Webhook Globalmente (`env.GLOBAL_WEBHOOK`) em vez de por instância.
3.  **Conflito de Eventos:** Verificar se `webhookByEvents: false` está depreciado ou bugado nessa versão.

---

**Resumo para o Cliente:**
*   Seu sistema conecta. O Pairing Code funciona.
*   A tela só não fica "verde" sozinha porque o "carteiro" (Webhook) entrou em greve.
*   Você pode usar o sistema (ele manda mensagens), só o status visual que está mentindo.
