import "dotenv/config";
import { whatsappService } from "../src/services/whatsapp.service.js";

async function testWhatsapp() {
    console.log("=== TESTE WHATSAPP INTEGRATION ===");
    
    // Substitua pelo número que deseja testar (se não passar argumento, tenta ler de env ou usa um default)
    // Para teste seguro, vamos pedir para o usuário editar este arquivo ou passar via args se fosse CLI, 
    // mas hardcoded aqui para o user ver onde mudar.
    
    // IMPORTANTE: Numero com DDD (Ex: 5511999999999)
    const targetNumber = process.argv[2] || "5511951186951"; // Default do seu teste anterior

    console.log(`Enviando mensagem para: ${targetNumber}`);
    
    const message = "Olá! Teste automatizado do Backend Van360 via Service 🚀";

    const success = await whatsappService.sendText(targetNumber, message);

    if (success) {
        console.log("✅ Mensagem enviada com sucesso!");
    } else {
        console.error("❌ Falha ao enviar mensagem. Verifique os logs.");
    }
}

testWhatsapp();
