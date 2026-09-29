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

export function extractErrorStack(error: unknown): string {
    if (error instanceof Error && error.stack) {
        const lines = error.stack.split("\n").slice(0, 5).join("\n");
        return lines.slice(0, 350);
    }

    if (axios.isAxiosError(error)) {
        const method = error.config?.method?.toUpperCase() || "REQUEST";
        const url = error.config?.url || "unknown";
        const responseData = typeof error.response?.data === "object"
            ? JSON.stringify(error.response?.data).slice(0, 250)
            : String(error.response?.data || "").slice(0, 250);
        return `Axios Error [${method} ${url}]\nData: ${responseData}`;
    }

    if (isPostgrestError(error)) {
        const parts: string[] = [];
        if (error.code) parts.push(`Code: ${error.code}`);
        if (error.details) parts.push(`Details: ${error.details}`);
        if (error.hint) parts.push(`Hint: ${error.hint}`);
        if (parts.length > 0) return parts.join("\n");
    }

    if (typeof error === "object" && error !== null) {
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.stack === "string") {
            return errObj.stack.split("\n").slice(0, 5).join("\n").slice(0, 350);
        }
        try {
            return JSON.stringify(error, null, 2).slice(0, 350);
        } catch {
            return String(error);
        }
    }

    return "Sem stack trace disponível";
}
