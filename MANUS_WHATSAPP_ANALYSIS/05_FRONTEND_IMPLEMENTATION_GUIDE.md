# Guia de Implementação Frontend para a Integração WhatsApp

Este guia detalha as implementações necessárias no frontend do Van360 para aprimorar a integração do WhatsApp, incluindo hooks, componentes e integração no layout.

## 1. Atualização do Hook `useWhatsapp`

O hook `useWhatsapp` foi modificado para incluir um mecanismo de polling, garantindo que o frontend receba atualizações de status mesmo que o webhook falhe. Além disso, ele agora gerencia o estado do QR Code e Pairing Code, incluindo a expiração.

**`src/hooks/useWhatsapp.ts`**

```typescript
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappApi } from "../services/api/whatsapp.api";
import { ConnectionState, WhatsappStatus } from "../types/enums";
import { useProfile } from "./business/useProfile";
import { useSession } from "./business/useSession";
import { useLayout } from "../contexts/LayoutContext";
import { supabase } from "../lib/supabase";

interface WhatsappHookOptions {
  enablePolling?: boolean;
}

export function useWhatsapp(options?: WhatsappHookOptions) {
  const queryClient = useQueryClient();
  const [localQrCode, setLocalQrCode] = useState<string | null>(null);
  const [localPairingCode, setLocalPairingCode] = useState<string | null>(null);
  
  const { user } = useSession();
  const { isProfissional } = useProfile(user?.id);
  
  let isPixKeyDialogOpen = false;
  try {
      /* eslint-disable-next-line react-hooks/rules-of-hooks */
      const layout = useLayout();
      isPixKeyDialogOpen = layout.isPixKeyDialogOpen;
  } catch (e) {
      // Ignore if outside layout
  }

  // Realtime listener for connection status
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("whatsapp_status_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "usuarios",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Consulta de Status
  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: whatsappApi.getStatus,
    enabled: !!user?.id && isProfissional && !isPixKeyDialogOpen,
    staleTime: options?.enablePolling ? 0 : 30000, // Se polling ativo, não usa cache
    refetchInterval: options?.enablePolling ? 5000 : false, // Polling a cada 5s se solicitado
    refetchOnWindowFocus: true,
  });

  const state = (statusData?.state || WhatsappStatus.UNKNOWN) as ConnectionState;
  const instanceName = statusData?.instanceName || null;

  const connect = async () => {
    setLocalQrCode(null);
    setLocalPairingCode(null);
    const response = await whatsappApi.connect();
    if (response?.qrcode?.base64) {
      setLocalQrCode(response.qrcode.base64);
    } else if (response?.pairingCode?.code) {
      setLocalPairingCode(response.pairingCode.code);
    }
    refetch();
  };

  const requestPairingCode = async (phoneNumber: string) => {
    setLocalQrCode(null);
    setLocalPairingCode(null);
    const response = await whatsappApi.requestPairingCode(phoneNumber);
    if (response?.pairingCode?.code) {
      setLocalPairingCode(response.pairingCode.code);
    } else if (response?.qrcode?.base64) {
      setLocalQrCode(response.qrcode.base64);
    }
    refetch();
  };

  const disconnect = async () => {
    await whatsappApi.disconnect();
    setLocalQrCode(null);
    setLocalPairingCode(null);
    refetch();
  };

  return {
    state,
    qrCode: localQrCode ? { base64: localQrCode } : null,
    pairingCode: localPairingCode ? { code: localPairingCode } : null,
    isLoading,
    connect,
    disconnect,
    refresh: refetch,
    instanceName,
    requestPairingCode,
    userPhone: user?.telefone || "",
  };
}
```
```

## 2. Atualização do Componente `WhatsappConnect`

O componente `WhatsappConnect` agora utiliza o `enablePolling` do hook `useWhatsapp` e inclui a lógica para exibir o Pairing Code ou QR Code, além de um countdown para a expiração.

**`src/components/Whatsapp/WhatsappConnect.tsx`**

```typescript
import { useEffect, useState } from "react";
import { useWhatsapp } from "../../hooks/useWhatsapp";
import { Button } from "../ui/button";
import { Input } from "../ui/input"; // Certifique-se de ter um componente Input
import { Loader2 } from "lucide-react";
import { WhatsappStatus } from "../../types/enums";

export function WhatsappConnect() {
  const { state, qrCode, pairingCode, isLoading, connect, disconnect, refresh, instanceName, requestPairingCode, userPhone } = useWhatsapp({ enablePolling: true });
  const [countdown, setCountdown] = useState(60); // 60 segundos
  const [showPairingInput, setShowPairingInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(userPhone || "");

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (state === WhatsappStatus.CONNECTED) {
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
      {state === WhatsappStatus.CONNECTED && (
        <p className="text-green-500 font-bold">WhatsApp Conectado! ✅</p>
      )}

      {state !== WhatsappStatus.CONNECTED && (
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

      {state === WhatsappStatus.DISCONNECTED && !isLoading && (
        <Button onClick={handleConnect}>Reconectar WhatsApp</Button>
      )}

      {state === WhatsappStatus.ERROR && !isLoading && (
        <p className="text-red-500">Erro na conexão. Tente novamente.</p>
      )}
    </div>
  );
}
```

## 3. Integração no Layout/Página de Assinatura

O componente `WhatsappConnect` deve ser integrado no diálogo ou na seção da página de assinatura onde o motorista gerencia a conexão do WhatsApp.

**`src/components/dialogs/WhatsappDialog.tsx` (Exemplo)**

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { WhatsappConnect } from "../Whatsapp/WhatsappConnect";
import { useWhatsapp } from "../../hooks/useWhatsapp";
import { WhatsappStatus } from "../../types/enums";

interface WhatsappDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsappDialog({ isOpen, onClose }: WhatsappDialogProps) {
  const { state } = useWhatsapp();

  // Fecha o diálogo automaticamente quando conectado
  useEffect(() => {
    if (state === WhatsappStatus.CONNECTED) {
      onClose();
    }
  }, [state, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <WhatsappConnect />
      </DialogContent>
    </Dialog>
  );
}
```

**`src/pages/Assinatura.tsx` (Exemplo de uso)**

```typescript
import { useState } from "react";
import { Button } from "../components/ui/button";
import { WhatsappDialog } from "../components/dialogs/WhatsappDialog";
import { useWhatsapp } from "../hooks/useWhatsapp";
import { WhatsappStatus } from "../types/enums";

export default function AssinaturaPage() {
  const [isWhatsappDialogOpen, setIsWhatsappDialogOpen] = useState(false);
  const { state: whatsappState, isLoading: whatsappLoading } = useWhatsapp();

  const handleOpenWhatsappDialog = () => {
    setIsWhatsappDialogOpen(true);
  };

  return (
    <div className="p-4">
      <h1>Página de Assinatura</h1>
      <p>Gerencie sua assinatura e conexão WhatsApp aqui.</p>

      <div className="mt-4">
        {whatsappLoading ? (
          <p>Carregando status do WhatsApp...</p>
        ) : whatsappState === WhatsappStatus.CONNECTED ? (
          <p className="text-green-600">WhatsApp Conectado ✅</p>
        ) : (
          <Button onClick={handleOpenWhatsappDialog}>
            Conectar WhatsApp
          </Button>
        )}
      </div>

      <WhatsappDialog
        isOpen={isWhatsappDialogOpen}
        onClose={() => setIsWhatsappDialogOpen(false)}
      />
    </div>
  );
}
```

## 4. Serviço de API do WhatsApp (Frontend)

Certifique-se de que o serviço de API no frontend tenha os métodos corretos para interagir com o backend.

**`src/services/api/whatsapp.api.ts`**

```typescript
import { api } from "./client";
import { ConnectionState, WhatsappStatus } from "../../types/enums";

interface QrCodeResponse {
  base64: string;
  code?: string;
}

interface PairingCodeResponse {
  code: string;
}

interface WhatsappConnectResponse {
  qrcode?: QrCodeResponse;
  pairingCode?: PairingCodeResponse;
  instance?: { state: ConnectionState };
}

interface WhatsappStatusResponse {
  state: ConnectionState;
  instanceName: string;
}

export const whatsappApi = {
  async connect(): Promise<WhatsappConnectResponse | null> {
    try {
      const response = await api.post<WhatsappConnectResponse>("/whatsapp/connect");
      return response.data;
    } catch (error) {
      console.error("Erro ao solicitar conexão do WhatsApp", error);
      return null;
    }
  },

  async requestPairingCode(phoneNumber: string): Promise<WhatsappConnectResponse | null> {
    try {
      const response = await api.post<WhatsappConnectResponse>("/whatsapp/pairing-code", { phoneNumber });
      return response.data;
    } catch (error) {
      console.error("Erro ao solicitar pairing code do WhatsApp", error);
      return null;
    }
  },

  async disconnect(): Promise<boolean> {
    try {
      await api.post("/whatsapp/disconnect");
      return true;
    } catch (error) {
      console.error("Erro ao desconectar WhatsApp", error);
      return false;
    }
  },

  async getStatus(): Promise<WhatsappStatusResponse> {
    try {
      const response = await api.get<WhatsappStatusResponse>("/whatsapp/status");
      return response.data;
    } catch (error) {
      console.error("Erro ao obter status do WhatsApp", error);
      return { state: WhatsappStatus.UNKNOWN, instanceName: "" };
    }
  },
};
```
