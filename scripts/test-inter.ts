import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";

// MOCK_MODE is inherited from process.env.PAYMENT_MOCK_MODE

// --- CONFIGURAÇÕES ---
const INTER_API_URL = process.env.INTER_API_URL || "https://cdpj.inter.co";
const INTER_PIX_KEY = process.env.INTER_PIX_KEY || "";
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID || "";
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET || "";
const INTER_CERT_PATH = process.env.INTER_CERT_PATH || "";
const INTER_KEY_PATH = process.env.INTER_KEY_PATH || "";

// Webhook URL
const WEBHOOK_URL = process.env.INTER_WEBHOOK_URL || "https://api.van360.com.br/api/webhook/pagamento/inter";

// Devedor Dummy
const DEVEDOR_DUMMY = {
  cpf: "12345678909",
  nome: "Van360 Homologacao Inter"
};

// --- HTTPSAGENT COM mTLS ---
let _httpsAgent: https.Agent | null = null;
function getHttpsAgent(): https.Agent {
  if (_httpsAgent) return _httpsAgent;
  const cert = fs.readFileSync(path.resolve(INTER_CERT_PATH));
  const key = fs.readFileSync(path.resolve(INTER_KEY_PATH));
  _httpsAgent = new https.Agent({ cert, key, rejectUnauthorized: false });
  return _httpsAgent;
}

// --- TOKEN MANAGEMENT ---
async function getAccessToken(): Promise<string> {
  if (process.env.PAYMENT_MOCK_MODE === "true") return "MOCK_TOKEN";

  const body = new URLSearchParams();
  body.append("client_id", INTER_CLIENT_ID);
  body.append("client_secret", INTER_CLIENT_SECRET);
  body.append("grant_type", "client_credentials");
  body.append("scope", "cob.write cob.read cobv.write cobv.read pix.write pix.read webhook.write webhook.read");

  const response = await axios.post(
    `${INTER_API_URL}/oauth/v2/token`,
    body,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: getHttpsAgent()
    }
  );
  return response.data.access_token;
}

// --- HELPERS ---
function gerarTxId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return ("H" + timestamp + random + "testinter").substring(0, 32).padEnd(26, "0");
}

function logPasso(titulo: string, data: any) {
  console.log(`\n--- ${titulo} ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function testInter() {
  console.log("🚀 INICIANDO TESTE DE PIX IN BANCO INTER (COBRANCAS)");
  
  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const httpsAgent = getHttpsAgent();

    if (process.env.PAYMENT_MOCK_MODE === "true") {
      logPasso("1. [MOCK] Criar Cobrança Imediata", { txid: "MOCK_INTER_TXID", pixCopiaECola: "000201...MOCK" });
      logPasso("2. [MOCK] Consulta Cobrança Imediata", { status: "ATIVA", valor: { original: "1.00" } });
      logPasso("3. [MOCK] Criar Cobrança com Vencimento", { txid: "MOCK_INTER_COBV", pixCopiaECola: "000201...MOCK_VENC" });
      logPasso("4. [MOCK] Webhooks Registrados", { status: "OK", url: "https://mock.van360" });
      console.log("\n✅ Teste Inter (MOCK) finalizado!");
      return;
    }

    // 1. Criar Cobrança Imediata (cob)
    const txidCob = gerarTxId();
    const payloadCob = {
      calendario: { expiracao: 3600 },
      devedor: DEVEDOR_DUMMY,
      valor: { original: "1.00" },
      chave: INTER_PIX_KEY,
      solicitacaoPagador: "Teste Van360 Imediato"
    };
    const { data: resCob } = await axios.put(`${INTER_API_URL}/pix/v2/cob/${txidCob}`, payloadCob, { headers, httpsAgent });
    logPasso("1. Criada Cobrança Imediata", resCob);

    // 2. Consultar Cobrança Imediata
    const { data: resGetCob } = await axios.get(`${INTER_API_URL}/pix/v2/cob/${txidCob}`, { headers, httpsAgent });
    logPasso("2. Consulta Cobrança Imediata", resGetCob);

    // 3. Criar Cobrança com Vencimento (cobv)
    const txidCobv = gerarTxId();
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const payloadCobv = {
      calendario: { 
        dataDeVencimento: amanha.toISOString().split("T")[0],
        validadeAposVencimento: 30
      },
      devedor: DEVEDOR_DUMMY,
      valor: { original: "10.00" },
      chave: INTER_PIX_KEY,
      solicitacaoPagador: "Teste Van360 Vencimento"
    };
    const { data: resCobv } = await axios.put(`${INTER_API_URL}/pix/v2/cobv/${txidCobv}`, payloadCobv, { headers, httpsAgent });
    logPasso("3. Criada Cobrança com Vencimento", resCobv);

    // 4. Consultar Lista de Cobranças (Para validar o erro de 'inicio')
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 1);
    const fim = new Date();
    fim.setDate(fim.getDate() + 1);
    
    const { data: resList } = await axios.get(`${INTER_API_URL}/pix/v2/cob`, { 
      headers, 
      httpsAgent,
      params: { 
        inicio: inicio.toISOString(), 
        fim: fim.toISOString() 
      }
    });
    logPasso("4. Lista de Cobranças (Recent)", resList);

    // 5. Consultar Webhooks (Também exige inicio/fim no Sandbox Inter para logs)
    const { data: resWebhook } = await axios.get(`${INTER_API_URL}/pix/v2/webhook`, { 
      headers, 
      httpsAgent,
      params: {
        inicio: inicio.toISOString().split('.')[0] + 'Z', // Formato limpo sem milissegundos
        fim: fim.toISOString().split('.')[0] + 'Z'
      }
    });
    logPasso("5. Webhooks Registrados/Logs", resWebhook);

    console.log("\n✅ Teste Inter finalizado!");

  } catch (e: any) {
    console.error("❌ Erro no Teste Inter:", e.response?.data || e.message);
  }
}

testInter().catch(console.error);
