import { createApp } from "../src/app.js";
let app = null;
// Handler para Vercel Serverless Functions
// A Vercel espera uma função que recebe req e res do Node.js padrão
export default async function handler(req, res) {
    try {
        // Singleton: reutilizar instância do Fastify entre requisições
        if (!app) {
            console.log("[Vercel Handler] Inicializando Fastify app...");
            try {
                app = await createApp();
                console.log("[Vercel Handler] Fastify app inicializado com sucesso");
            }
            catch (initError) {
                console.error("[Vercel Handler] Erro ao inicializar app:", initError);
                throw initError;
            }
        }
        // Verificar se o app foi inicializado corretamente
        if (!app || !app.server) {
            throw new Error("Fastify server not initialized");
        }
        // Processar a requisição através do servidor HTTP do Fastify
        // O Fastify precisa processar req/res do Node.js padrão
        return new Promise((resolve, reject) => {
            // Verificar se a resposta já foi enviada
            if (res.headersSent) {
                resolve();
                return;
            }
            let resolved = false;
            const cleanup = () => {
                if (resolved)
                    return;
                resolved = true;
                res.removeListener("finish", onFinish);
                res.removeListener("close", onClose);
                res.removeListener("error", onError);
            };
            const onFinish = () => {
                cleanup();
                resolve();
            };
            const onClose = () => {
                cleanup();
                resolve();
            };
            const onError = (err) => {
                cleanup();
                reject(err);
            };
            res.once("finish", onFinish);
            res.once("close", onClose);
            res.once("error", onError);
            // Timeout de segurança (25 segundos - Vercel tem limite de 30s)
            const timeout = setTimeout(() => {
                cleanup();
                if (!res.headersSent) {
                    res.statusCode = 504;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ error: "Request timeout" }));
                }
                resolve();
            }, 25000);
            // Processar a requisição através do servidor HTTP do Fastify
            // O método routing() do Fastify processa req/res do Node.js
            try {
                // Usar o servidor HTTP interno do Fastify para processar a requisição
                if (!app) {
                    clearTimeout(timeout);
                    cleanup();
                    throw new Error("Fastify app not initialized");
                }
                if (app.server) {
                    app.server.emit("request", req, res);
                }
                else {
                    clearTimeout(timeout);
                    cleanup();
                    throw new Error("Fastify server instance not available");
                }
            }
            catch (err) {
                clearTimeout(timeout);
                cleanup();
                throw err;
            }
        });
    }
    catch (error) {
        console.error("[Vercel Handler] Erro:", error);
        console.error("[Vercel Handler] Stack:", error instanceof Error ? error.stack : "No stack");
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : "Unknown error",
                // Em desenvolvimento, incluir stack trace
                ...(process.env.NODE_ENV !== "production" && error instanceof Error
                    ? { stack: error.stack }
                    : {}),
            }));
        }
    }
}
