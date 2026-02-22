import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";

// --- CONFIGURAÇÕES ---
const C6_API_URL = process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info";
const C6_PIX_KEY = process.env.C6_PIX_KEY || "";
const C6_CLIENT_ID = process.env.C6_CLIENT_ID || "";
const C6_CLIENT_SECRET = process.env.C6_CLIENT_SECRET || "";
const C6_CERT_PATH = process.env.C6_CERT_PATH || "";
const C6_KEY_PATH = process.env.C6_KEY_PATH || "";

// URL CANÔNICA (Proposta profissional)
const WEBHOOK_URL = process.env.C6_WEBHOOK_URL || "https://api.van360.com.br/api/webhook/pagamento/c6";

async function getHttpsAgent() {
  const certPath = path.resolve(C6_CERT_PATH);
  const keyPath = path.resolve(C6_KEY_PATH);

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(`Certificados não encontrados em: ${certPath} ou ${keyPath}`);
  }

  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  return new https.Agent({
    cert,
    key,
    rejectUnauthorized: false // Em sandbox/homologação costuma ser necessário
  });
}

async function getAccessToken(agent: https.Agent): Promise<string> {
  const url = `${C6_API_URL}/v1/auth/`;
  const body = new URLSearchParams({
    client_id: C6_CLIENT_ID,
    client_secret: C6_CLIENT_SECRET,
    grant_type: "client_credentials"
  });

  const { data } = await axios.post(url, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    httpsAgent: agent
  });

  return data.access_token;
}

async function run() {
  console.log("🚀 Iniciando Registro de Webhook C6 (Padrão Profissional)");
  console.log(`📍 Alvo: ${C6_API_URL}`);
  console.log(`🔗 URL Webhook: ${WEBHOOK_URL}`);
  console.log(`🔑 Chave PIX: ${C6_PIX_KEY}`);

  try {
    const agent = await getHttpsAgent();
    const token = await getAccessToken(agent);
    const headers = { Authorization: `Bearer ${token}` };

    const chaveEncoded = encodeURIComponent(C6_PIX_KEY);
    const urlCheck = `${C6_API_URL}/v2/pix/webhook/${chaveEncoded}`;

    console.log("\n1️⃣ Verificando webhooks existentes...");
    let existingUrl = null;
    try {
      const { data } = await axios.get(urlCheck, { headers, httpsAgent: agent });
      existingUrl = data.webhookUrl;
      console.log(`   - Webhook atual: ${existingUrl || "Nenhum"}`);
    } catch (err: any) {
      if (err.response?.status === 404) {
        console.log("   - Nenhum webhook encontrado para esta chave.");
      } else {
        console.warn("   - Erro ao consultar webhook (pode não existir):", err.response?.data || err.message);
      }
    }

    if (existingUrl === WEBHOOK_URL) {
      console.log("\n✅ Webhook já está configurado corretamente. Nada a fazer.");
      return;
    }

    if (existingUrl) {
      console.log(`\n2️⃣ Removendo webhook antigo: ${existingUrl}`);
      // No padrão BACEN v2, o DELETE costuma ser no mesmo endpoint da chave
      try {
        await axios.delete(urlCheck, { headers, httpsAgent: agent });
        console.log("   - Webhook antigo removido com sucesso.");
      } catch (err: any) {
        console.warn("   - Falha ao remover (pode não ser suportado via DELETE):", err.response?.data || err.message);
        console.log("   - Prosseguindo para SOBRESCREVER via PUT...");
      }
    }

    console.log(`\n3️⃣ Registrando novo webhook: ${WEBHOOK_URL}`);
    const payload = { webhookUrl: WEBHOOK_URL };
    
    // PUT é o padrão para registrar/atualizar no BACEN v2
    await axios.put(urlCheck, payload, { headers, httpsAgent: agent });
    
    console.log("\n✅ Webhook C6 registrado com sucesso!");
    console.log("--------------------------------------------------");
    console.log("IMPORTANTE: Certifique-se que o seu NGROK ou Servidor");
    console.log("está aceitando requisições POST em:");
    console.log(`${WEBHOOK_URL}`);
    console.log("--------------------------------------------------");

  } catch (err: any) {
    console.error("\n❌ Erro crítico no registro:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Dados:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Mensagem:", err.message);
    }
    process.exit(1);
  }
}

run();
