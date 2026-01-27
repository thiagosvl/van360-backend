import * as Sentry from "@sentry/node";
import { FastifyInstance } from "fastify";

export default async function debugRoutes(app: FastifyInstance) {
    app.get("/sentry", async () => {
        const error = new Error("Van360 Diagnostic Error @ " + new Date().toISOString());
        Sentry.captureException(error);
        throw error;
    });

    app.get("/log", async (request, reply) => {
        const msg = "Van360 Diagnostic Log @ " + new Date().toISOString();
        request.log.info({
            msg,
            diag: true,
            timestamp: new Date().toISOString()
        });
        return { 
            success: true, 
            message: "Log sent to Better Stack",
            detail: msg
        };
    });
    
    app.get("/ping", async () => {
        return { pong: true, time: new Date().toISOString() };
    });
}
