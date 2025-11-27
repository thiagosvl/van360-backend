// Handler para Vercel Serverless Functions
// Este arquivo é o ponto de entrada para a Vercel
// Na Vercel, as variáveis de ambiente são injetadas automaticamente
import { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../src/app.js";

let app: Awaited<ReturnType<typeof createApp>> | null = null;

// Handler para Vercel Serverless Functions
// A Vercel espera uma função que recebe req e res do Node.js padrão
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    // Singleton: reutilizar instância do Fastify entre requisições
    if (!app) {
      app = await createApp();
    }

    // Processar a requisição através do servidor HTTP do Fastify
    await new Promise<void>((resolve, reject) => {
      if (res.headersSent) {
        resolve();
        return;
      }

      if (app?.server) {
        app.server.emit("request", req, res);

        res.once("finish", resolve);
        res.once("close", resolve);

        // Timeout de segurança (30 segundos)
        setTimeout(() => {
          if (!res.headersSent) {
            reject(new Error("Request timeout"));
          } else {
            resolve();
          }
        }, 30000);
      } else {
        reject(new Error("Fastify server not initialized"));
      }
    });
  } catch (error) {
    console.error("Error in handler:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }
}

