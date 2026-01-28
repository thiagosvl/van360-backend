import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// MOCK_MODE is inherited from process.env.PAYMENT_MOCK_MODE

const INTER_API_URL = process.env.INTER_API_URL || "https://cdpj.inter.co/oauth/v2/token";
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID || "";
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET || "";
const INTER_CERT_PATH = process.env.INTER_CERT_PATH || "";
const INTER_KEY_PATH = process.env.INTER_KEY_PATH || "";

// --- HTTPSAGENT COM mTLS ---
function getHttpsAgent(): https.Agent {
  const cert = fs.readFileSync(path.resolve(INTER_CERT_PATH));
  const key = fs.readFileSync(path.resolve(INTER_KEY_PATH));
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

// --- TOKEN MANAGEMENT ---
async function getAccessToken(): Promise<string> {
  if (process.env.PAYMENT_MOCK_MODE === "true") return "MOCK_TOKEN";

  const body = new URLSearchParams();
  body.append("client_id", INTER_CLIENT_ID);
  body.append("client_secret", INTER_CLIENT_SECRET);
  body.append("grant_type", "client_credentials");
  body.append("scope", "pagamento-pix.write pagamento-pix.read");

  const response = await axios.post(
    `${process.env.INTER_API_URL}/oauth/v2/token`,
    body,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: getHttpsAgent()
    }
  );
  return response.data.access_token;
}

// --- HELPERS ---
function logPasso(titulo: string, data: any) {
  console.log(`\n--- ${titulo} ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function testInterOut() {
  console.log("🚀 INICIANDO TESTE DE PIX OUT BANCO INTER (BANKING)");
  
  try {
    const token = await getAccessToken();
    const headers = { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-id-idempotente": uuidv4()
    };
    const httpsAgent = getHttpsAgent();
    
    if (process.env.PAYMENT_MOCK_MODE === "true") {
      logPasso("[MOCK] Passo 1: Validação de Chave", { status: "APROVADO", beneficiario: "MOCK USER" });
      logPasso("[MOCK] Passo 2: Repasse", { endToEndId: "MOCK_E2E_123", status: "PAGO" });
      console.log("\n✅ Teste Inter Out (MOCK) finalizado!");
      return;
    }

    const bankingUrl = `${process.env.INTER_API_URL}/banking/v2/pix`;

    // 1. TESTE DE VALIDAÇÃO (MICRO-TRANSAÇÃO)
    console.log("\n--- [PASSO 1] Teste de Validação de Chave (0,01) ---");
    const payloadVal = {
      valor: 0.01,
      destinatario: {
        chave: "financeiro@van360.com.br",
        tipo: "CHAVE"
      },
      descricao: "Validacao de Teste Van360"
    };

    console.log("-> Enviando transferência de R$ 0,01...");
    const { data: resVal } = await axios.post(bankingUrl, payloadVal, { headers, httpsAgent });
    console.log("RESPOSTA INTER (Validação):", JSON.stringify(resVal, null, 2));

    if (resVal.codigoSolicitacao) {
      console.log(`✅ Solicitação criada: ${resVal.codigoSolicitacao}`);
      
      console.log("-> Consultando detalhes para pegar o nome do beneficiário...");
      const { data: detail } = await axios.get(`${bankingUrl}/${resVal.codigoSolicitacao}`, { headers, httpsAgent });
      console.log("DETALHE COMPLETO:", JSON.stringify(detail, null, 2));
      console.log("DADOS BENEFICIÁRIO:", {
        nome: detail.recebedor?.nome || detail.transacaoPix?.recebedor?.nome,
        cpfCnpj: detail.recebedor?.cpfCnpj || detail.transacaoPix?.recebedor?.cpfCnpj
      });
    }

    // 2. TESTE DE REPASSE (REAL - PEQUENO VALOR)
    console.log("\n--- [PASSO 2] Teste de Repasse (R$ 1,00) ---");
    const payloadReal = {
      valor: 1.00,
      destinatario: {
        chave: "financeiro@van360.com.br",
        tipo: "CHAVE"
      },
      descricao: "Repasse de Teste Van360"
    };

    // Novo ID de idempotência para o segundo teste
    const headersReal = { ...headers, "x-id-idempotente": uuidv4() };

    console.log("-> Enviando repasse de R$ 1,00...");
    const { data: resReal } = await axios.post(bankingUrl, payloadReal, { headers: headersReal, httpsAgent });
    console.log("RESPOSTA INTER (Repasse):", JSON.stringify(resReal, null, 2));
    
    console.log(`✅ Status/Retorno: ${resReal.tipoRetorno || resReal.status}`);

  } catch (e: any) {
    console.error("❌ Erro no Teste Inter:", e.response?.data || e.message);
  }
}

testInterOut().catch(console.error);
