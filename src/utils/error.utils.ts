import axios from "axios";

interface PostgrestLikeError {
    message: string;
    details?: string | null;
    hint?: string | null;
    code?: string;
}

function isPostgrestError(err: unknown): err is PostgrestLikeError {
    return (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as Record<string, unknown>).message === "string" &&
        ("code" in err || "details" in err || "hint" in err)
    );
}

export function extractErrorMessage(error: unknown): string {
    if (!error) {
        return "Erro não especificado";
    }

    if (axios.isAxiosError(error)) {
        const status = error.response?.status ? `[HTTP ${error.response.status}] ` : "";
        const metaError = error.response?.data?.error;

        if (metaError && typeof metaError === "object") {
            const metaDetails = metaError.error_data?.details || metaError.message || JSON.stringify(metaError);
            const code = metaError.code ? `(#${metaError.code}) ` : "";
            return `${status}${code}${metaDetails}`;
        }

        if (error.response?.data) {
            const dataStr = typeof error.response.data === "string" 
                ? error.response.data 
                : JSON.stringify(error.response.data);
            return `${status}${dataStr}`;
        }

        return `${status}${error.message}`;
    }

    if (isPostgrestError(error)) {
        const code = error.code ? `[PG ${error.code}] ` : "";
        const details = error.details ? ` - ${error.details}` : "";
        const hint = error.hint ? ` (Dica: ${error.hint})` : "";
        return `${code}${error.message}${details}${hint}`;
    }

    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "object") {
        if ("message" in error && typeof (error as Record<string, unknown>).message === "string") {
            return (error as Record<string, unknown>).message as string;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    return String(error);
}
