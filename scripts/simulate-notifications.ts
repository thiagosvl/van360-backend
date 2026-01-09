import "dotenv/config";
import {
    DRIVER_EVENT_ACCESS_SUSPENDED,
    DRIVER_EVENT_REACTIVATION_EMBARGO,
    PASSENGER_EVENT_DUE_SOON,
    PASSENGER_EVENT_PAYMENT_RECEIVED
} from "../src/config/constants.js";
import { notificationService } from "../src/services/notifications/notification.service.js";

async function simulate() {
    const TEST_WHATSAPP = "5511951186951"; // Use o seu número para teste
    const PIX_MOCK = "00020101021226940014br.gov.bcb.pix2572pix-qr.itau.com.br/qr/v2/cobv/999999999999999999999999999999999";
    const RECIBO_MOCK = "https://raw.githubusercontent.com/thiagosvl/van-control/main/public/logo192.png"; // URL de exemplo

    console.log("🚀 Iniciando Simulação de Notificações...");

    // 1. MOTORISTA: Acesso Suspenso (Com PIX)
    console.log("- Enviando: Acesso Suspenso (Driver)");
    await notificationService.notifyDriver(TEST_WHATSAPP, DRIVER_EVENT_ACCESS_SUSPENDED as any, {
        nomeMotorista: "Thiago Barros",
        nomePlano: "Profissional",
        valor: 149.90,
        dataVencimento: "2026-01-10",
        pixPayload: PIX_MOCK
    });

    // 2. MOTORISTA: Reativação com Embargo
    console.log("- Enviando: Reativação com Embargo (Driver)");
    await notificationService.notifyDriver(TEST_WHATSAPP, DRIVER_EVENT_REACTIVATION_EMBARGO as any, {
        nomeMotorista: "Thiago Barros",
        nomePlano: "Profissional",
        mes: 1,
        ano: 2026,
        valor: 0,
        dataVencimento: "2026-01-10"
    });

    // 3. PASSAGEIRO: Vencimento em Breve (Com PIX)
    console.log("- Enviando: Vencimento em Breve (Passenger)");
    await notificationService.notifyPassenger(TEST_WHATSAPP, PASSENGER_EVENT_DUE_SOON as any, {
        nomeResponsavel: "Maria Oliveira",
        nomePassageiro: "Lucas",
        valor: 350.00,
        dataVencimento: "2026-01-10",
        nomeMotorista: "Thiago Barros",
        pixPayload: PIX_MOCK
    });

    // 4. PASSAGEIRO: Pagamento Recebido (Com Recibo - URL-only test)
    console.log("- Enviando: Pagamento Recebido (Passenger - URL test)");
    await notificationService.notifyPassenger(TEST_WHATSAPP, PASSENGER_EVENT_PAYMENT_RECEIVED as any, {
        nomeResponsavel: "Maria Oliveira",
        nomePassageiro: "Lucas",
        valor: 350.00,
        dataVencimento: "2026-01-10",
        nomeMotorista: "Thiago Barros",
        reciboUrl: RECIBO_MOCK,
        mes: 1,
        ano: 2026
    });

    console.log("✅ Simulação concluída. Verifique seu WhatsApp.");
}

simulate().catch(console.error);
