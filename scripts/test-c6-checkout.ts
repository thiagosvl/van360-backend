import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";

// --- CONFIGURAÇÕES ---
const C6_API_URL = process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info";
const C6_CLIENT_ID = process.env.C6_CLIENT_ID || "";
const C6_CLIENT_SECRET = process.env.C6_CLIENT_SECRET || "";
const C6_CERT_PATH = process.env.C6_CERT_PATH || "";
const C6_KEY_PATH = process.env.C6_KEY_PATH || "";

const PAYER_DUMMY = {
  tax_id: "12345678909",
  name: "Fulano de Tal Homologacao",
  email: "pagador@exemplo.com",
  phone_number: "11999999999",
  address: {
    street: "Avenida Nove de Julho",
    number: 3186,
    city: "Sao Paulo",
    state: "SP",
    zip_code: "01406000"
  }
};

// --- HTTPSAGENT COM mTLS ---
let _httpsAgent: https.Agent | null = null;
function getHttpsAgent(): https.Agent {
  if (_httpsAgent) return _httpsAgent;
  const cert = fs.readFileSync(path.resolve(C6_CERT_PATH));
  const key = fs.readFileSync(path.resolve(C6_KEY_PATH));
  _httpsAgent = new https.Agent({ cert, key, rejectUnauthorized: false });
  return _httpsAgent;
}

// --- TOKEN MANAGEMENT ---
async function getAccessToken(): Promise<string> {
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

// --- LOGS RAW ---
let finalContent = `=== LOGS REAIS E BRUTOS (RAW) - CHECKOUT C6 BANK ===\n`;
finalContent += `Ambiente: SANDBOX\n`;
finalContent += `Data da Execucao: ${new Date().toLocaleString('pt-BR')}\n\n`;

function addRawStep(number: string, title: string, res: any) {
    finalContent += `---------------------------------------------------------\n`;
    finalContent += `PASSO ${number}: ${title}\n`;
    finalContent += `---------------------------------------------------------\n`;
    finalContent += `HTTP Status: ${res.status} ${res.statusText || ""}\n`;
    if (res.data) {
        finalContent += `Response Body (JSON):\n${JSON.stringify(res.data, null, 2)}\n`;
    } else {
        finalContent += `Response Body: (Vazio)\n`;
    }
    finalContent += `---------------------------------------------------------\n\n`;
}

function getExternalId(prefix = "") {
    return (prefix + Date.now().toString(36).toUpperCase()).substring(0, 10);
}

async function run() {
  console.log("🚀 Iniciando Homologacao Completa de Checkout C6 (Passos 9 a 13)");
  const token = await getAccessToken();
  const headers = { 
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "partner-software-name": "Van360",
    "partner-software-version": "1.0.0"
  };
  const agent = getHttpsAgent();

  try {
    // --- PASSO 9.a: Criar Checkout - Cartão de Crédito (Sem Autenticação) ---
    console.log("\n9.a Criando Checkout de Credito (Sem Autenticacao)...");
    const payload9a = {
      amount: 15.50,
      description: "9.a - Credito Simples",
      external_reference_id: getExternalId("A"),
      payer: PAYER_DUMMY,
      payment: { card: { type: "CREDIT", installments: 1, authenticate: "NOT_REQUIRED" } }
    };
    const res9a = await axios.post(`${C6_API_URL}/v1/checkouts`, payload9a, { headers, httpsAgent: agent });
    addRawStep("9.a", "Criar checkout com cartão de crédito sem autenticação", res9a);
    const lastId = res9a.data.id;

    // --- PASSO 9.b: Criar Checkout - Cartão de Débito ---
    console.log("9.b Criando Checkout de Debito...");
    const payload9b = {
      amount: 10.00,
      description: "9.b - Debito Simples",
      external_reference_id: getExternalId("B"),
      payer: PAYER_DUMMY,
      payment: { card: { type: "DEBIT", installments: 1 } }
    };
    const res9b = await axios.post(`${C6_API_URL}/v1/checkouts`, payload9b, { headers, httpsAgent: agent });
    addRawStep("9.b", "Criar checkout com cartão de débito", res9b);

    // --- PASSO 9.c: Criar Checkout - Crédito com Autenticação (Opcional no roteiro, mas pedido 201) ---
    console.log("9.c Criando Checkout de Credito (Com Autenticacao Opcional)...");
    const payload9c = {
      amount: 20.00,
      description: "9.c - Credito Autenticado",
      external_reference_id: getExternalId("C"),
      payer: PAYER_DUMMY,
      payment: { card: { type: "CREDIT", installments: 1, authenticate: "OPTIONAL" } }
    };
    const res9c = await axios.post(`${C6_API_URL}/v1/checkouts`, payload9c, { headers, httpsAgent: agent });
    addRawStep("9.c", "Criar checkout com cartão de crédito com autenticação (Opcional)", res9c);

    // --- PASSO 10.a: Consultar Checkout ---
    console.log("\n10.a Consultando checkout existente...");
    const res10a = await axios.get(`${C6_API_URL}/v1/checkouts/${lastId}`, { headers, httpsAgent: agent });
    addRawStep("10.a", "Realizar consulta de um checkout existente", res10a);

    // --- PASSO 11.a: Cancelar Checkout ---
    console.log("11.a Cancelando checkout...");
    const res11a = await axios({
        method: 'put',
        url: `${C6_API_URL}/v1/checkouts/${lastId}/cancel`,
        headers,
        httpsAgent: agent
    });
    addRawStep("11.a", "Realizar o cancelamento de um checkout", res11a);

    // --- PASSO 12.a: Criar link com Save Card: true ---
    console.log("\n12.a Criando Checkout com save_card: true...");
    const payload12a = {
        amount: 5.00,
        description: "12.a - Save Card",
        external_reference_id: getExternalId("S"),
        payer: PAYER_DUMMY,
        payment: { card: { type: "CREDIT", installments: 1, save_card: true } }
    };
    const res12a = await axios.post(`${C6_API_URL}/v1/checkouts`, payload12a, { headers, httpsAgent: agent });
    addRawStep("12.a", "Criar link com cartão de crédito e save_card: true", res12a);
    console.log(`🔗 Link para Passo 12: ${res12a.data.url}`);

    // --- PASSO 12.b: Autorizar via Token (Aprovação Direta) ---
    console.log("\n12.b Testando Autorizacao via Token...");
    const authPayload = {
        amount: 5.00,
        description: "12.b - Autorizacao Direta via Token",
        external_reference_id: getExternalId("T"),
        payer: PAYER_DUMMY,
        payment: {
            card: {
                installments: 1,
                card_info: {
                    token: "be4cbeb1-abb2-4913-8165-f86962143fa021" 
                }
            }
        }
    };
    
    try {
        const res12b = await axios.post(`${C6_API_URL}/v1/checkouts/authorize`, authPayload, { headers, httpsAgent: agent });
        addRawStep("12.b", "Capturar transação realizada no teste 12.a informando o token criado", res12b);
    } catch (authErr: any) {
        addRawStep("12.b", "Capturar transação realizada no teste 12.a informando o token criado (Falha - Requer Token Real)", authErr.response || { status: authErr.message });
    }

    // --- PASSO 13.a: Configurar Webhook ---
    console.log("\n13.a Registrando Webhook de Checkout...");
    const webhookPayload = { webhookUrl: "https://api.van360.com.br/api/webhook/pagamento/c6" };
    try {
        const res13 = await axios.put(`${C6_API_URL}/v2/pix/webhook/${process.env.C6_PIX_KEY}`, webhookPayload, { headers, httpsAgent: agent });
        addRawStep("13.a", "Cadastrar url para notificação acerca das alterações no status do checkout", res13);
    } catch (e2: any) {
        addRawStep("13.a", "Cadastrar url para notificação acerca das alterações no status do checkout (Erro)", e2.response || { status: e2.message });
    }

    // FINALIZAÇÃO
    fs.writeFileSync(path.join("scripts", "homologacao_passos_9_13_checkout.txt"), finalContent, 'utf8');
    console.log("\n🏁 Homologacao concluida! Confira os logs em: scripts/homologacao_passos_9_13_checkout.txt");

  } catch (err: any) {
    console.error("❌ Erro fatal no script:", err.response?.data || err.message);
    fs.writeFileSync(path.join("scripts", "homologacao_passos_9_13_checkout.txt"), finalContent + `\nERRO FATAL: ${JSON.stringify(err.response?.data || err.message)}`, 'utf8');
  }
}

run();
