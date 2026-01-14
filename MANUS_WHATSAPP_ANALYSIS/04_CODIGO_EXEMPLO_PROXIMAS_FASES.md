# Código de Exemplo - Próximas Fases

## Fase 2: Health Check Otimizado

### Arquivo: `src/services/jobs/whatsapp-health-check-v2.job.ts`

```typescript
import { DRIVER_EVENT_WHATSAPP_DISCONNECTED, WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { notificationService } from "../notifications/notification.service.js";
import { whatsappService } from "../whatsapp.service.js";

interface HealthCheckResult {
    totalChecked: number;
    fixed: number;
    errors: number;
    notified: number;
    details: Array<{ 
        usuarioId: string, 
        oldStatus: string, 
        newStatus: string, 
        reason?: string,
        notificationSent?: boolean 
    }>;
}

// Circuit breaker para Evolution API
class CircuitBreaker {
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly threshold = 5;
    private readonly timeout = 60000; // 1 minuto

    isOpen(): boolean {
        if (this.failureCount >= this.threshold) {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.failureCount = 0;
                return false;
            }
            return true;
        }
        return false;
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
    }

    recordSuccess(): void {
        this.failureCount = 0;
    }
}

const circuitBreaker = new CircuitBreaker();

export const whatsappHealthCheckJobV2 = {
    async run(): Promise<HealthCheckResult> {
        logger.info("Starting WhatsApp Health Check Job (V2)...");

        const result: HealthCheckResult = {
            totalChecked: 0,
            fixed: 0,
            errors: 0,
            notified: 0,
            details: []
        };

        // 1. Verificar se circuit breaker está aberto
        if (circuitBreaker.isOpen()) {
            logger.warn("Circuit breaker aberto para Evolution API. Pulando health check.");
            return result;
        }

        // 2. Buscar todos os usuários supostamente conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, nome, telefone, whatsapp_status")
            .eq("whatsapp_status", WHATSAPP_STATUS.CONNECTED);

        if (error) {
            logger.error({ error }, "Health Check: Falha ao buscar usuários conectados.");
            circuitBreaker.recordFailure();
            throw error;
        }

        if (!usuarios || usuarios.length === 0) {
            logger.info("Health Check: Nenhum usuário conectado para verificar.");
            circuitBreaker.recordSuccess();
            return result;
        }

        result.totalChecked = usuarios.length;

        // 3. Iterar e Validar com retry logic
        for (const usuario of usuarios) {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            
            try {
                // Retry logic: até 3 tentativas com exponential backoff
                let apiStatus = null;
                let lastError = null;

                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        apiStatus = await whatsappService.getInstanceStatus(instanceName);
                        circuitBreaker.recordSuccess();
                        break;
                    } catch (err) {
                        lastError = err;
                        if (attempt < 2) {
                            // Exponential backoff: 100ms, 200ms
                            await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                        }
                    }
                }

                if (!apiStatus) {
                    throw lastError || new Error("Falha ao obter status após 3 tentativas");
                }

                // Mapeia status da API para status do DB
                let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;

                if (apiStatus.state === "open") {
                    realStatus = WHATSAPP_STATUS.CONNECTED;
                } else if (apiStatus.state === "connecting") {
                    realStatus = WHATSAPP_STATUS.CONNECTING;
                } else {
                    realStatus = WHATSAPP_STATUS.DISCONNECTED;
                }

                // Se houver discrepância, corrige o banco
                if (realStatus !== usuario.whatsapp_status) {
                    logger.warn({ 
                        usuarioId: usuario.id, 
                        dbStatus: usuario.whatsapp_status, 
                        apiStatus: apiStatus.state 
                    }, "Health Check: Discrepância encontrada. Corrigindo...");

                    await supabaseAdmin
                        .from("usuarios")
                        .update({ whatsapp_status: realStatus })
                        .eq("id", usuario.id);

                    // Se desconectou, avisa o motorista
                    if (realStatus === WHATSAPP_STATUS.DISCONNECTED && usuario.whatsapp_status === WHATSAPP_STATUS.CONNECTED) {
                        try {
                            if (usuario.telefone) {
                                await notificationService.notifyDriver(
                                    usuario.telefone, 
                                    DRIVER_EVENT_WHATSAPP_DISCONNECTED, 
                                    {
                                        nomeMotorista: usuario.nome || "Motorista",
                                        nomePlano: "N/A",
                                        valor: 0,
                                        dataVencimento: new Date().toISOString()
                                    }
                                );
                                result.notified++;
                                logger.info({ usuarioId: usuario.id }, "Health Check: Notificação de desconexão enviada.");
                            }
                        } catch (notifErr) {
                            logger.error({ 
                                usuarioId: usuario.id, 
                                error: notifErr 
                            }, "Health Check: Falha ao enviar notificação de desconexão.");
                        }
                    }

                    result.fixed++;
                    result.details.push({
                        usuarioId: usuario.id,
                        oldStatus: usuario.whatsapp_status,
                        newStatus: realStatus,
                        reason: `API returned ${apiStatus.state}`,
                        notificationSent: realStatus === WHATSAPP_STATUS.DISCONNECTED
                    });
                }

            } catch (err: any) {
                logger.error({ 
                    err: err.message, 
                    usuarioId: usuario.id 
                }, "Health Check: Erro ao verificar instância individual.");
                result.errors++;
                circuitBreaker.recordFailure();
            }
        }

        logger.info({ result }, "WhatsApp Health Check Job (V2) Finished.");
        return result;
    }
};
```

**Melhorias**:
- ✅ Retry logic com exponential backoff
- ✅ Circuit breaker para Evolution API
- ✅ Logging detalhado de falhas
- ✅ Tratamento de erro em notificações
- ✅ Métrica de notificações enviadas

---

## Fase 3: Migration SQL para Pairing Code

### Arquivo: `supabase/migrations/20260114_add_pairing_code_columns.sql`

```sql
-- Adicionar colunas de Pairing Code
ALTER TABLE "public"."usuarios" 
ADD COLUMN "pairing_code" VARCHAR(8),
ADD COLUMN "pairing_code_generated_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN "pairing_code_expires_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN "pairing_code_attempts" INT DEFAULT 0;

-- Criar índice para limpeza de códigos expirados
CREATE INDEX "idx_usuarios_pairing_code_expires_at" 
ON "public"."usuarios" ("pairing_code_expires_at") 
WHERE "pairing_code" IS NOT NULL;

-- Adicionar comentários
COMMENT ON COLUMN "public"."usuarios"."pairing_code" IS 'Código de pareamento de 8 dígitos (válido por ~60s)';
COMMENT ON COLUMN "public"."usuarios"."pairing_code_generated_at" IS 'Timestamp de geração do código';
COMMENT ON COLUMN "public"."usuarios"."pairing_code_expires_at" IS 'Timestamp de expiração do código';
COMMENT ON COLUMN "public"."usuarios"."pairing_code_attempts" IS 'Número de tentativas de uso do código';
```

---

## Fase 4: Heartbeat Job

### Arquivo: `src/services/jobs/whatsapp-heartbeat.job.ts`

```typescript
import { WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { whatsappService } from "../whatsapp.service.js";

interface HeartbeatResult {
    totalChecked: number;
    healthy: number;
    unhealthy: number;
    errors: number;
}

export const whatsappHeartbeatJob = {
    async run(): Promise<HeartbeatResult> {
        logger.info("Starting WhatsApp Heartbeat Job...");

        const result: HeartbeatResult = {
            totalChecked: 0,
            healthy: 0,
            unhealthy: 0,
            errors: 0
        };

        // Buscar usuários conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, whatsapp_status")
            .eq("whatsapp_status", WHATSAPP_STATUS.CONNECTED);

        if (error) {
            logger.error({ error }, "Heartbeat: Falha ao buscar usuários.");
            throw error;
        }

        if (!usuarios || usuarios.length === 0) {
            return result;
        }

        result.totalChecked = usuarios.length;

        // Fazer ping em cada instância
        for (const usuario of usuarios) {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            
            try {
                const status = await whatsappService.getInstanceStatus(instanceName);
                
                if (status.state === "open") {
                    result.healthy++;
                } else {
                    result.unhealthy++;
                    logger.warn({ 
                        usuarioId: usuario.id, 
                        state: status.state 
                    }, "Heartbeat: Instância não está saudável.");
                }
            } catch (err: any) {
                result.errors++;
                logger.error({ 
                    usuarioId: usuario.id, 
                    error: err.message 
                }, "Heartbeat: Erro ao fazer ping.");
            }
        }

        logger.info({ result }, "WhatsApp Heartbeat Job Finished.");
        return result;
    }
};
```

---

## Fase 5: Hook de Status do WhatsApp (Frontend)

### Arquivo: `src/hooks/api/useWhatsappStatus.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api/client";

export interface WhatsappStatus {
    instanceName: string;
    state: "open" | "close" | "connecting" | "UNKNOWN" | "NOT_FOUND";
    statusReason?: number;
}

export function useWhatsappStatus(enabled: boolean = true) {
    const { data, error, isLoading, refetch } = useQuery({
        queryKey: ["whatsappStatus"],
        queryFn: async () => {
            const response = await apiClient.get<WhatsappStatus>("/whatsapp/status");
            return response.data;
        },
        enabled,
        refetchInterval: 5000, // Poll a cada 5 segundos
        retry: 2,
        staleTime: 2000,
    });

    return {
        status: data,
        error,
        isLoading,
        refetch,
        isConnected: data?.state === "open",
        isConnecting: data?.state === "connecting",
        isDisconnected: data?.state === "close" || data?.state === "DISCONNECTED"
    };
}
```

---

## Fase 6: Retry Queue para Webhooks

### Arquivo: `src/queues/webhook-evolution.queue.ts`

```typescript
import { Queue, Worker } from "bullmq";
import { logger } from "../config/logger.js";
import { webhookEvolutionHandler } from "../services/handlers/webhook-evolution.handler.js";
import { redis } from "../config/redis.js";

interface WebhookJob {
    payload: any;
    attempt: number;
    maxAttempts: number;
}

const webhookQueue = new Queue<WebhookJob>("webhook-evolution", {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000 // 5 segundos
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

// Worker para processar webhooks
const webhookWorker = new Worker<WebhookJob>(
    "webhook-evolution",
    async (job) => {
        logger.info({ jobId: job.id, attempt: job.data.attempt }, "Processando webhook...");
        
        try {
            const result = await webhookEvolutionHandler.handle(job.data.payload);
            if (!result) {
                throw new Error("Handler retornou false");
            }
            logger.info({ jobId: job.id }, "Webhook processado com sucesso.");
            return result;
        } catch (err: any) {
            logger.error({ 
                jobId: job.id, 
                attempt: job.data.attempt,
                error: err.message 
            }, "Erro ao processar webhook.");
            
            if (job.data.attempt >= job.data.maxAttempts) {
                logger.error({ jobId: job.id }, "Webhook falhou após todas as tentativas.");
            }
            
            throw err;
        }
    },
    {
        connection: redis,
        concurrency: 5 // Processar até 5 webhooks em paralelo
    }
);

webhookWorker.on("failed", (job, err) => {
    logger.error({ 
        jobId: job?.id, 
        error: err.message 
    }, "Webhook job falhou permanentemente.");
});

export async function enqueueWebhook(payload: any): Promise<void> {
    try {
        await webhookQueue.add("webhook", {
            payload,
            attempt: 1,
            maxAttempts: 3
        });
    } catch (err: any) {
        logger.error({ error: err.message }, "Falha ao enfileirar webhook.");
        throw err;
    }
}

export { webhookQueue, webhookWorker };
```

---

## Fase 7: Timeout para Instância Travada

### Arquivo: `src/services/whatsapp.service.ts` (Modificação)

```typescript
async connectInstance(instanceName: string, phoneNumber?: string): Promise<ConnectInstanceResponse> {
    try {
        await this.createInstance(instanceName);

        if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/\D/g, "");
            const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
            
            const url = `${EVO_URL}/instance/connect/pairing/${instanceName}?number=${finalPhone}`;
            const { data } = await axios.get<{ code: string }>(url, { headers: { "apikey": EVO_KEY } });
            
            if (data?.code) {
                return { pairingCode: { code: data.code } };
            }
        }

        const url = `${EVO_URL}/instance/connect/${instanceName}`;
        const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: { "apikey": EVO_KEY } });

        if (data?.base64 || data?.qrcode?.base64) {
            return { 
                qrcode: { 
                    base64: (data.base64 || data.qrcode?.base64) as string,
                    code: data.code || data.qrcode?.code
                } 
            };
        }
        
        if (data?.instance?.state === WHATSAPP_STATUS.OPEN) {
            return { instance: { state: WHATSAPP_STATUS.OPEN } };
        }

        // ✅ NOVO: Timeout para instância travada em "connecting"
        if (data?.instance?.state === "connecting" || data?.instance?.state === WHATSAPP_STATUS.CONNECTING) {
            logger.warn({ instanceName }, "Instância em 'connecting'. Verificando timeout...");
            
            // Aguardar 30 segundos para ver se sai de "connecting"
            await new Promise(r => setTimeout(r, 30000));
            
            const retryUrl = `${EVO_URL}/instance/connectionState/${instanceName}`;
            const { data: retryData } = await axios.get<{ instance: EvolutionInstance }>(retryUrl, { 
                headers: { "apikey": EVO_KEY } 
            });
            
            // Se ainda estiver em "connecting", fazer logout forçado
            if (retryData?.instance?.state === "connecting") {
                logger.warn({ instanceName }, "Instância ainda em 'connecting' após 30s. Fazendo logout forçado...");
                await this.disconnectInstance(instanceName);
                
                // Tentar conectar novamente
                await new Promise(r => setTimeout(r, 1000));
                const finalUrl = `${EVO_URL}/instance/connect/${instanceName}`;
                const { data: finalData } = await axios.get<EvolutionConnectResponse>(finalUrl, { 
                    headers: { "apikey": EVO_KEY } 
                });
                
                if (finalData?.base64 || finalData?.qrcode?.base64) {
                    return { 
                        qrcode: { 
                            base64: (finalData.base64 || finalData.qrcode?.base64) as string,
                            code: finalData.code || finalData.qrcode?.code
                        } 
                    };
                }
            } else if (retryData?.instance?.state === "open") {
                return { instance: { state: WHATSAPP_STATUS.OPEN } };
            }
        }
        
        return {}; 
    } catch (error) {
        const err = error as AxiosError;
        logger.error({ err: err.response?.data || err.message, instanceName }, "Falha ao conectar instância");
        throw new Error("Falha ao gerar código de conexão.");
    }
}
```

---

## 📝 Resumo

| Fase | Arquivo | Linhas | Complexidade |
|------|---------|--------|-------------|
| 2 | `whatsapp-health-check-v2.job.ts` | ~150 | Média |
| 3 | `20260114_add_pairing_code_columns.sql` | ~20 | Baixa |
| 4 | `whatsapp-heartbeat.job.ts` | ~60 | Baixa |
| 5 | `useWhatsappStatus.ts` | ~30 | Baixa |
| 6 | `webhook-evolution.queue.ts` | ~80 | Média |
| 7 | Modificação em `whatsapp.service.ts` | ~40 | Média |

**Total**: ~380 linhas de código novo
