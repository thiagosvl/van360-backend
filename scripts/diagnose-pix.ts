import { randomUUID } from "crypto";
import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import { interService } from "../src/services/inter.service.js";

async function run() {
  console.log("=== DIAGNÓSTICO PIX INICIADO ===");
  console.log("1. Configurações:");
  console.log(`- INTER_API_URL: ${process.env.INTER_API_URL}`);
  console.log(`- INTER_MOCK_MODE: ${process.env.INTER_MOCK_MODE}`);
  console.log(`- PIX Key (Origem): ${process.env.INTER_PIX_KEY}`);
  console.log(`- Certificado: ${process.env.INTER_CERT_PATH}`);
  console.log(`- Chave: ${process.env.INTER_KEY_PATH}`);
  
  try {
    console.log("\n2. Testando Autenticação (Get Token)...");
    // O supabaseAdmin aqui vai tentar conectar no banco. Se falhar, saberemos.
    const token = await interService.getValidInterToken(supabaseAdmin);
    console.log("✅ Token obtido com sucesso:", token.substring(0, 10) + "...");
  } catch (error: any) {
    console.error("❌ Erro ao obter token:", error.message);
    if (error.response) console.error("Detalhes API:", error.response.data);
    process.exit(1);
  }

  const chaveDestino = "39542391838"; // CPF do print
  console.log(`\n3. Tentando enviar R$ 0,01 para ${chaveDestino}...`);

  try {
      const result = await interService.realizarPagamentoPix(supabaseAdmin, {
          valor: 0.01,
          chaveDestino: chaveDestino,
          descricao: "Teste Diagnostico Van360",
          xIdIdempotente: randomUUID()
      });
      console.log("✅ Pagamento enviado com sucesso!");
      console.log("Resultado:", result);
  } catch (error: any) {
      console.error("❌ Erro ao enviar pagamento:", error.message);
      if (error.response) {
          console.error("Detalhes da API:", JSON.stringify(error.response.data, null, 2));
      }
  }
}

run();
