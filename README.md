# 🚀 Van360 Backend

Backend API para o sistema Van360 - Gestão de Transporte Escolar.

## 🏗️ Arquitetura

- **Framework**: Fastify
- **Runtime**: Node.js
- **Deploy**: Vercel (Serverless)
- **Banco de Dados**: Supabase
- **Pagamentos**: Banco Inter (PIX)

## 📁 Estrutura do Projeto

```
van360-backend/
├── api/
│   └── index.ts          # Handler serverless para Vercel
├── src/
│   ├── app.ts            # Aplicação Fastify compartilhada
│   ├── server.ts         # Servidor local (desenvolvimento)
│   ├── api/              # Rotas da API
│   ├── config/           # Configurações
│   ├── services/         # Lógica de negócio
│   └── middleware/       # Middlewares
├── vercel.json           # Configuração Vercel
└── package.json
```

## 🚀 Como Executar

### Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev

# O servidor estará disponível em http://localhost:3000
```

### Produção (Vercel)

O deploy é automático via Git. A Vercel detecta o projeto e faz o deploy automaticamente.

**URLs:**
- Vercel: `https://van360-backend.vercel.app`
- Custom Domain: `https://api.van360.com.br` (quando configurado)

## 🔐 Variáveis de Ambiente

Veja `VARIAVEIS_AMBIENTE.md` para lista completa.

**Obrigatórias:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTER_API_URL`
- `INTER_CLIENT_ID`
- `INTER_CLIENT_SECRET`
- `INTER_PIX_KEY`
- `ALLOWED_ORIGINS`

## 📚 Documentação

- **Rotas da API**: `ROTAS_API.md`
- **Variáveis de Ambiente**: `VARIAVEIS_AMBIENTE.md`

## 🔄 Desenvolvimento vs Produção

### Desenvolvimento Local
- Usa `src/server.ts` com `app.listen()`
- Carrega variáveis do arquivo `.env`
- Logs coloridos com `pino-pretty`

### Produção (Vercel)
- Usa `api/index.ts` como handler serverless
- Variáveis injetadas pela Vercel
- Logs padrão do Fastify

**Ambos usam `src/app.ts`** - código compartilhado, sem duplicação!

## 📝 Scripts

```bash
npm run dev      # Desenvolvimento com hot-reload
npm run build    # Build TypeScript
npm start        # Executar build (produção local)
```

## 🧪 Testando

```bash
# Teste básico
curl http://localhost:3000/api/planos

# Com autenticação
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/passageiros
```

Veja `ROTAS_API.md` para exemplos completos.

---

**Desenvolvido com ❤️ para Van360**

