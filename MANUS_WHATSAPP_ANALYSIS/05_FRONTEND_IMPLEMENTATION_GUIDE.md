# Guia de Implementação - Frontend (Fase 5)

## 📱 Objetivo
Implementar interface de conexão WhatsApp com suporte a Pairing Code e polling de status em tempo real.

## 🏗️ Arquitetura Proposta

```
Frontend
├── Hooks
│   ├── useWhatsappStatus.ts (novo)
│   └── useWhatsappConnect.ts (novo)
├── Components
│   ├── dialogs/
│   │   └── WhatsappConnectionDialog.tsx (novo)
│   └── features/
│       └── whatsapp/
│           ├── PairingCodeInput.tsx (novo)
│           ├── QRCodeDisplay.tsx (novo)
│           └── ConnectionStatus.tsx (novo)
├── Services
│   └── api/
│       └── whatsapp.api.ts (novo)
└── Types
    └── whatsapp.ts (novo)
```

## 📝 Implementação Detalhada

### 1. Types - `src/types/whatsapp.ts`

```typescript
export type WhatsappConnectionMethod = 'pairing' | 'qrcode';

export interface WhatsappStatus {
    instanceName: string;
    state: 'open' | 'close' | 'connecting' | 'UNKNOWN' | 'NOT_FOUND';
    statusReason?: number;
}

export interface PairingCodeResponse {
    pairingCode?: {
        code: string;
    };
    qrcode?: {
        base64: string;
        code?: string;
    };
    instance?: {
        state: string;
    };
}

export interface WhatsappConnectRequest {
    phoneNumber?: string;
    method?: WhatsappConnectionMethod;
}
```

### 2. API Service - `src/services/api/whatsapp.api.ts`

```typescript
import { apiClient } from "./client";

export const whatsappApi = {
    // Obter status da conexão
    getStatus: async () => {
        const response = await apiClient.get("/whatsapp/status");
        return response.data;
    },

    // Conectar com Pairing Code ou QR Code
    connect: async (phoneNumber?: string) => {
        const response = await apiClient.post("/whatsapp/connect", {
            phoneNumber
        });
        return response.data;
    },

    // Desconectar
    disconnect: async () => {
        const response = await apiClient.post("/whatsapp/disconnect");
        return response.data;
    }
};
```

### 3. Hook - `src/hooks/api/useWhatsappStatus.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { whatsappApi } from "@/services/api/whatsapp.api";
import { WhatsappStatus } from "@/types/whatsapp";

export function useWhatsappStatus(enabled: boolean = true) {
    const { data, error, isLoading, refetch } = useQuery({
        queryKey: ["whatsappStatus"],
        queryFn: whatsappApi.getStatus,
        enabled,
        refetchInterval: 5000, // Poll a cada 5 segundos
        retry: 2,
        staleTime: 2000,
    });

    return {
        status: data as WhatsappStatus | undefined,
        error,
        isLoading,
        refetch,
        isConnected: data?.state === "open",
        isConnecting: data?.state === "connecting",
        isDisconnected: data?.state === "close" || data?.state === "DISCONNECTED"
    };
}
```

### 4. Hook - `src/hooks/api/useWhatsappConnect.ts`

```typescript
import { useMutation } from "@tanstack/react-query";
import { whatsappApi } from "@/services/api/whatsapp.api";
import { PairingCodeResponse } from "@/types/whatsapp";

export function useWhatsappConnect() {
    const { mutate, mutateAsync, isPending, error, data, reset } = useMutation({
        mutationFn: async (phoneNumber?: string) => {
            return whatsappApi.connect(phoneNumber);
        },
        onError: (error: any) => {
            console.error("Erro ao conectar WhatsApp:", error);
        }
    });

    return {
        connect: mutate,
        connectAsync: mutateAsync,
        isLoading: isPending,
        error,
        response: data as PairingCodeResponse | undefined,
        reset,
        pairingCode: (data as PairingCodeResponse)?.pairingCode?.code,
        qrCode: (data as PairingCodeResponse)?.qrcode?.base64
    };
}
```

### 5. Component - `src/components/features/whatsapp/PairingCodeInput.tsx`

```typescript
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface PairingCodeInputProps {
    onSubmit: (phoneNumber: string) => void;
    isLoading?: boolean;
    error?: string;
}

export function PairingCodeInput({ onSubmit, isLoading, error }: PairingCodeInputProps) {
    const [phoneNumber, setPhoneNumber] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validar número
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        if (cleanPhone.length < 10 || cleanPhone.length > 13) {
            return;
        }

        onSubmit(cleanPhone);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Número de Telefone
                </label>
                <Input
                    type="tel"
                    placeholder="(11) 98765-4321"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isLoading}
                    className="text-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                    Digite seu número de telefone para receber o código de pareamento
                </p>
            </div>

            {error && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <Button
                type="submit"
                disabled={isLoading || phoneNumber.replace(/\D/g, "").length < 10}
                className="w-full"
            >
                {isLoading ? "Gerando código..." : "Gerar Código de Pareamento"}
            </Button>
        </form>
    );
}
```

### 6. Component - `src/components/features/whatsapp/QRCodeDisplay.tsx`

```typescript
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { AlertCircle, Copy, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QRCodeDisplayProps {
    base64: string;
    code?: string;
}

export function QRCodeDisplay({ base64, code }: QRCodeDisplayProps) {
    const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (code) {
            QRCode.toDataURL(code)
                .then(setQrCodeImage)
                .catch(() => setQrCodeImage(null));
        }
    }, [code]);

    const handleCopy = async () => {
        if (code) {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-4">
            {base64 && (
                <div className="flex justify-center">
                    <img
                        src={base64}
                        alt="QR Code"
                        className="w-48 h-48 border-2 border-gray-300 rounded-lg"
                    />
                </div>
            )}

            {qrCodeImage && (
                <div className="flex justify-center">
                    <img
                        src={qrCodeImage}
                        alt="QR Code"
                        className="w-48 h-48 border-2 border-gray-300 rounded-lg"
                    />
                </div>
            )}

            {code && (
                <div className="flex gap-2 items-center justify-center p-3 bg-gray-50 rounded-lg">
                    <code className="text-lg font-mono font-bold text-gray-900">
                        {code}
                    </code>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopy}
                        className="ml-2"
                    >
                        {copied ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                    Abra WhatsApp → Configurações → Dispositivos Vinculados → Vincular Dispositivo
                </p>
            </div>
        </div>
    );
}
```

### 7. Component - `src/components/features/whatsapp/ConnectionStatus.tsx`

```typescript
import { CheckCircle, AlertCircle, Loader } from "lucide-react";
import { WhatsappStatus } from "@/types/whatsapp";

interface ConnectionStatusProps {
    status: WhatsappStatus | undefined;
    isLoading?: boolean;
}

export function ConnectionStatus({ status, isLoading }: ConnectionStatusProps) {
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <Loader className="w-5 h-5 text-yellow-600 animate-spin" />
                <p className="text-sm text-yellow-700">Verificando conexão...</p>
            </div>
        );
    }

    if (!status) {
        return null;
    }

    if (status.state === "open") {
        return (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-700">WhatsApp conectado com sucesso!</p>
            </div>
        );
    }

    if (status.state === "connecting") {
        return (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-700">Conectando...</p>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-700">WhatsApp desconectado</p>
        </div>
    );
}
```

### 8. Dialog - `src/components/dialogs/WhatsappConnectionDialog.tsx`

```typescript
import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWhatsappConnect } from "@/hooks/api/useWhatsappConnect";
import { useWhatsappStatus } from "@/hooks/api/useWhatsappStatus";
import { PairingCodeInput } from "@/components/features/whatsapp/PairingCodeInput";
import { QRCodeDisplay } from "@/components/features/whatsapp/QRCodeDisplay";
import { ConnectionStatus } from "@/components/features/whatsapp/ConnectionStatus";

interface WhatsappConnectionDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function WhatsappConnectionDialog({
    isOpen,
    onOpenChange,
    onSuccess
}: WhatsappConnectionDialogProps) {
    const [countdown, setCountdown] = useState(60);
    const [method, setMethod] = useState<"pairing" | "qrcode">("pairing");

    const { connect, isLoading, error, pairingCode, qrCode } = useWhatsappConnect();
    const { status, isLoading: statusLoading } = useWhatsappStatus(isOpen);

    // Countdown para expiração de código
    useEffect(() => {
        if (!isOpen || !pairingCode) return;

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen, pairingCode]);

    // Fechar dialog quando conectar
    useEffect(() => {
        if (status?.state === "open") {
            setTimeout(() => {
                onOpenChange(false);
                onSuccess?.();
            }, 1500);
        }
    }, [status, onOpenChange, onSuccess]);

    const handleConnect = async (phoneNumber: string) => {
        setCountdown(60);
        await connect(phoneNumber);
    };

    const handleGenerateQR = async () => {
        setCountdown(60);
        await connect();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Conectar WhatsApp</DialogTitle>
                    <DialogDescription>
                        Escolha o método de conexão que preferir
                    </DialogDescription>
                </DialogHeader>

                <ConnectionStatus status={status} isLoading={statusLoading} />

                <Tabs value={method} onValueChange={(v: any) => setMethod(v)}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="pairing">Código (Recomendado)</TabsTrigger>
                        <TabsTrigger value="qrcode">QR Code</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pairing" className="space-y-4">
                        {!pairingCode ? (
                            <PairingCodeInput
                                onSubmit={handleConnect}
                                isLoading={isLoading}
                                error={error?.message}
                            />
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm font-medium text-green-900 mb-2">
                                        Seu código de pareamento:
                                    </p>
                                    <p className="text-3xl font-mono font-bold text-green-600 text-center mb-2">
                                        {pairingCode}
                                    </p>
                                    <p className="text-xs text-green-700 text-center">
                                        Válido por {countdown} segundos
                                    </p>
                                </div>

                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-blue-700">
                                        1. Abra WhatsApp no seu telefone<br/>
                                        2. Vá para Configurações → Dispositivos Vinculados<br/>
                                        3. Clique em "Vincular Dispositivo"<br/>
                                        4. Digite o código acima
                                    </p>
                                </div>

                                {countdown === 0 && (
                                    <button
                                        onClick={() => handleConnect("")}
                                        className="w-full px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                                    >
                                        Gerar novo código
                                    </button>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="qrcode" className="space-y-4">
                        {!qrCode ? (
                            <button
                                onClick={handleGenerateQR}
                                disabled={isLoading}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isLoading ? "Gerando QR Code..." : "Gerar QR Code"}
                            </button>
                        ) : (
                            <QRCodeDisplay base64={qrCode} code={qrCode} />
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
```

## 🔄 Integração no Layout

### Modificar `src/contexts/LayoutContext.tsx`

```typescript
import WhatsappConnectionDialog from "@/components/dialogs/WhatsappConnectionDialog";

// Adicionar ao LayoutContextType
interface LayoutContextType {
    // ... existing
    openWhatsappConnectionDialog: (options?: { onSuccess?: () => void }) => void;
    closeWhatsappConnectionDialog: () => void;
}

// Adicionar estado
const [whatsappDialogState, setWhatsappDialogState] = useState<{
    open: boolean;
    onSuccess?: () => void;
}>({ open: false });

// Adicionar funções
const openWhatsappConnectionDialog = (options?: { onSuccess?: () => void }) => {
    setWhatsappDialogState({
        open: true,
        onSuccess: options?.onSuccess
    });
};

const closeWhatsappConnectionDialog = () => {
    setWhatsappDialogState(prev => ({ ...prev, open: false }));
};

// Adicionar ao Provider value
// ... e ao JSX
<WhatsappConnectionDialog
    isOpen={whatsappDialogState.open}
    onOpenChange={(open) => {
        if (!open) closeWhatsappConnectionDialog();
    }}
    onSuccess={whatsappDialogState.onSuccess}
/>
```

## 📱 Uso no Componente

```typescript
import { useLayout } from "@/contexts/LayoutContext";

export function MyComponent() {
    const { openWhatsappConnectionDialog } = useLayout();

    return (
        <button
            onClick={() => openWhatsappConnectionDialog({
                onSuccess: () => {
                    // Fazer algo após conectar
                }
            })}
        >
            Conectar WhatsApp
        </button>
    );
}
```

## 🧪 Testes Recomendados

### Teste 1: Fluxo de Pairing Code
- [ ] Inserir número de telefone válido
- [ ] Receber código de 8 dígitos
- [ ] Verificar countdown de 60 segundos
- [ ] Digitar código no WhatsApp
- [ ] Conexão estabelecida

### Teste 2: Expiração de Código
- [ ] Gerar código
- [ ] Aguardar 65 segundos
- [ ] Verificar que countdown chegou a 0
- [ ] Botão "Gerar novo código" aparece

### Teste 3: QR Code
- [ ] Clicar em "QR Code"
- [ ] Gerar QR Code
- [ ] Escanear com câmera
- [ ] Conexão estabelecida

### Teste 4: Polling de Status
- [ ] Conectar WhatsApp
- [ ] Verificar que status muda para "open"
- [ ] Desconectar WhatsApp manualmente
- [ ] Verificar que status muda para "close" em até 5 segundos
- [ ] Dialog reabre automaticamente

## 📊 Métricas de Sucesso

- Taxa de conclusão: > 90%
- Tempo médio de conexão: < 30s
- Taxa de erro: < 5%
- Satisfação do usuário: > 4.5/5

---

**Próxima Fase**: Documentação e Deploy
