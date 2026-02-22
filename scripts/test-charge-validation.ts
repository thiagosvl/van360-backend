
import "dotenv/config";
import { c6Service } from "../src/services/c6.service";

async function testChargeValidation() {
    const chave = process.argv[2] || "9500c3e5-5d83-41e8-98f6-5ab374b53748";
    
    console.log(`\n🧪 Testando validação via Cobrança (cob) para C6`);
    console.log(`🔑 Chave: ${chave}\n`);

    try {
        // Tenta criar uma cobrança imediata de 0.01 (Penny Drop inverso)
        // Usamos um UUID real para passar na validação do gerarTxid
        const cobrancaId = "12345678-1234-1234-1234-1234567890ab";
        const result = await c6Service.criarCobrancaImediata(cobrancaId, 0.01, {
            nome: "Thiago Barros",
            cpf: "39542391838"
        });
        
        console.log("✅ Sucesso ao criar cobrança! A chave é válida para este ClientID.");
        console.log("TxID:", result.txid);

        // Opcional: Cancelar a cobrança de teste
        await c6Service.cancelarCobranca(result.txid);
        console.log("🗑️ Cobrança de teste cancelada.");

    } catch (err: any) {
        console.log("\n❌ Falha ao criar cobrança!");
        if (err.response) {
            console.log("Status:", err.response.status);
            console.log("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("Erro:", err.message);
        }
    }
}

testChargeValidation().catch(console.error);
