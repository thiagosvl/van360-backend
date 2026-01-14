# Código de Exemplo para Próximas Fases

Este documento fornece exemplos de código para as próximas fases de melhoria da integração do WhatsApp, facilitando a implementação.

## 1. Exemplo: Aumentar Frequência do Health Check (Fase 2)

Para aumentar a frequência do `whatsappHealthCheckJob`, você precisaria ajustar a configuração do agendador de tarefas (cron job) que dispara o `jobOrchestratorService`. Se você estiver usando GitHub Actions ou um cron externo, o ajuste seria lá. No `jobOrchestratorService.ts`, a lógica já está preparada para rodar a cada 5 minutos. Para 1 minuto, você ajustaria a condição:

```typescript
// src/services/jobs/job-orchestrator.service.ts

// ... (imports e outras lógicas)

    // Health Check: Roda a cada 1 minuto para corrigir estados travados
    if (minute % 1 === 0) { // Alterar de '5' para '1'
      executions.push(whatsappHealthCheckJob.run());
    }

// ... (restante do código)
```

## 2. Exemplo: Notificação de Desconexão (Fase 2)

Para notificar o motorista quando o WhatsApp desconecta, você modificaria o `whatsappHealthCheckJob.ts` para usar o `notificationService`.

```typescript
// src/services/jobs/whatsapp-health-check.job.ts

import { WHATSAPP_STATUS, DRIVER_EVENT_WHATSAPP_DISCONNECTED } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { whatsappService } from "../whatsapp.service.js";
import { notificationService } from "../notifications/notification.service.js"; // Importar o serviço de notificação

// ... (interface HealthCheckResult e outras lógicas)

export const whatsappHealthCheckJob = {
    async run(): Promise<HealthCheckResult> {
        // ... (código existente)

        for (const usuario of usuarios) {
            // ... (código existente para verificar status)

            // Se houver discrepância (DB diz Connected, API diz Disconnected), corrige o banco
            if (realStatus !== usuario.whatsapp_status && realStatus === WHATSAPP_STATUS.DISCONNECTED) {
                logger.warn({ 
                    usuarioId: usuario.id, 
                    dbStatus: usuario.whatsapp_status, 
                    realStatus,
                    apiState: apiStatus.state
                }, "Health Check: Discrepância encontrada. Corrigindo DB para DISCONNECTED.");

                await supabaseAdmin
                    .from("usuarios")
                    .update({ whatsapp_status: WHATSAPP_STATUS.DISCONNECTED })
                    .eq("id", usuario.id);

                // Notificar motorista que caiu!
                if (usuario.telefone) {
                    await notificationService.notifyDriver(
                        usuario.telefone, 
                        DRIVER_EVENT_WHATSAPP_DISCONNECTED, 
                        { nomeMotorista: usuario.nome || "Motorista" } // Contexto mínimo
                    );
                    logger.info({ usuarioId: usuario.id }, "Notificação de WhatsApp desconectado enviada.");
                }

                result.fixed++;
                result.details.push({
                    usuarioId: usuario.id,
                    oldStatus: usuario.whatsapp_status,
                    newStatus: realStatus,
                    reason: `API state: ${apiStatus.state}`
                });
            } // ... (restante do código)
        }
        return result;
    }
};
```

## 3. Exemplo: Timeout para Instâncias Travadas (Fase 3)

Para lidar com instâncias travadas no estado `connecting`, você pode adicionar uma lógica no `whatsappHealthCheckJob` para forçar a desconexão e exclusão após um certo tempo.

```typescript
// src/services/jobs/whatsapp-health-check.job.ts

// ... (imports e outras lógicas)

export const whatsappHealthCheckJob = {
    async run(): Promise<HealthCheckResult> {
        // ... (código existente)

        for (const usuario of usuarios) {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            
            try {
                // ... (lógica de retry existente)

                // Mapeia status da API para status do DB
                let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;

                if (apiStatus.state === "open") {
                    realStatus = WHATSAPP_STATUS.CONNECTED;
                } else if (apiStatus.state === "connecting") {
                    // SE ESTIVER CONNECTING: Dar uma chance (Timeout)
                    logger.warn({ instanceName }, "Health Check: Instance 'connecting'. Aguardando 10s...");
                    await new Promise(r => setTimeout(r, 10000));
                    
                    const retryStatus = await whatsappService.getInstanceStatus(instanceName);
                    
                    if (retryStatus.state === "open") {
                         realStatus = WHATSAPP_STATUS.CONNECTED;
                    } else {
                         // Se continuar connecting ou cair, consideramos DISCONNECTED.
                         // Se travou em connecting por muito tempo, melhor matar.
                         realStatus = WHATSAPP_STATUS.DISCONNECTED;
                         
                         // Lógica de Timeout para instâncias travadas em 'connecting'
                         // Se a instância ainda está 'connecting' após o retry, forçamos a limpeza.
                         if (retryStatus.state === "connecting") {
                            logger.warn({ instanceName }, "Health Check: Instance travada em 'connecting'. Limpando...");
                            await whatsappService.disconnectInstance(instanceName); // Logout
                            await whatsappService.deleteInstance(instanceName); // Delete
                            // O status será atualizado para DISCONNECTED e o usuário precisará reconectar.
                         }
                    }
                } else {
                    realStatus = WHATSAPP_STATUS.DISCONNECTED;
                }

                // ... (restante do código para atualizar DB e notificar)

            } catch (err: any) {
                // ... (tratamento de erro existente)
            }
        }
        return result;
    }
};
```

## 4. Exemplo: Countdown Visual e Re-geração Automática (Fase 4 - Frontend)

No frontend, você pode usar um `useEffect` com `setInterval` para criar um countdown e uma função para re-gerar o código.

```typescript
// src/components/Whatsapp/WhatsappConnect.tsx (Exemplo)

import { useEffect, useState } from "react";
import { useWhatsapp } from "../../hooks/useWhatsapp";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";

export function WhatsappConnect() {
  const { state, qrCode, pairingCode, isLoading, connect, disconnect, refresh, instanceName, requestPairingCode, userPhone } = useWhatsapp({ enablePolling: true });
  const [countdown, setCountdown] = useState(60); // 60 segundos
  const [showPairingInput, setShowPairingInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (state === "CONNECTED") {
      setCountdown(0); // Reseta countdown se conectado
      return;
    }

    if (qrCode || pairingCode) {
      setCountdown(60); // Inicia countdown quando um código é gerado
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Código expirou, solicitar novo automaticamente
            if (showPairingInput && phoneNumber) {
                requestPairingCode(phoneNumber);
            } else {
                connect(); // Re-gerar QR Code
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCountdown(0); // Sem código, sem countdown
    }
  }, [qrCode, pairingCode, state, connect, requestPairingCode, showPairingInput, phoneNumber]);

  const handleConnect = async () => {
    if (showPairingInput && phoneNumber) {
      await requestPairingCode(phoneNumber);
    } else {
      await connect();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {state === "CONNECTED" && (
        <p className="text-green-500 font-bold">WhatsApp Conectado! ✅</p>
      )}

      {state !== "CONNECTED" && (
        <>
          {isLoading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {!isLoading && (
            <>
              {showPairingInput ? (
                <div className="flex flex-col items-center gap-2">
                  <Input
                    placeholder="Seu número de WhatsApp (com DDD)"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <Button onClick={handleConnect} disabled={!phoneNumber || isLoading}>
                    {isLoading ? "Gerando Código..." : "Gerar Pairing Code"}
                  </Button>
                  {pairingCode && (
                    <div className="text-center mt-4">
                      <p className="text-lg font-semibold">Seu Pairing Code:</p>
                      <p className="text-2xl font-bold text-primary">{pairingCode.code}</p>
                      <p className="text-sm text-gray-500">Expira em {countdown} segundos</p>
                      <p className="text-sm text-gray-500 mt-2">Abra o WhatsApp, vá em Aparelhos Conectados > Conectar um Aparelho > Conectar com número de telefone e digite o código.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Button onClick={handleConnect} disabled={isLoading}>
                    {isLoading ? "Gerando QR Code..." : "Conectar com QR Code"}
                  </Button>
                  {qrCode && (
                    <div className="text-center mt-4">
                      <img src={`data:image/png;base64,${qrCode.base64}`} alt="QR Code" className="w-48 h-48 mx-auto" />
                      <p className="text-sm text-gray-500">Expira em {countdown} segundos</p>
                      <p className="text-sm text-gray-500 mt-2">Escaneie o QR Code com seu celular no WhatsApp.</p>
                    </div>
                  )}
                </div>
              )}
              <Button variant="link" onClick={() => setShowPairingInput(!showPairingInput)} className="mt-4">
                {showPairingInput ? "Prefiro QR Code" : "Prefiro Pairing Code"}
              </Button>
            </>
          )}
        </>
      )}

      {state === "DISCONNECTED" && !isLoading && (
        <Button onClick={handleConnect}>Reconectar WhatsApp</Button>
      )}

      {state === "ERROR" && !isLoading && (
        <p className="text-red-500">Erro na conexão. Tente novamente.</p>
      )}
    </div>
  );
}
```

## 5. Exemplo: Adicionar Colunas à Tabela `usuarios` (Fase 6)

Você precisaria criar uma nova migração no Supabase para adicionar as colunas. Exemplo de arquivo de migração:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_whatsapp_metadata_to_usuarios.sql

ALTER TABLE public.usuarios
ADD COLUMN whatsapp_instance_id TEXT,
ADD COLUMN whatsapp_last_connected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN whatsapp_last_disconnected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN whatsapp_pairing_code TEXT, -- Apenas para depuração, não para reuso
ADD COLUMN whatsapp_webhook_url TEXT;

-- Opcional: Adicionar índices para campos frequentemente consultados
CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_instance_id ON public.usuarios (whatsapp_instance_id);
```

E então, no `whatsapp.service.ts` e `webhook-evolution.handler.ts`, você precisaria atualizar essas colunas sempre que houver uma mudança de status ou geração de código. Por exemplo, no `webhook-evolution.handler.ts`:

```typescript
// src/services/handlers/webhook-evolution.handler.ts

// ... (imports e outras lógicas)

        // ... (lógica de mapeamento de status)

        await supabaseAdmin
            .from("usuarios")
            .update({
                whatsapp_status: dbStatus,
                whatsapp_last_connected_at: dbStatus === WHATSAPP_STATUS.CONNECTED ? new Date().toISOString() : null,
                whatsapp_last_disconnected_at: dbStatus === WHATSAPP_STATUS.DISCONNECTED ? new Date().toISOString() : null,
                // Outros campos podem ser atualizados aqui conforme necessário
            })
            .eq("id", usuarioId);

// ... (restante do código)
```
