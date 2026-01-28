# 🛡️ Mapa de Segurança e Melhores Práticas - Van360

Este documento mapeia as estratégias de defesa, vulnerabilidades potenciais e práticas de segurança implementadas (ou a implementar) no ecossistema Van360.

**Nível de Criticidade:** Alto (Dados Financeiros e Pessoais de Crianças).

---

## 1. Backend (API & Lógica)

### 🔒 Autenticação e Autorização
*   **JWT (Json Web Tokens):**
    *   *Prática:* Tokens de curta duração (15-60min) + Refresh Tokens (HttpOnly Cookie).
    *   *Ação:* Verificar se estamos renovando tokens corretamente e invalidando na saída (Logout).
*   **RBAC (Role-Based Access Control):**
    *   *Prática:* Middleware `verifySupabaseJWT` deve garantir que o `user_id` do token bata com o recurso acessado.
    *   *Risco:* "IDOR" (Insecure Direct Object Reference) - Um usuário mudar o ID na URL (`/passageiros/123`) e acessar dados de outro.
    *   *Defesa:* Em *todas* as queries SQL, adicionar `.eq('usuario_id', req.user.id)` forçadamente.

### 🛡️ Proteção de Input (Data Validation)
*   **Zod na Borda:**
    *   *Status:* ✅ Implementado em todos os controllers principais.
    *   *Benefício:* Previne "Injection" (SQL/NoSQL) e dados malformados antes de chegarem no Service.
*   **Sanitização:**
    *   *Prática:* Remover HTML/Script de inputs de texto (XSS). O Zod faz parte, mas bibliotecas como `dompurify` ou `xss` podem ser úteis se salvarmos HTML rico.

### 🚦 Rate Limiting & Throttling
*   **Ataques de Força Bruta:**
    *   *Risco:* Login, rotas de PIX, disparos de SMS.
    *   *Defesa:* Adicionar `@fastify/rate-limit` no `app.ts`.
    *   *Config Sugerida:* 
        *   Login: 5 tentativas/minuto.
        *   API Geral: 100 reqs/minuto por IP.

### 🔐 Cabeçalhos de Segurança (Helmet)
*   **Uso do `@fastify/helmet`:**
    *   Configurar headers HTTP seguros (HSTS, X-Frame-Options, CSP) para evitar Clickjacking e MIME sniffing.

---

## 2. Banco de Dados (Supabase/PostgreSQL)

### 🧱 Row Level Security (RLS)
*   **A Defesa Suprema:**
    *   Mesmo que o Backend falhe (ex: esqueça um `.eq('usuario_id')`), o Banco *deve* bloquear o acesso.
    *   *Ação:* Auditar se todas as tabelas sensíveis (`passageiros`, `financeiro`, `cobrancas`) têm RLS ativado e políticas estritas (`auth.uid() = usuario_id`).

### 💉 SQL Injection
*   **Uso do Supabase Client:**
    *   O client JS (`supabase-js`) usa *Prepared Statements* por baixo dos panos, o que mitiga 99% dos riscos de SQL Injection clássico.
    *   *Atenção:* Evitar uso de `.rpc()` com strings concatenadas manualmente.

### 💾 Backups e Point-in-Time Recovery (PITR)
*   **Disponibilidade:**
    *   Garantir que o Supabase está configurado para backups diários.
    *   Testar o "Restore" pelo menos uma vez a cada 3 meses.

---

## 3. Frontend (Aplicação Web)

### 🌐 Cross-Site Scripting (XSS)
*   **React/Next.js:**
    *   O React escapa conteúdo por padrão.
    *   *Perigo:* Uso de `dangerouslySetInnerHTML`. Auditar o código e remover se não for estritamente necessário (ex: renderizar emails).

### 🍪 Gerenciamento de Sessão Segura
*   **Local Storage vs Cookies:**
    *   *Local Storage:* Vulnerável a XSS (se um script malicioso rodar, ele lê o token).
    *   *HttpOnly Cookies:* Mais seguros para Tokens de Acesso. O JS não consegue ler.

### 🕵️ vazamento de Dados Sensíveis
*   **Source Maps:**
    *   Desabilitar Source Maps em produção (`generateSourceMaps: false` no build) para não expor o código fonte original.
*   **Logs no Console:**
    *   Remover `console.log` com dados de usuários em Prod.

---

## 4. Infraestrutura e Filas (Redis/BullMQ)

### 🔒 Acesso ao Redis
*   **Senha Forte:** O Redis deve exigir senha (via `REDIS_PASSWORD`).
*   **Rede Privada:** O Redis não deve estar exposto para a internet pública (apenas para a VPC do Backend).

### 🛡️ Webhooks (Evolution API / Banco)
*   **Assinatura Digital (HMAC):**
    *   Verificar se o webhook vem realmente da Evolution/Banco.
    *   A Evolution permite definir um `API KEY` global. Verificar esse header.
    *   Não confiar cegamente em qualquer POST recebido em `/webhook`.

---

## 📋 Checklist de Segurança (Fase 5)
*   [ ] **Auditoria de RLS:** Revisar políticas no Supabase.
*   [ ] **Rate Limiting:** Instalar e configurar `@fastify/rate-limit`.
*   [ ] **Headers de Segurança:** Instalar `@fastify/helmet`.
*   [ ] **Sanitização de Logs:** Garantir que senhas/tokens não apareçam no CloudWatch/Logger.
*   [ ] **Revisão de Dependências:** Rodar `npm audit` para achar vulnerabilidades conhecidas (`CVEs`).

---
