
import "dotenv/config";
import { env } from "../src/config/env";
import { c6Service } from "../src/services/c6.service";

async function testRepasseReal() {
    // Vamos tentar simular o INÍCIO de um repasse de 1 centavo
    // Para uma chave qualquer (pode ser a sua mesma de teste)
    const chaveDestino = "9500c3e5-5d83-41e8-98f6-5ab374b53748"; 
    
    console.log(`\n💸 Testando INÍCIO DE REPASSE (PIX OUT) no C6`);
    console.log(`🏦 API: ${env.C6_API_URL}`);
    console.log(`🎯 Destino: ${chaveDestino}\n`);

    try {
        // Esta função chama o /schedule_payments/decode e depois o /submit
        // É exatamente o fluxo que o sistema usa para pagar motoristas
        const result = await c6Service.realizarPagamentoPix({
            valor: 0.01,
            chaveDestino: chaveDestino,
            descricao: "Teste de Permissao Van360",
            xIdIdempotente: "TESTE-PERM-" + Date.now()
        });

        console.log("✅ MILAGRE! O banco aceitou o agendamento.");
        console.log("Status:", result.status);
        console.log("Mensagem:", result.msg);
        console.log("\nSe você chegou aqui, a permissão EXISTE e você verá esse agendamento no seu App para aprovar.");

    } catch (err: any) {
        console.log("\n❌ FALHA NO REPASSE!");
        if (err.response) {
            console.log("Status do Banco:", err.response.status);
            console.log("Resposta do Banco:", JSON.stringify(err.response.data, null, 2));
            
            if (err.response.status === 403) {
                console.log("\n📢 CONCLUSÃO: O erro 403 confirma que sua API NÃO TEM permissão de 'Schedule Payments'.");
                console.log("Aquelas 10 permissões que você listou são só para RECEBER (Pix In).");
                console.log("Para o repasse funcionar, você precisa pedir ao C6 a permissão de 'PAGAMENTOS AGENDADOS'.");
            }
        } else {
            console.error("Erro Técnico:", err.message);
        }
    }
}

testRepasseReal().catch(console.error);
