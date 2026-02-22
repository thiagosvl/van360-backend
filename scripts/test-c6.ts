import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";

// MOCK_MODE is inherited from process.env.PAYMENT_MOCK_MODE

// --- CONFIGURAÇÕES ---
const C6_API_URL = process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info";
const C6_PIX_KEY = process.env.C6_PIX_KEY || "";
const C6_CLIENT_ID = process.env.C6_CLIENT_ID || "";
const C6_CLIENT_SECRET = process.env.C6_CLIENT_SECRET || "";
const C6_CERT_PATH = process.env.C6_CERT_PATH || "";
const C6_KEY_PATH = process.env.C6_KEY_PATH || "";

// Webhook URL - Use ngrok para testes locais ou sua URL de produção
// Exemplo ngrok: https://abc123.ngrok.io/api/pagamento/webhook/c6
const WEBHOOK_URL = process.env.C6_WEBHOOK_URL || "https://api.van360.com.br/api/webhook/pagamento/c6";

// Devedor Dummy (CPF Válido para testes)
const DEVEDOR_DUMMY = {
  cpf: "12345678909", // CPF válido para testes (gerador de CPF)
  nome: "Fulano de Tal Homologação"
};

// --- HTTPSAGENT COM mTLS ---
let _httpsAgent: https.Agent | null = null;

function getHttpsAgent(): https.Agent {
  if (_httpsAgent) return _httpsAgent;

  const certPath = path.resolve(C6_CERT_PATH);
  const keyPath = path.resolve(C6_KEY_PATH);

  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  _httpsAgent = new https.Agent({
    cert,
    key,
    rejectUnauthorized: false
  });

  return _httpsAgent;
}

// --- TOKEN MANAGEMENT ---
let cachedToken: string | null = null;

async function getAccessToken(): Promise<string> {
  if (process.env.PAYMENT_MOCK_MODE === "true") return "MOCK_TOKEN_C6";
  if (cachedToken) return cachedToken;

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

  cachedToken = response.data.access_token;
  return cachedToken!;
}

// --- HELPER: Gerar TxID Único (26-35 chars alfanuméricos) ---
function gerarTxId(prefixo: string = "hom"): string {
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 10);
  const random2 = Math.random().toString(36).substring(2, 10);
  const txid = `${prefixo}${timestamp}${random1}${random2}`.replace(/[^a-zA-Z0-9]/g, "");
  // Garantir pelo menos 26 caracteres e no máximo 35
  return txid.substring(0, 32).padEnd(26, "x");
}

// --- HELPER: Data futura ISO ---
function getDataFutura(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// --- HELPER: Data ISO para filtros ---
function getDataISO(diasOffset: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + diasOffset);
  return d.toISOString();
}

// --- OUTPUT FORMATADO ---
function logPasso(passo: string, titulo: string, metodo: string, url: string, txid: string | null, resposta: any) {
  console.log("\n========================================");
  console.log(`[PASSO ${passo}] - ${titulo}`);
  console.log("----------------------------------------");
  console.log(`REQ (Resumo): ${metodo} ${url}`);
  if (txid) console.log(`TXID Usado: ${txid}`);
  console.log("----------------------------------------");
  console.log("RESPOSTA (Copiar para Doc):");
  console.log(JSON.stringify(resposta, null, 2));
  console.log("========================================\n");
}

function logErro(passo: string, titulo: string, erro: any) {
  console.log("\n========================================");
  console.log(`[PASSO ${passo}] - ${titulo} ❌ ERRO`);
  console.log("----------------------------------------");
  if (erro.response) {
    console.log("Status:", erro.response.status);
    console.log("Data:", JSON.stringify(erro.response.data, null, 2));
  } else {
    console.log("Mensagem:", erro.message);
  }
  console.log("========================================\n");
}

// --- VERIFICAÇÃO DE ARQUIVOS ---
async function verifyFiles() {
  console.log("📂 Verificando arquivos de certificado...");
  console.log("   C6_CERT_PATH:", C6_CERT_PATH);
  console.log("   C6_KEY_PATH:", C6_KEY_PATH);
  console.log("   C6_API_URL:", C6_API_URL);
  console.log("   C6_PIX_KEY:", C6_PIX_KEY);

  if (!C6_CERT_PATH || !C6_KEY_PATH) {
    throw new Error("❌ Certificados não configurados no .env");
  }

  const certExists = fs.existsSync(path.resolve(C6_CERT_PATH));
  const keyExists = fs.existsSync(path.resolve(C6_KEY_PATH));

  if (!certExists || !keyExists) {
    throw new Error("❌ Arquivos de certificado não encontrados");
  }

  console.log("✅ Certificados OK!\n");
}

// ============================================================
// FUNÇÃO PRINCIPAL DE HOMOLOGAÇÃO
// ============================================================
async function executarHomologacaoPix() {
  await verifyFiles();

  console.log("🚀 INICIANDO ROTEIRO DE HOMOLOGAÇÃO PIX C6 BANK");
  console.log("   Data/Hora:", new Date().toISOString());
  console.log("   Ambiente:", C6_API_URL.includes("sandbox") ? "SANDBOX" : "PRODUÇÃO");
  console.log("\n");

  // Obter token uma vez
  console.log("🔐 Autenticando...");
  const token = await getAccessToken();
  console.log("✅ Token obtido com sucesso!\n");

  const headers = { Authorization: `Bearer ${token}` };
  const httpsAgent = getHttpsAgent();

  if (process.env.PAYMENT_MOCK_MODE === "true") {
    console.log("--- [MOCK] Modo Simulação Ativo ---");
    logPasso("7.1", "Criar cobrança imediata", "PUT", "/v2/pix/cob", "MOCK_TXID", { status: "ATIVA", txid: "MOCK" });
    logPasso("7.5", "Criar cobrança com vencimento", "PUT", "/v2/pix/cobv", "MOCK_TXID_V", { status: "ATIVA", txid: "MOCK_V" });
    logPasso("7.8", "Configurar Webhook", "PUT", "/v2/pix/webhook", null, { status: 204 });
    console.log("\n🏁 ROTEIRO DE HOMOLOGAÇÃO (MOCK) FINALIZADO!");
    return;
  }

  // Guardar txids para consultas posteriores
  let txidCobSimples: string | null = null;
  let txidCobDevedor: string | null = null;
  let txidCobV: string | null = null;

  // -------------------------------------------------------
  // PASSO 7.1: Criar cobrança imediata (Simples)
  // -------------------------------------------------------
  try {
    txidCobSimples = gerarTxId("cobsimp");
    const url = `${C6_API_URL}/v2/pix/cob/${txidCobSimples}`;
    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: "10.00" },
      chave: C6_PIX_KEY,
      solicitacaoPagador: "Homologação C6 - Cob Simples"
    };

    const { data } = await axios.put(url, payload, { headers, httpsAgent });
    logPasso("7.1", "Criar cobrança imediata (Simples)", "PUT", `/v2/pix/cob/${txidCobSimples}`, txidCobSimples, data);
  } catch (e: any) {
    logErro("7.1", "Criar cobrança imediata (Simples)", e);
  }

  // -------------------------------------------------------
  // PASSO 7.2: Criar cobrança imediata com Devedor
  // -------------------------------------------------------
  try {
    txidCobDevedor = gerarTxId("cobdev");
    const url = `${C6_API_URL}/v2/pix/cob/${txidCobDevedor}`;
    const payload = {
      calendario: { expiracao: 3600 },
      devedor: DEVEDOR_DUMMY,
      valor: { original: "25.50" },
      chave: C6_PIX_KEY,
      solicitacaoPagador: "Homologação C6 - Cob com Devedor"
    };

    const { data } = await axios.put(url, payload, { headers, httpsAgent });
    logPasso("7.2", "Criar cobrança imediata com Devedor", "PUT", `/v2/pix/cob/${txidCobDevedor}`, txidCobDevedor, data);
  } catch (e: any) {
    logErro("7.2", "Criar cobrança imediata com Devedor", e);
  }

  // -------------------------------------------------------
  // PASSO 7.3: Consultar cobrança imediata
  // -------------------------------------------------------
  try {
    const txid = txidCobDevedor || txidCobSimples || "txid_fallback";
    const url = `${C6_API_URL}/v2/pix/cob/${txid}`;

    const { data } = await axios.get(url, { headers, httpsAgent });
    logPasso("7.3", "Consultar cobrança imediata", "GET", `/v2/pix/cob/${txid}`, txid, data);
  } catch (e: any) {
    logErro("7.3", "Consultar cobrança imediata", e);
  }

  // -------------------------------------------------------
  // PASSO 7.4: Consultar lista de cobranças imediatas
  // -------------------------------------------------------
  try {
    const inicio = getDataISO(-1); // Ontem
    const fim = getDataISO(0);      // Hoje
    const url = `${C6_API_URL}/v2/pix/cob`;

    const { data } = await axios.get(url, {
      headers,
      httpsAgent,
      params: { inicio, fim }
    });
    logPasso("7.4", "Consultar lista de cobranças imediatas", "GET", `/v2/pix/cob?inicio=...&fim=...`, null, data);
  } catch (e: any) {
    logErro("7.4", "Consultar lista de cobranças imediatas", e);
  }

  // -------------------------------------------------------
  // PASSO 7.5: Criar cobrança com vencimento (CobV)
  // -------------------------------------------------------
  try {
    txidCobV = gerarTxId("cobv");
    const url = `${C6_API_URL}/v2/pix/cobv/${txidCobV}`;
    const payload = {
      calendario: {
        dataDeVencimento: getDataFutura(7), // 7 dias no futuro
        validadeAposVencimento: 30
      },
      devedor: DEVEDOR_DUMMY,
      valor: { original: "150.00" },
      chave: C6_PIX_KEY,
      solicitacaoPagador: "Homologação C6 - CobV com Vencimento"
    };

    const { data } = await axios.put(url, payload, { headers, httpsAgent });
    logPasso("7.5", "Criar cobrança com vencimento (CobV)", "PUT", `/v2/pix/cobv/${txidCobV}`, txidCobV, data);
  } catch (e: any) {
    logErro("7.5", "Criar cobrança com vencimento (CobV)", e);
  }

  // -------------------------------------------------------
  // PASSO 7.6: Consultar lista de cobranças com vencimento
  // -------------------------------------------------------
  try {
    const inicio = getDataISO(-1);
    const fim = getDataISO(7);
    const url = `${C6_API_URL}/v2/pix/cobv`;

    const { data } = await axios.get(url, {
      headers,
      httpsAgent,
      params: { inicio, fim }
    });
    logPasso("7.6", "Consultar lista de cobranças com vencimento", "GET", `/v2/pix/cobv?inicio=...&fim=...`, null, data);
  } catch (e: any) {
    logErro("7.6", "Consultar lista de cobranças com vencimento", e);
  }

  // -------------------------------------------------------
  // PASSO 7.7: Consultar cobrança com vencimento
  // -------------------------------------------------------
  try {
    const txid = txidCobV || "txid_cobv_fallback";
    const url = `${C6_API_URL}/v2/pix/cobv/${txid}`;

    const { data } = await axios.get(url, { headers, httpsAgent });
    logPasso("7.7", "Consultar cobrança com vencimento", "GET", `/v2/pix/cobv/${txid}`, txid, data);
  } catch (e: any) {
    logErro("7.7", "Consultar cobrança com vencimento", e);
  }

  // -------------------------------------------------------
  // PASSO 7.8a: Consultar Webhooks existentes
  // -------------------------------------------------------
  try {
    const url = `${C6_API_URL}/v2/pix/webhook`;
    const { data } = await axios.get(url, { headers, httpsAgent });
    logPasso("7.8a", "Consultar Webhooks existentes", "GET", `/v2/pix/webhook`, null, data);
  } catch (e: any) {
    logErro("7.8a", "Consultar Webhooks existentes", e);
  }

  // -------------------------------------------------------
  // PASSO 7.8b: Configurar Webhook
  // -------------------------------------------------------
  try {
    const chave = encodeURIComponent(C6_PIX_KEY);
    const url = `${C6_API_URL}/v2/pix/webhook/${chave}`;
    const payload = {
      webhookUrl: WEBHOOK_URL
    };

    console.log(`   Tentando registrar webhook: ${WEBHOOK_URL}`);

    const { data, status } = await axios.put(url, payload, { headers, httpsAgent });
    logPasso("7.8b", "Configurar Webhook", "PUT", `/v2/pix/webhook/{chave}`, null, { status, data: data || "Sem corpo (204)" });
  } catch (e: any) {
    logErro("7.8b", "Configurar Webhook", e);
  }

  // -------------------------------------------------------
  // PASSO 7.8c: Consultar Webhook por Chave
  // -------------------------------------------------------
  try {
    const chave = encodeURIComponent(C6_PIX_KEY);
    const url = `${C6_API_URL}/v2/pix/webhook/${chave}`;
    const { data } = await axios.get(url, { headers, httpsAgent });
    logPasso("7.8c", "Consultar Webhook por Chave", "GET", `/v2/pix/webhook/{chave}`, null, data);
  } catch (e: any) {
    logErro("7.8c", "Consultar Webhook por Chave", e);
  }

  // -------------------------------------------------------
  // FIM
  // -------------------------------------------------------
  console.log("\n🏁 ROTEIRO DE HOMOLOGAÇÃO FINALIZADO!");
  console.log("   Copie os JSONs acima para o documento de homologação.");
}

// Executar
executarHomologacaoPix().catch(console.error);
