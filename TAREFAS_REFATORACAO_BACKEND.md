# Tarefas de Refatoração Backend - Van360

> **Última atualização**: Varredura completa do sistema após análise detalhada  
> **Status**: 🟡 Em Progresso

---

## 📋 Índice

1. [🔴 Crítico - Segurança e Estabilidade](#-crítico---segurança-e-estabilidade)
2. [🟡 Importante - Qualidade e Manutenibilidade](#-importante---qualidade-e-manutenibilidade)
3. [🟢 Melhorias - Organização e Performance](#-melhorias---organização-e-performance)
4. [📝 Notas Importantes](#-notas-importantes)

---

## 🔴 Crítico - Segurança e Estabilidade

### 1. Configurar CORS Corretamente

**Problema**: `origin: "*"` permite qualquer origem (linha 16 de `server.ts`)

**Ação**:
- [ ] Adicionar variável `ALLOWED_ORIGINS` no `.env` (separado por vírgula)
- [ ] Atualizar `server.ts` para usar `process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']`
- [ ] Configurar `credentials: true` no CORS
- [ ] Testar se frontend ainda consegue acessar

**Arquivos**: `src/server.ts`

---

### 2. Validação de Variáveis de Ambiente

**Problema**: Variáveis de ambiente não são validadas na inicialização

**Ação**:
- [ ] Instalar `zod` (se não tiver): `npm install zod`
- [ ] Criar `src/config/env.ts` com validação Zod de todas as variáveis
- [ ] Validar: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTER_API_URL`, `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_PATH`, `INTER_KEY_PATH`, `INTER_PIX_KEY`, `INTER_MOCK_MODE`
- [ ] Atualizar `src/config/env.ts` para usar schema validado
- [ ] Atualizar imports em `server.ts` e outros arquivos que usam `process.env` diretamente

**Arquivos**: `src/config/env.ts`, `src/server.ts`

---

### 3. Sistema Centralizado de Tratamento de Erros

**Problema**: Erros tratados de forma diferente em cada rota, sem padrão (185+ ocorrências de `any` em erros)

**Ação**:
- [ ] Criar `src/errors/AppError.ts` (classe base de erro)
- [ ] Criar `src/errors/ValidationError.ts` (erro de validação - 400)
- [ ] Criar `src/errors/NotFoundError.ts` (recurso não encontrado - 404)
- [ ] Criar `src/errors/UnauthorizedError.ts` (não autorizado - 401)
- [ ] Criar `src/errors/ForbiddenError.ts` (proibido - 403)
- [ ] Criar `src/errors/ConflictError.ts` (conflito - 409)
- [ ] Criar `src/middleware/errorHandler.ts` com handler global
- [ ] Registrar error handler no Fastify (`app.setErrorHandler`)
- [ ] Padronizar formato de resposta: `{ error: string, code?: string, details?: any }`
- [ ] Mapear erros do Supabase para erros da aplicação
- [ ] Substituir tratamento manual de erro nas rotas pelo sistema centralizado

**Arquivos**: `src/errors/*.ts`, `src/middleware/errorHandler.ts`, `src/server.ts`, todas as rotas

---

### 4. Validação de Inputs com Schemas

**Problema**: Validação de dados feita diretamente nas rotas, sem schemas centralizados (78+ ocorrências de `request.body` sem validação)

**Ação**:
- [ ] Instalar `zod` (se não tiver): `npm install zod`
- [ ] Criar `src/schemas/usuario.schema.ts` (validação de registro, update, etc)
- [ ] Criar `src/schemas/cobranca.schema.ts` (create, update, filtros)
- [ ] Criar `src/schemas/passageiro.schema.ts` (create, update, filtros)
- [ ] Criar `src/schemas/escola.schema.ts` (create, update)
- [ ] Criar `src/schemas/veiculo.schema.ts` (create, update)
- [ ] Criar `src/schemas/gasto.schema.ts` (create, update, filtros)
- [ ] Criar `src/schemas/plano.schema.ts` (validação de planos)
- [ ] Criar `src/schemas/assinatura.schema.ts` (validação de assinaturas)
- [ ] Criar `src/middleware/validate.ts` (middleware de validação genérico)
- [ ] Aplicar validação em todas as rotas POST/PUT/PATCH
- [ ] Remover validações manuais inline das rotas

**Arquivos**: `src/schemas/*.ts`, `src/middleware/validate.ts`, todas as rotas

---

### 5. Rate Limiting

**Problema**: Não há proteção contra abuso de API

**Ação**:
- [ ] Instalar `@fastify/rate-limit`: `npm install @fastify/rate-limit`
- [ ] Configurar rate limiting global no `server.ts`
- [ ] Configurar limites específicos para rotas de autenticação (mais restritivo)
- [ ] Configurar limites para rotas de webhook
- [ ] Testar se funciona corretamente

**Arquivos**: `src/server.ts`

---

## 🟡 Importante - Qualidade e Manutenibilidade

### 6. Corrigir Nomenclatura de Arquivos

**Problema**: `config/contants.ts` tem typo (deveria ser `constants.ts`)

**Ação**:
- [ ] Renomear `src/config/contants.ts` → `src/config/constants.ts`
- [ ] Atualizar todos os imports (usar busca e substituição)
- [ ] Verificar se não quebrou nada

**Arquivos**: `src/config/contants.ts`, todos os arquivos que importam

---

### 7. Extrair Lógica Duplicada

**Problema**: Código repetido para buscar usuário por `auth_uid` em `usuario.route.ts` (linhas 144-156, 190-202, 236-248, 282-294)

**Ação**:
- [ ] Criar `src/utils/userHelpers.ts` com função `getUsuarioIdByAuthUid(authUid: string): Promise<string>`
- [ ] Criar função `getUsuarioByAuthUid(authUid: string): Promise<Usuario>` (se necessário)
- [ ] Substituir código duplicado em `usuario.route.ts` pelas funções helper
- [ ] Verificar outras rotas que possam ter lógica similar
- [ ] Testar se funciona igual

**Arquivos**: `src/utils/userHelpers.ts`, `src/api/usuario.route.ts`

---

### 8. Criar Wrapper de Rotas (Async Handler)

**Problema**: Mesmo padrão de try/catch repetido em todas as rotas (129+ ocorrências)

**Ação**:
- [ ] Criar `src/utils/routeWrapper.ts` com função `asyncHandler`
- [ ] Wrapper deve capturar erros e usar error handler global
- [ ] Aplicar em uma rota como exemplo (ex: `cobranca.routes.ts`)
- [ ] Aplicar gradualmente em outras rotas
- [ ] Remover try/catch manual das rotas que usam wrapper

**Arquivos**: `src/utils/routeWrapper.ts`, todas as rotas

---

### 9. Tipos TypeScript - Reduzir `any`

**Problema**: Uso excessivo de `any` (185+ ocorrências encontradas)

**Ação**:
- [ ] Criar `src/types/request.ts` com tipos de requests (FastifyRequest tipado)
- [ ] Criar `src/types/response.ts` com tipos de responses padronizados
- [ ] Criar `src/types/database.ts` com tipos do Supabase (se necessário)
- [ ] Tipar parâmetros de rotas (`request.params`)
- [ ] Tipar query strings (`request.query`)
- [ ] Tipar body de requests (`request.body`)
- [ ] Tipar retornos de services
- [ ] Habilitar `noImplicitAny: true` no `tsconfig.json` (já tem `strict: true`, mas verificar)
- [ ] Revisar e tipar services gradualmente
- [ ] Revisar e tipar rotas gradualmente

**Arquivos**: `src/types/*.ts`, `tsconfig.json`, todos os arquivos com `any`

---

### 10. Middleware de Autenticação como Plugin

**Problema**: Autenticação aplicada manualmente em cada rota (comentada em algumas)

**Ação**:
- [ ] Criar `src/plugins/auth.ts` como plugin Fastify
- [ ] Mover lógica de `middleware/auth.ts` para plugin
- [ ] Criar decorator `@authenticate` ou hook `preHandler`
- [ ] Registrar plugin no `server.ts`
- [ ] Aplicar em rotas que precisam de auth
- [ ] Remover código duplicado de autenticação
- [ ] Testar se funciona igual

**Arquivos**: `src/plugins/auth.ts`, `src/middleware/auth.ts`, `src/server.ts`, todas as rotas

---

### 11. Middleware de Request ID

**Problema**: Não há rastreamento de requests para debug

**Ação**:
- [ ] Criar middleware que gera `requestId` único (UUID)
- [ ] Adicionar `requestId` aos logs (usar child logger do Pino)
- [ ] Retornar `requestId` no header `X-Request-ID` da resposta
- [ ] Facilitar correlação de logs e debug

**Arquivos**: `src/middleware/requestId.ts`, `src/server.ts`

---

### 12. Health Check Endpoint

**Problema**: Não há endpoint para verificar saúde da API

**Ação**:
- [ ] Criar rota `GET /health` em `server.ts`
- [ ] Verificar conexão com Supabase
- [ ] Verificar serviços externos (Inter API, se aplicável)
- [ ] Retornar status: `{ status: 'ok' | 'degraded' | 'down', checks: {...} }`
- [ ] Útil para monitoramento e load balancers

**Arquivos**: `src/server.ts` ou `src/api/health.route.ts`

---

### 13. Melhorar Logging Estruturado

**Problema**: Logs não estruturados adequadamente, falta contexto

**Ação**:
- [ ] Adicionar contexto aos logs (userId, requestId, etc)
- [ ] Criar helper de logging com contexto: `src/utils/logger.ts`
- [ ] Loggar tempo de resposta em todas as rotas (usar hook `onResponse`)
- [ ] Loggar erros com stack trace completo
- [ ] Usar child logger do Pino para contexto
- [ ] Adicionar logging de operações sensíveis (mudança de plano, cancelamento)

**Arquivos**: `src/utils/logger.ts`, `src/server.ts`, todas as rotas

---

### 14. Documentação Swagger/OpenAPI

**Problema**: Não há documentação das rotas

**Ação**:
- [ ] Instalar `@fastify/swagger` e `@fastify/swagger-ui`: `npm install @fastify/swagger @fastify/swagger-ui`
- [ ] Configurar Swagger no `server.ts`
- [ ] Documentar uma rota como exemplo (ex: `GET /api/cobrancas/:id`)
- [ ] Documentar todas as rotas gradualmente
- [ ] Incluir exemplos de request/response
- [ ] Incluir descrições e tags

**Arquivos**: `src/server.ts`, todas as rotas

---

## 🟢 Melhorias - Organização e Performance

### 15. Reorganizar Estrutura de Rotas (Versionamento)

**Problema**: Todas as rotas no mesmo nível, sem versionamento

**Ação**:
- [ ] Criar `src/api/v1/` (preparar para versionamento)
- [ ] Mover todas as rotas para `src/api/v1/`
- [ ] Atualizar prefixos em `routes.ts` para `/api/v1/...`
- [ ] Manter compatibilidade retroativa (redirecionar `/api/...` para `/api/v1/...` se necessário)
- [ ] Testar se tudo funciona

**Arquivos**: `src/api/*.ts`, `src/api/routes.ts`

---

### 16. Paginação em Listagens

**Problema**: Listagens podem retornar muitos dados sem paginação

**Ação**:
- [ ] Adicionar query params `page` e `limit` nas rotas de listagem
- [ ] Implementar paginação nos services
- [ ] Retornar metadata: `{ data: [], total: number, page: number, totalPages: number, limit: number }`
- [ ] Aplicar em: `GET /api/cobrancas`, `GET /api/passageiros`, `GET /api/escolas`, `GET /api/veiculos`, `GET /api/gastos`

**Arquivos**: Services e rotas de listagem

---

### 17. Cache Básico

**Problema**: Dados frequentemente acessados são buscados do banco toda vez

**Ação**:
- [ ] Implementar cache em memória para planos (raramente mudam)
- [ ] Implementar cache para configurações
- [ ] Adicionar TTL (Time To Live) para cache
- [ ] Invalidar cache quando necessário (ex: atualização de plano)
- [ ] Considerar Redis no futuro (por enquanto, cache em memória)

**Arquivos**: `src/utils/cache.ts`, `src/services/plano.service.ts`

---

### 18. Sanitização de Inputs

**Problema**: Inputs podem conter dados maliciosos

**Ação**:
- [ ] Criar `src/utils/sanitize.ts` com funções de sanitização
- [ ] Sanitizar strings (remover caracteres perigosos)
- [ ] Validar tamanho de payloads
- [ ] Aplicar sanitização antes da validação

**Arquivos**: `src/utils/sanitize.ts`, middleware de validação

---

### 19. Compressão de Respostas

**Problema**: Respostas não são comprimidas

**Ação**:
- [ ] Instalar `@fastify/compress`: `npm install @fastify/compress`
- [ ] Registrar plugin no `server.ts`
- [ ] Comprimir respostas grandes automaticamente
- [ ] Reduzir uso de banda

**Arquivos**: `src/server.ts`

---

### 20. Transações para Operações Críticas

**Problema**: Operações que deveriam ser transacionais não são

**Ação**:
- [ ] Identificar operações críticas (ex: criação de usuário + assinatura)
- [ ] Implementar transações do Supabase para essas operações
- [ ] Rollback em caso de erro
- [ ] Testar cenários de falha

**Arquivos**: Services que fazem múltiplas operações

---

### 21. Separar Concerns (Repository Pattern - Opcional)

**Problema**: Services fazem queries diretas ao Supabase

**Ação** (Opcional - Futuro):
- [ ] Criar `src/repositories/` (abstração de acesso a dados)
- [ ] Mover queries do Supabase para repositories
- [ ] Services usam repositories, não Supabase diretamente
- [ ] Facilita testes e troca de banco no futuro

**Arquivos**: `src/repositories/*.ts`, services

---

## 📝 Notas Importantes

### ⚠️ Regras de Ouro:

1. **Sempre testar** após cada mudança
2. **Fazer uma coisa por vez** - commits pequenos
3. **Manter compatibilidade** - não quebrar API existente
4. **Validar** antes de commitar
5. **Revisar logs** após mudanças

### 🎯 Ordem Recomendada de Execução:

1. **Etapa 1-2** (CORS + Env) - CRÍTICO, fazer primeiro
2. **Etapa 3** (Erros) - CRÍTICO, base para tudo
3. **Etapa 4** (Validação) - CRÍTICO, segurança
4. **Etapa 5** (Rate Limit) - CRÍTICO, segurança
5. **Etapa 6** (Nomenclatura) - Baixo risco, impacto imediato
6. **Etapa 7-8** (Duplicação + Wrapper) - Baixo risco, qualidade
7. **Etapa 9** (Tipos) - Importante, qualidade
8. **Etapa 10-11** (Auth + Request ID) - Importante, mas pode esperar
9. **Etapa 12-13** (Health + Logging) - Importante, fácil
10. **Etapa 14** (Docs) - Importante, mas não crítico
11. **Etapas 15-21** (Melhorias) - Podem esperar

### 🚫 NÃO Fazer Agora:

- Mudanças que quebram API existente
- Refatorações grandes sem testes
- Remover código antes de ter substituto funcionando
- Mudanças em lógica de negócio complexa sem testes

### ✅ Testes Recomendados Após Cada Etapa:

- Testar rotas principais manualmente
- Verificar logs
- Testar tratamento de erros
- Verificar se frontend ainda funciona
- Testar cenários de erro

---

## 📊 Resumo de Estatísticas

- **Total de arquivos analisados**: 22+
- **Ocorrências de `any`**: 185+
- **Ocorrências de `request.body` sem validação**: 78+
- **Ocorrências de try/catch**: 129+
- **Rotas sem autenticação**: Várias (comentadas)
- **Arquivos com typo**: 1 (`contants.ts`)

---

**Próximos Passos:** Começar pela Etapa 1 (CORS), depois Etapa 2 (Env), depois Etapa 3 (Erros), depois Etapa 4 (Validação).
