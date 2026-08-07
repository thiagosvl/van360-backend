# Arquitetura de Mensageria e Estratégia WABA (Meta Cloud API)

Este documento centraliza todas as decisões estratégicas, análises de arquitetura, pontos cegos e roadmaps (curto e longo prazo) discutidos para a evolução do sistema de notificações do Van360. Ele serve como o "Norte" (Single Source of Truth) para qualquer futura implementação de comunicação com motoristas e passageiros.

---

## 1. O Problema Estrutural (Por que sair de APIs Não-Oficiais)

O uso de soluções não-oficiais (como Evolution API, Baileys, etc.) acoplando o número do motorista para envio em massa possui falhas inerentes ao próprio ecossistema do WhatsApp:
- **Risco de Banimento (Spam):** O WhatsApp pune números comuns (QR Code) que enviam alto volume de mensagens idênticas em curto espaço de tempo, bloqueando as linhas dos motoristas e prejudicando a operação deles.
- **Falta de Estabilidade:** Conexões caem (dispositivos desconectados), exigindo que o motorista refaça o pareamento, o que gera alto custo de suporte (overhead) para a equipe do Van360.
- **Conclusão Estratégica:** O Van360 não é uma empresa de "gestão de chips". Para escalar de 1 para 1.000 motoristas, a mensageria precisa ser transparente, centralizada e oficialmente homologada (Meta Cloud API).

---

## 2. Decisões Arquiteturais Consolidadas

### 2.1. Desacoplamento de Canal (Event-Driven)
A arquitetura do Van360 já segue princípios de Ports & Adapters, mas deve consolidar o conceito de que **"O Sistema não envia WhatsApp, ele gera Eventos"**.
- O núcleo (`cobranca.service.ts`) não deve saber se a mensagem vai por WhatsApp, SMS ou Push. Ele emite um evento: "Cobrança Vencida".
- O adaptador decide o roteamento. No futuro, a fila (atualmente `whatsapp.queue`) deverá evoluir semanticamente para `notification.queue`, roteando para Push (quando o App dos Pais existir), E-mail, ou WABA.

### 2.2. A Inteligência de Envio (State-Driven Cron)
O *Cron* de cobranças não pode ser reativo apenas à data exata (ex: "vence exatamente hoje"). Para garantir resiliência contra quedas de servidor ou filas travadas, o Cron funciona por **Janelas de Atraso**:
- **Janela de Vencimento (0 a 2 dias):** Se a fatura venceu hoje (ou há 1/2 dias) e *nunca* recebeu notificação de vencimento, ela é enviada.
- **Janela de Atraso (3 a 9 dias):** Se a fatura está atrasada há 3 dias (ou mais) e *nunca* recebeu notificação de atraso, ela é enviada.
Isso garante que mensagens não sejam "engolidas" pelo tempo caso o sistema fique offline no dia exato do gatilho.

### 2.3. Idempotência (Prevenção de Duplicidade)
Toda notificação enviada para a Fila (Redis/BullMQ) deve carregar um ID de rastreio (ex: `cobrancaId`). O Banco de Dados só será marcado como "Enviado" **quando o Worker processar a mensagem com sucesso**. Se o sistema crashar no meio do caminho, ele não atualizará o BD e tentará novamente, impedindo que passageiros não sejam cobrados, mas a lógica do Worker (ou da Meta) usa chaves de idempotência para evitar cobranças duplicadas.

---

## 3. O Futuro: Meta Cloud API (WABA)

Quando a migração para a API Oficial for iniciada, as seguintes regras de negócios são obrigatórias:

### 3.1. Dois Números de Telefone Separados
A Meta não permite que um número WABA (API) seja simultaneamente utilizado no aplicativo físico do WhatsApp Business.
- **Número 1 (O Robô):** "Van360 Notificações" -> Número exclusivo para WABA. Envia as automações transacionais para os pais.
- **Número 2 (Atendimento Humano):** Número de suporte tradicional do Thiago para tirar dúvidas dos motoristas via App/WhatsApp Web.

### 3.2. Respostas dos Usuários (Auto-Responder)
Como o "Número 1" não possui interface humana natural (sem WhatsApp Web), se um pai responder a uma cobrança, o webhook da Meta deverá acionar uma auto-resposta:
> *"🤖 Este é o assistente automático do Van360 e não recebe mensagens. Para falar com o seu motorista, acesse o aplicativo ou chame-o diretamente."*

*(Atenção aos Custos: Mensagens de "Serviço" iniciadas por usuários têm uma cota gratuita de 1.000 por mês. Acima disso, há tarifação. O volume de respostas "obrigado" deverá ser monitorado).*

### 3.3. Templates Rigorosos (Utility vs Marketing)
- A grande maioria das notificações aos pais (Cobrança, Lembrete, Recibo, Rota) se enquadra em **Utility** (Utilidade - Mais barato).
- Algumas notificações enviadas aos motoristas que contenham ofertas ("assine agora com desconto" ou "ganhe bônus de indicação") serão enquadradas como **Marketing** (Mais caro).
- É proibido usar variáveis dinâmicas gigantescas (ex: listar 50 aniversariantes em uma mensagem). Listas devem ser movidas para dentro da interface do App do motorista, usando o WABA apenas como "alerta" de que o resumo está disponível no App.

### 3.4. Melhoria Drástica de UX (Botões Nativos)
Na Meta API, as "mensagens de PIX" abandonam o formato feio de 3 balões (Texto + PIX solto + Instrução). Elas passam a usar um botão nativo de rodapé **[ Copiar Chave PIX ]**.

### 3.5. A Reputação e o Botão "Sair" (Opt-out)
O número central do Van360 receberá avaliações de qualidade da Meta. Se muitos pais bloquearem o número, a taxa de entrega cai e a conta pode ser suspensa.
- É obrigatório que as primeiras mensagens ofereçam o opt-out: *"Responda SAIR para parar de receber mensagens"*.
- Se um pai der opt-out, o sistema o insere numa `blacklist` interna e suspende envios para ele automaticamente.

---

## 4. O Roadmap de Fases (Execução)

### Fase 1: Resiliência no Cenário Atual (Sendo implementada hoje)
**Foco:** Sobreviver ao uso da Evolution de forma mais resiliente enquanto a Meta não é implementada.
- Desacoplar a atualização do Banco de Dados do enfileiramento (marcar como enviado só no sucesso do Worker).
- Refatorar a inteligência do Cron (`cobranca.service.ts`) para atuar por janelas de alcance (Estado), não mais por gatilhos fixos de "hoje".
- Enxugar os templates de disparo (apenas dia do vencimento e 3 dias de atraso).
- Corrigir o Webhook do Telegram criando um Throttle (Redis Cooldown de 2 horas) e IDs dinâmicos, para alertar sobre falhas da Evolution sem causar "spam" no celular do Admin.

### Fase 2: Implementação WABA (Curto/Médio Prazo)
**Foco:** Migração transacional.
- Criar a Business Manager na Meta e submeter o CNPJ.
- Aprovar os templates essenciais (Cobrança, Recibo).
- Criar o `MetaWhatsappCloudAdapter`.
- Testar envio com motoristas pilotos (beta).

### Fase 3: Visão de Longo Prazo (Analytics e App)
**Foco:** Geração de Valor Premium.
- **Analytics:** Usar o webhook da Meta para registrar os timestamps de `entregue` e `lido`. Mostrar no App do motorista (ex: "O pai do João leu a cobrança às 14h").
- **App dos Pais (Push):** Migrar 100% da mensageria transacional de pais engajados para Push Notifications, usando WhatsApp/SMS apenas como fallback.
- **SMS Fallback:** Se a conta WABA cair ou o usuário não tiver WhatsApp, o sistema tentar usar um provedor SMS (Zenvia, Infobip) antes de desistir.

---
_Documento gerado para direcionamento técnico e de negócios. Sempre atualize este arquivo ao revisar limites da Meta API ou estratégias de engajamento._
