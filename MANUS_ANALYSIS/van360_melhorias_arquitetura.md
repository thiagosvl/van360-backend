# Melhorias na Arquitetura de Assinaturas e Taxas

## 1. Histórico de Taxas (Auditoria Financeira)

### Problema Atual
A taxa de intermediação é lida da tabela `configuracao_interna` em tempo de execução. Se a configuração mudar, não há registro de qual taxa foi aplicada em cada transação histórica.

### Solução Proposta

#### 1.1 Adicionar Coluna na Tabela `transacoes_repasse`

**SQL Migration:**
```sql
ALTER TABLE "public"."transacoes_repasse" 
ADD COLUMN "taxa_aplicada" numeric(10, 2) DEFAULT 0.99;

COMMENT ON COLUMN "public"."transacoes_repasse"."taxa_aplicada" IS 'Taxa de intermediação PIX aplicada nesta transação (em R$)';
```

#### 1.2 Atualizar `cobranca-pagamento.service.ts`

**Localização:** Função `iniciarRepasse`, linha ~86

**Antes:**
```typescript
const taxa = await getConfigNumber(ConfigKey.TAXA_INTERMEDIACAO_PIX, 0.99); 
const valorRepasse = cobranca.valor - taxa;
```

**Depois:**
```typescript
const taxa = await getConfigNumber(ConfigKey.TAXA_INTERMEDIACAO_PIX, 0.99); 
const valorRepasse = cobranca.valor - taxa;

// Registrar taxa aplicada para auditoria
const transacaoData: any = {
  cobranca_id: cobrancaId,
  usuario_id: cobranca.usuario_id,
  valor_bruto: cobranca.valor,
  taxa_plataforma: taxa,
  taxa_aplicada: taxa, // Nova coluna para auditoria
  valor_liquido: valorRepasse,
  status: hasValidPix ? TransactionStatus.PROCESSAMENTO : RepasseStatus.FALHA, 
  data_execucao: new Date()
};
```

---

## 2. Validação de Saldo Prévio

### Problema Atual
O `payoutWorker` tenta enviar o repasse sem verificar se a conta do Inter tem saldo suficiente, causando falhas silenciosas.

### Solução Proposta

#### 2.1 Adicionar Método no `inter.service.ts`

```typescript
async function consultarSaldoInter(adminClient: SupabaseClient): Promise<number> {
  const token = await getValidInterToken(adminClient);

  try {
    const { data } = await axios.get(
      `${INTER_API_URL}/saldo`,
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent(),
      }
    );
    return data.disponivel || 0;
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message }, "Falha ao consultar saldo");
    throw new Error("Falha ao consultar saldo no Inter");
  }
}
```

#### 2.2 Atualizar `payout.worker.ts`

**Localização:** Função `payoutWorker`, linha ~18

**Antes:**
```typescript
try {
  // 1. Marcar como "Processando" no banco
  await supabaseAdmin.from("cobrancas")
    .update({ status_repasse: RepasseStatus.PROCESSANDO })
    .eq("id", cobrancaId);

  // 2. Chamar Service de Repasse
  // ...
}
```

**Depois:**
```typescript
try {
  // 1. Marcar como "Processando" no banco
  await supabaseAdmin.from("cobrancas")
    .update({ status_repasse: RepasseStatus.PROCESSANDO })
    .eq("id", cobrancaId);

  // 1.5 Validar saldo prévio
  const saldoDisponivel = await interService.consultarSaldoInter(supabaseAdmin);
  if (saldoDisponivel < valorRepasse) {
    logger.warn({ cobrancaId, saldoDisponivel, valorRepasse }, "Saldo insuficiente no Inter para repasse");
    await supabaseAdmin.from("cobrancas")
      .update({ 
        status_repasse: RepasseStatus.FALHA,
        motivo_falha: "Saldo insuficiente na conta Inter"
      })
      .eq("id", cobrancaId);
    throw new Error("Saldo insuficiente no Inter");
  }

  // 2. Chamar Service de Repasse
  // ...
}
```

---

## 3. Notificação de Falha de Repasse

### Problema Atual
Quando o repasse falha, o motorista não recebe notificação e só descobre consultando o painel.

### Solução Proposta

#### 3.1 Atualizar `payout.worker.ts`

**Localização:** Bloco de erro, linha ~68

**Antes:**
```typescript
} catch (error: any) {
  logger.error({ jobId: job.id, error: error.message }, "[Worker] Payout Job Failed");
  
  if (transacaoId) {
    await supabaseAdmin.from("transacoes_repasse")
      .update({ 
        status: RepasseStatus.FALHA, 
        mensagem_erro: error.message 
      })
      .eq("id", transacaoId);
  }

  await supabaseAdmin.from("cobrancas").update({ status_repasse: RepasseStatus.FALHA }).eq("id", cobrancaId);
  
  if (error.message.includes("Chave PIX")) {
    return;
  }

  throw error;
}
```

**Depois:**
```typescript
} catch (error: any) {
  logger.error({ jobId: job.id, error: error.message }, "[Worker] Payout Job Failed");
  
  if (transacaoId) {
    await supabaseAdmin.from("transacoes_repasse")
      .update({ 
        status: RepasseStatus.FALHA, 
        mensagem_erro: error.message 
      })
      .eq("id", transacaoId);
  }

  await supabaseAdmin.from("cobrancas").update({ status_repasse: RepasseStatus.FALHA }).eq("id", cobrancaId);

  // Notificar motorista sobre falha
  try {
    const { data: usuario } = await supabaseAdmin
      .from("usuarios")
      .select("telefone, nome")
      .eq("id", motoristaId)
      .single();

    if (usuario?.telefone) {
      await notificationService.notifyDriver(
        usuario.telefone,
        DRIVER_EVENT_REPASSE_FAILED,
        {
          nomeMotorista: usuario.nome,
          motivo: error.message,
          valor: valorRepasse,
          dataVencimento: "",
          nomePlano: ""
        }
      );
    }
  } catch (notifyErr) {
    logger.error({ notifyErr }, "Erro ao notificar motorista sobre falha de repasse");
  }
  
  if (error.message.includes("Chave PIX")) {
    return;
  }

  throw error;
}
```

---

## 4. Melhorias na Tabela de Assinaturas

### 4.1 Adicionar Coluna de Histórico de Taxas

**SQL Migration:**
```sql
ALTER TABLE "public"."assinaturas_cobrancas" 
ADD COLUMN "taxa_intermediacao_banco" numeric(10, 2) DEFAULT 0.99;

COMMENT ON COLUMN "public"."assinaturas_cobrancas"."taxa_intermediacao_banco" IS 'Taxa de intermediação PIX aplicada nesta cobrança';
```

### 4.2 Adicionar Índice para Performance

```sql
CREATE INDEX idx_assinaturas_cobrancas_usuario_status 
ON "public"."assinaturas_cobrancas" (usuario_id, status);

CREATE INDEX idx_transacoes_repasse_usuario_status 
ON "public"."transacoes_repasse" (usuario_id, status);
```

---

## 5. Relatório de Auditoria Financeira

### Consulta SQL para Validar Taxas Aplicadas

```sql
SELECT 
  ac.id as cobranca_id,
  ac.usuario_id,
  ac.valor,
  ac.taxa_intermediacao_banco,
  ac.valor - ac.taxa_intermediacao_banco as valor_liquido,
  ac.status,
  ac.data_pagamento,
  tr.status as status_repasse,
  tr.taxa_aplicada
FROM assinaturas_cobrancas ac
LEFT JOIN transacoes_repasse tr ON ac.id = tr.cobranca_id
WHERE ac.data_pagamento >= NOW() - INTERVAL '30 days'
ORDER BY ac.data_pagamento DESC;
```

---

## Resumo de Mudanças

| Componente | Mudança | Impacto |
|-----------|---------|--------|
| `inter.service.ts` | Adicionar `tipoDestinatario` | Valida chaves PIX corretamente |
| `validacao-pix.service.ts` | Passar tipo de chave | Micro-pagamento de R$ 0,01 funciona |
| `payout.worker.ts` | Validar saldo + notificar | Repasses mais confiáveis e transparentes |
| `transacoes_repasse` | Coluna `taxa_aplicada` | Auditoria financeira completa |
| `assinaturas_cobrancas` | Coluna `taxa_intermediacao_banco` | Histórico de taxas por cobrança |

---

## Prioridade de Implementação

1. **Alta:** Correção do `tipoDestinatario` (afeta validação PIX)
2. **Alta:** Validação de saldo prévio (evita falhas de repasse)
3. **Média:** Histórico de taxas (auditoria)
4. **Média:** Notificação de falha (UX)
5. **Baixa:** Índices de performance (otimização)
