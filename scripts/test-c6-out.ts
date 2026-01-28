import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";

// MOCK_MODE is inherited from process.env.PAYMENT_MOCK_MODE

const C6_API_URL = process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info";
const C6_CLIENT_ID = process.env.C6_CLIENT_ID || "";
const C6_CLIENT_SECRET = process.env.C6_CLIENT_SECRET || "";
const C6_CERT_PATH = process.env.C6_CERT_PATH || "";
const C6_KEY_PATH = process.env.C6_KEY_PATH || "";

// --- HTTPSAGENT COM mTLS ---
function getHttpsAgent(): https.Agent {
  const cert = fs.readFileSync(path.resolve(C6_CERT_PATH));
  const key = fs.readFileSync(path.resolve(C6_KEY_PATH));
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

// --- TOKEN MANAGEMENT ---
async function getAccessToken(): Promise<string> {
  if (process.env.PAYMENT_MOCK_MODE === "true") return "MOCK_TOKEN_C6_OUT";
  const response = await axios.post(
    `${C6_API_URL}/v1/auth/`,
    new URLSearchParams({
      client_id: C6_CLIENT_ID,
      client_secret: C6_CLIENT_SECRET,
      grant_type: "client_credentials"
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: getHttpsAgent()
    }
  );
  return response.data.access_token;
}

async function testC6Out() {
  console.log("🚀 INICIANDO TESTE DE PIX OUT C6 BANK (SCHEDULING)");
  
  const token = await getAccessToken();
  const headers = { 
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const httpsAgent = getHttpsAgent();
  const scheduleUrl = `${C6_API_URL}/v1/schedule_payments/`; // Adicionando barra final

  if (process.env.PAYMENT_MOCK_MODE === "true") {
    console.log("--- [MOCK] Modo Simulação Ativo (C6 Out) ---");
    console.log("PASSO 1: [MOCK] Validação de Chave OK");
    console.log("PASSO 2: [MOCK] Repasse Criado (ID: MOCK_GRP)");
    console.log("\n✅ Teste C6 Out (MOCK) finalizado!");
    return;
  }

  // 1. TESTE DE VALIDAÇÃO (ZERO-COST)
  console.log("\n--- [PASSO 1] Teste de Validação de Chave (Zero-Cost) ---");
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const transaction_date = tomorrow.toISOString().split("T")[0];

    const payload = {
      items: [{
        amount: 1.00,
        transaction_date,
        description: "Validacao de Teste",
        content: process.env.C6_PIX_KEY || "fa32fa2f-403c-4218-ae9e-ad1b145576af",
        beneficiary_name: "Motorista Teste",
        payer_name: "Van360 Empresa"
      }]
    };

    console.log("-> Enviando para /decode...");
    const { data: group } = await axios.post(`${scheduleUrl}decode`, payload, { 
      headers, 
      httpsAgent 
    });
    console.log("RESPOSTA DECODE:", JSON.stringify(group, null, 2));
    const groupId = group.group_id || group.id;
    console.log(`✅ Grupo criado: ${groupId}`);

    console.log("-> Aguardando 10s para pré-processamento...");
    await new Promise(r => setTimeout(r, 10000));

    const { data: itemsResponse } = await axios.get(`${scheduleUrl}${groupId}/items`, { headers, httpsAgent });
    console.log("RESPOSTA ITENS (Status Only):", itemsResponse.items?.map((i: any) => ({ status: i.status, error: i.error_message })));

    console.log("-> Deletando grupo temporário...");
    await axios.delete(`${scheduleUrl}${groupId}/items`, { headers, httpsAgent, data: [] });
    console.log("✅ Grupo deletado com sucesso. Validação concluída!");

  } catch (e: any) {
    console.error("❌ Erro no Passo 1:", e.response?.data || e.message);
  }

  // 2. TESTE DE REPASSE (REAL)
  console.log("\n--- [PASSO 2] Teste de Criação de Repasse (Aprovação Manual) ---");
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const transaction_date = tomorrow.toISOString().split("T")[0];

    const payload = {
      items: [{
        amount: 10.00,
        transaction_date,
        description: "Repasse de Teste Van360",
        content: process.env.C6_PIX_KEY || "fa32fa2f-403c-4218-ae9e-ad1b145576af",
        beneficiary_name: "Motorista Repasse",
        payer_name: "Van360 Empresa"
      }]
    };

    console.log("-> Enviando repasse para /decode...");
    const { data: group } = await axios.post(`${scheduleUrl}decode`, payload, { 
      headers, 
      httpsAgent 
    });
    console.log("RESPOSTA DECODE REPASSE:", JSON.stringify(group, null, 2));
    const groupId = group.group_id || group.id;
    console.log(`✅ Grupo criado: ${groupId}`);
    
    console.log("-> Aguardando 15s para processamento antes do submit...");
    await new Promise(r => setTimeout(r, 15000));

    console.log("-> Submetendo para /submit...");
    await axios.post(`${scheduleUrl}submit`, {
      group_id: groupId,
      uploader_name: "Thiago Teste"
    }, { headers, httpsAgent });
    console.log("✅ Grupo submetido!");
    console.log("\n[INSTRUÇÃO]: Entre no Web Banking C6 Sandbox e verifique o grupo pendente.");

  } catch (e: any) {
    console.error("❌ Erro no Passo 2:", e.response?.data || e.message);
  }
}

testC6Out().catch(console.error);
