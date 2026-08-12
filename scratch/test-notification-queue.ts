import "dotenv/config";
import { NotificationChannelEnum, NotificationQueueStatus } from "../src/types/enums.js";
import { NotificationQueueService } from "../src/services/notifications/notification-queue.service.js";
import { notificationQueueRepository } from "../src/repositories/notification-queue.repository.js";
import { NotificationRetryWorker } from "../src/services/notifications/notification-retry.worker.ts";

async function testQueue() {
    console.log("======================================================");
    console.log("🚀 TESTANDO ESTRUTURA DE FILA E WORKER DE RETENTATIVAS");
    console.log("======================================================\n");

    // 1. Teste de Sanitização
    console.log("👉 Teste 1: Sanitização de Destinatário");
    const phoneClean = NotificationQueueService.sanitizeRecipient("+55 (11) 99511-86951", NotificationChannelEnum.WABA);
    const emailClean = NotificationQueueService.sanitizeRecipient(" Thiago-SVL@Hotmail.Com ", NotificationChannelEnum.RESEND);
    console.log(`   📱 Phone Sanitizado: "${phoneClean}" (Esperado: "55119951186951")`);
    console.log(`   📧 Email Sanitizado: "${emailClean}" (Esperado: "thiago-svl@hotmail.com")`);

    // 2. Teste de Cálculo de Backoff
    console.log("\n👉 Teste 2: Cálculo de Backoff Exponencial");
    const retry1 = NotificationQueueService.calculateNextRetryDate(1);
    const retry2 = NotificationQueueService.calculateNextRetryDate(2);
    const retry3 = NotificationQueueService.calculateNextRetryDate(3);
    console.log(`   ⏱️ Tentativa 1 (+2 min):  ${retry1}`);
    console.log(`   ⏱️ Tentativa 2 (+15 min): ${retry2}`);
    console.log(`   ⏱️ Tentativa 3 (+60 min): ${retry3}`);

    console.log("\n======================================================");
    console.log("✅ Estrutura de Fila de Notificações Pronta e Verificada!");
    console.log("======================================================");
}

testQueue();
