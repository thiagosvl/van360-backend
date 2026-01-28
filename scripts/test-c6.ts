
import "dotenv/config";
import fs from "fs";
import path from "path";

// Force Real Mode for Test BEFORE importing service
process.env.PAYMENT_MOCK_MODE = "false"; 

async function verifyFiles() {
    console.log("📂 Verificando arquivos de certificado...");
    
    // Check Env
    console.log("Env C6_CERT_PATH:", process.env.C6_CERT_PATH);
    console.log("Env C6_KEY_PATH:", process.env.C6_KEY_PATH);

    if (process.env.C6_CERT_PATH) {
        const p = path.resolve(process.env.C6_CERT_PATH);
        console.log(`   -> Cert Path Resolvido: ${p}`);
        console.log(`   -> Existe? ${fs.existsSync(p) ? "SIM" : "NÃO"}`);
        if(fs.existsSync(p)) console.log(`   -> Tamanho: ${fs.statSync(p).size} bytes`);
    } else {
        console.log("   -> C6_CERT_PATH não definido no .env");
    }

    if (process.env.C6_KEY_PATH) {
         const p = path.resolve(process.env.C6_KEY_PATH);
         console.log(`   -> Key Path Resolvido: ${p}`);
         console.log(`   -> Existe? ${fs.existsSync(p) ? "SIM" : "NÃO"}`);
         if(fs.existsSync(p)) console.log(`   -> Tamanho: ${fs.statSync(p).size} bytes`);
    } else {
        console.log("   -> C6_KEY_PATH não definido no .env");
    }
}

async function testConnectivity() {
  await verifyFiles();

  // Dynamic import to respect process.env change above (Hoisting prevention)
  const { c6Service } = await import("../src/services/c6.service");

  console.log("\n🚀 Iniciando Teste de Conectividade C6 Bank (REAL MODE)...");
  
  try {
    console.log("1. Tentando Autenticação (Get Token)...");
    const token = await c6Service.getAccessToken();
    console.log("✅ Token Obtido com sucesso!");
    console.log("   Token (parcial):", token.substring(0, 20) + "...");

    // 2. Criar Cobrança Imediata (Real Probe)
    console.log("\n2. Tentando Criar Cobrança Imediata (PUT /v2/pix/cob/:txid)...");
    
    // TxID deve ter 26 a 35 caracteres (Alfa numérico)
    // Gerar string aleatória de 32 chars
    const txid = "teste" + Date.now() + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const validTxid = txid.replace(/[^a-zA-Z0-9]/g, "").substring(0, 32);

    console.log("   TxID Gerado:", validTxid);
    
    // Payload Básico Bacen
    const result = await c6Service.criarCobrancaImediata(validTxid, 5.50);
    
    console.log("✅ Cobrança Criada com Sucesso!");
    console.log("   TxID:", result.txid);
    console.log("   Location:", result.location);
    console.log("   Copia e Cola:", result.pixCopiaECola);

  } catch (error: any) {
    console.error("\n❌ ERRO DETALHADO:");
    if (error.response) {
       console.error("   Status HTTP:", error.response.status);
       console.error("   Headers:", JSON.stringify(error.response.headers, null, 2));
       console.error("   Data (Body):", JSON.stringify(error.response.data, null, 2));
    } else {
       console.error("   Mensagem:", error.message);
       console.error("   Código:", error.code);
       if (error.config) {
           console.error("   URL Tentada:", error.config.url);
           console.error("   Método:", error.config.method);
       }
    }
  }
}

testConnectivity();
