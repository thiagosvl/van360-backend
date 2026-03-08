# Diretrizes de Arquitetura e Desenvolvimento - Van360 Backend

## 🎯 Objetivo
Este documento serve como referência única de verdade para a arquitetura do projeto Backend da Van360 (pasta van360-backend). Deve ser consultado por IAs e desenvolvedores antes de iniciar qualquer modificação no código.

---

## 1. Princípios Gerais
- **Controller Magro, Service Gordo:** A lógica de negócios **DEVE** residir nos services. Os controllers servem apenas para: receber a requisição, validar entrada (Zod), chamar o serviço e devolver a resposta.
- **Tipagem Forte:** Use DTOs definidos em `src/types/dtos` para validar entradas e tipar saídas. Não use `any` a menos que estritamente necessário (ex: bibliotecas legadas).
- **Validação com Zod:** Toda entrada de dados em rotas (body, query, params) deve ser validada usando schemas do Zod.
- **Acesso ao Banco:** O acesso ao banco (Supabase) acontece diretamente na camada de `Services` usando `supabaseAdmin`. Não usamos um padrão de Repository separado (o Service atua como tal).
- **Código Limpo > Comentários:** O código deve ser autoexplicativo (nomes claros de funções e variáveis). **EVITE** comentários explicativos ("// Faz X"). Use comentários apenas em casos extremos de complexidade ou hacks necessários, e avise explicitamente no PR/Chat se o fizer. O excesso de comentários polui a base de código.

---

## 2. Organização de Pastas

### 📂 `src/api` (Rotas)
- Define os endpoints e registra os plugins do Fastify.
- Mapeia URLs para métodos dos Controllers.
- **Padrão:** `nome-recurso.routes.ts`.

### 📂 `src/controllers`
- Lida com Request e Reply.
- Faz o parse dos dados usando Zod Schemas.
- Trata erros HTTP ou repassa para o handler global.
- **Padrão:** `nome-recurso.controller.ts`.

### 📂 `src/services`
- Contém TODA a regra de negócio.
- Interage com o banco de dados (`supabaseAdmin`) e APIs externas.
- Funções devem ser puras e tipadas sempre que possível.
- **Padrão:** `nome-recurso.service.ts`.

### 📂 `src/types`
- **`dtos/`**: Schemas Zod e tipos inferidos para inputs/outputs.
- **`enums.ts`**: Enumerações compartilhadas (Status, Tipos).

### 📂 `src/config`
- Configurações de ambiente, clientes (Supabase, Logger, Redis).

---

## 3. Padrões de Código

### Fluxo de Requisição
1. **Rota**: Define URL e middleware.
2. **Controller**:
   ```typescript
   create: async (req, reply) => {
       const data = createSchema.parse(req.body); // Validação
       const result = await myService.create(data);
       return reply.status(201).send(result);
   }
   ```
3. **Service**:
   ```typescript
   const create = async (data: CreateDTO) => {
       // Regra de negócio
       if (data.valor < 0) throw new AppError("Valor inválido");
       
       // DB Call
       const { data: created, error } = await supabaseAdmin.from("table").insert(data);
       if (error) throw error;
       return created;
   }
   ```

### Tratamento de Erros
- Use `AppError` (ou similar) para erros de negócio conhecidos (400, 403, 404).
- Erros não tratados resultam em 500 pelo handler global.

---

## 4. Stack Tecnológico
- **Framework:** Fastify
- **Linguagem:** TypeScript
- **Banco de Dados:** Supabase (PostgreSQL)
- **Validação:** Zod
- **Filas:** BullMQ + Redis (para jobs em background)
- **Logs:** Pino (via logger config)

---
*Documento criado em: 20/01/2026*
