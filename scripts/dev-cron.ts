import * as dotenv from "dotenv";
import { resolve } from "path";
import { logger } from "../src/config/logger.js";
import { jobOrchestratorService } from "../src/services/jobs/job-orchestrator.service.js";
dotenv.config({ path: resolve(process.cwd(), ".env") }); // Força carregar da raiz do projeto

/**
 * Script utilitário para forçar a execução do Orchestrator de CRON Jobs localmente.
 * Executa exatamente a mesma lógica que o ping do GitHub Actions bate no /api/jobs/worker.
 */
async function runJobsLocally() {
    logger.info("=== 🚀 INICIANDO DISPARO FORÇADO DO CRON JOB (LOCAL) ===");
    try {
        const { paymentService } = await import("../src/services/payment.service.js");
        await paymentService.initialize();
        
        const result = await jobOrchestratorService.runWorker();
        logger.info({ result }, "✅ CICLO DO CRON JOB CONCLUÍDO!");
    } catch (error) {
        logger.error({ error }, "❌ Erro ao rodar simulador do cron local");
    } finally {
        // Necessário finalizar a execução ativamente para liberar o terminal do dev
        process.exit(0);
    }
}

runJobsLocally();
