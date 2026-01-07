import "dotenv/config";
import { notificationService } from "../src/services/notifications/notification.service.js";

async function testNotification() {
    console.log("🚀 Iniciando Teste de Notificação Avançada (Nova Arquitetura)...");

    const argPhone = process.argv[2];
    const telefoneTeste = argPhone ? argPhone.replace(/\D/g, "") : "5511951186951"; 

    console.log(`\n📞 Testando com número: ${telefoneTeste}`);
    
    // Payload Mock
    const mockCharge = {
        nomeResponsavel: "Arnaldo",
        nomePassageiro: "Lorena",
        nomeMotorista: "Tio Thiago",
        valor: 150.00,
        dataVencimento: "2026-02-10",
        diasAntecedencia: 5,
        pixPayload: "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913Cicrano de Tal6008Brasilia62070503***6304E2CA"
    };

    console.log("Tentando enviar para: " + telefoneTeste);
    
    // 1. Teste Aviso Vencimento (PASSENGER)
    console.log("\n--- Cenário: Aviso de Vencimento (Passenger) ---");
    const sentDue = await notificationService.notifyPassenger(
        telefoneTeste, 
        "DUE_SOON", 
        mockCharge
    );
    console.log("Resultado Vencimento:", sentDue ? "✅ Sucesso" : "❌ Falha");

    // 2. Poderíamos testar Driver também
    // console.log("\n--- Cenário: Ativação (Driver) ---");
    /*
    const sentDriver = await notificationService.notifyDriver(telefoneTeste, "ACTIVATION", {
        nomeMotorista: "Thiago Motorista",
        nomePlano: "Plano Profissional",
        valor: 199.90,
        dataVencimento: "2026-01-30",
        pixPayload: mockCharge.pixPayload
    });
    */
}

testNotification();
