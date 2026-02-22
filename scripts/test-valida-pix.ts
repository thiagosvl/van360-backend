import "dotenv/config";
import { env } from "../src/config/env";
import { c6Service } from "../src/services/c6.service";

async function testValidaChave() {
    const chave = process.argv[2] || "9500c3e5-5d83-41e8-98f6-5ab374b53748";
    
    console.log(`\n🔍 Testando validação da chave: ${chave}`);
    console.log(`🏦 Provider: C6 (API: ${env.C6_API_URL})`);
    console.log(`🔑 Client ID: ${env.C6_CLIENT_ID?.substring(0, 8)}...\n`);

    try {
        const result = await c6Service.validarChavePix(chave);
        console.log("✅ Sucesso!");
        console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
        console.log("\n❌ Falha na Validação!");
        if (err.response) {
            console.log("Status:", err.response.status);
            console.log("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("Erro:", err.message);
        }
    }
}

testValidaChave().catch(console.error);
