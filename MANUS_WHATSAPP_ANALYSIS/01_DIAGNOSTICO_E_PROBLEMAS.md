# Diagnóstico e Problemas na Integração WhatsApp (Evolution API) - Van360

Este documento detalha os problemas identificados no fluxo de conexão do WhatsApp, suas causas e o contraste entre o fluxo atual e o fluxo esperado.

## 1. Problemas Identificados

Durante a análise da integração do WhatsApp (Evolution API) no Van360, foram identificados os seguintes problemas que contribuem para a instabilidade e falha na atualização de status:

1.  **Falha na Atualização de Status Pós-Conexão**: O problema central relatado pelo usuário. Após o motorista conectar o WhatsApp (via QR Code ou Pairing Code), o frontend permanece aguardando a atualização do status, que nunca ocorre ou demora excessivamente.
2.  **Webhooks Ineficazes**: A principal causa da falha de atualização. Os webhooks da Evolution API, que deveriam notificar o backend sobre mudanças de status da instância, não estão funcionando de forma confiável ou não estão sendo processados corretamente.
    *   **Mapeamento Incompleto de Status**: O `webhook-evolution.handler.ts` no backend estava mapeando apenas `open`, `close` e `connecting`. A Evolution API pode enviar outros estados como `connected` ou `disconnected`, que não estavam sendo tratados, levando a inconsistências no banco de dados.
    *   **Configuração de Eventos do Webhook**: A configuração dos eventos do webhook pode estar incompleta, não incluindo todos os eventos necessários para capturar as mudanças de estado da instância (ex: `qrcode.updated`).
3.  **Expiração do Pairing Code/QR Code**: O usuário mencionou que o Pairing Code expira rapidamente. A documentação da Evolution API indica que tanto o QR Code quanto o Pairing Code têm um tempo de vida limitado (geralmente 60 segundos), e o sistema não estava lidando com essa expiração de forma proativa ou oferecendo um mecanismo de re-geração eficiente.
4.  **Instâncias "Travadas"**: Observou-se que algumas instâncias podem ficar no estado `connecting` indefinidamente, sem transicionar para `open` ou `close`. O job de `whatsappHealthCheckJob` tenta lidar com isso, mas a lógica pode ser aprimorada.
5.  **Lógica de "Clean Slate" Insuficiente**: Ao tentar reconectar ou gerar um novo código, a lógica de limpeza de instâncias anteriores (`deleteInstance`) pode não ser robusta o suficiente, deixando resquícios de sessões que causam conflitos e impedem novas conexões.
6.  **Frequência do Health Check**: O job de `whatsappHealthCheckJob` estava configurado para rodar a cada 15 minutos (anteriormente a cada 4 horas), o que ainda é um intervalo longo para detectar e corrigir rapidamente instâncias desconectadas ou travadas.
7.  **Ausência de Notificação Proativa de Desconexão**: Quando uma instância cai, o motorista não é notificado proativamente (ex: via mensagem no WhatsApp da instância global) para reconectar, dependendo apenas do polling do frontend ou da detecção tardia do health check.
8.  **Feedback Insuficiente no Frontend**: O frontend depende exclusivamente do realtime do Supabase para atualizar o status. Se o webhook falha e o banco não é atualizado, o usuário fica sem feedback visual sobre o estado real da conexão.

## 2. Contraste: Fluxo Atual vs. Fluxo Esperado

### Fluxo Atual (Com Problemas)

1.  Motorista tenta conectar WhatsApp (Pairing Code ou QR Code).
2.  Backend solicita código/QR à Evolution API.
3.  Motorista pareia o celular com sucesso.
4.  Evolution API envia webhook de `connection.update` (estado `open` ou `connected`).
5.  **FALHA**: Webhook não é recebido/processado corretamente pelo backend, ou o status enviado pela Evolution API não é mapeado.
6.  Backend **NÃO** atualiza `whatsapp_status` na tabela `usuarios` para `CONNECTED`.
7.  Frontend (via realtime do Supabase) **NÃO** detecta mudança no `whatsapp_status`.
8.  Frontend continua exibindo o diálogo de conexão, o QR Code/Pairing Code expira, e o motorista fica confuso, acreditando que a conexão falhou.
9.  Eventualmente, o `whatsappHealthCheckJob` (a cada 15 minutos) detecta a instância como `open` e corrige o banco, mas com um atraso inaceitável para a experiência do usuário.

### Fluxo Esperado (Após Melhorias)

1.  Motorista tenta conectar WhatsApp (Pairing Code ou QR Code).
2.  Backend solicita código/QR à Evolution API.
3.  Motorista pareia o celular com sucesso.
4.  Evolution API envia webhook de `connection.update` (estado `open` ou `connected`).
5.  **SUCESSO**: Webhook é recebido e processado corretamente pelo backend, mapeando todos os estados relevantes.
6.  Backend atualiza `whatsapp_status` na tabela `usuarios` para `CONNECTED`.
7.  Frontend (via realtime do Supabase) detecta instantaneamente a mudança no `whatsapp_status`.
8.  Frontend fecha o diálogo de conexão e exibe o status "Conectado" ao motorista.
9.  **FALLBACK**: Se o webhook falhar, o polling do frontend (a cada 5 segundos) consulta o backend, que por sua vez consulta a Evolution API, detectando o status `CONNECTED` e atualizando o frontend.
10. `whatsappHealthCheckJob` (agora mais frequente) atua como uma camada de segurança final para corrigir quaisquer inconsistências remanescentes e notificar o motorista em caso de desconexão inesperada.
