process.env.LOG_LEVEL = "silent";
import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script 100% fiel à API do C6.
 * Registra apenas Status HTTP e o JSON Literal (se houver).
 * Sem campos manipulados ou resumos manuais.
 */

const SAMPLE_PIX_KEY = process.env.C6_PIX_KEY || "fa32fa2f-403c-4218-ae9e-ad1b145576af";
const OUTPUT_FILE = path.join(__dirname, "conformidade_c6_limpo.txt");

function getHttpsAgent() {
    let cert, key;
    if (process.env.C6_CERT_BASE64 && process.env.C6_KEY_BASE64) {
        cert = Buffer.from(process.env.C6_CERT_BASE64, "base64").toString("utf-8");
        key = Buffer.from(process.env.C6_KEY_BASE64, "base64").toString("utf-8");
    } else {
        cert = fs.readFileSync(path.resolve(process.env.C6_CERT_PATH || ""));
        key = fs.readFileSync(path.resolve(process.env.C6_KEY_PATH || ""));
    }
    return new https.Agent({ cert, key, rejectUnauthorized: false });
}

async function getAccessToken(agent: any) {
    const url = `${process.env.C6_API_URL}/v1/auth`;
    const body = new URLSearchParams();
    body.append("client_id", process.env.C6_CLIENT_ID || "");
    body.append("client_secret", process.env.C6_CLIENT_SECRET || "");
    body.append("grant_type", "client_credentials");
    
    const response = await axios.post(url, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        httpsAgent: agent
    });
    return response.data.access_token;
}

let finalContent = "=== LOGS REAIS E BRUTOS (RAW) DO C6 BANK ===\n";
finalContent += "Ambiente: SANDBOX\n";
finalContent += "Data da Execução: " + new Date().toLocaleString() + "\n\n";

function addRawStep(number: string, title: string, res: any) {
    finalContent += `---------------------------------------------------------\n`;
    finalContent += `PASSO ${number}: ${title}\n`;
    finalContent += `---------------------------------------------------------\n`;
    finalContent += `HTTP Status: ${res.status} ${res.statusText || ""}\n`;
    
    if (res.data && (typeof res.data === 'object' ? Object.keys(res.data).length > 0 : res.data)) {
        finalContent += `Response Body (JSON):\n${JSON.stringify(res.data, null, 2)}\n`;
    } else {
        finalContent += `Response Body: (Vazio - No Content)\n`;
    }
    finalContent += `---------------------------------------------------------\n\n`;
}

async function run() {
    console.log("🚀 Gerando logs 100% RAW para conformidade...");
    const agent = getHttpsAgent();
    const token = await getAccessToken(agent);
    const headers = { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0",
        "Content-Type": "application/json"
    };
    const c6Url = `${process.env.C6_API_URL}/v1/schedule_payments/`;

    // 8.1
    console.log("-> 8.1");
    const r81 = await axios.get(c6Url + "query", { headers, httpsAgent: agent }).catch(e => e.response);
    addRawStep("8.1", "Obter boletos em aberto (DDA)", r81);

    // 8.2
    console.log("-> 8.2");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const payload = {
        items: [{
            amount: 7.50,
            transaction_date: tomorrow.toISOString().split("T")[0],
            description: "Homologacao Conformidade RAW",
            content: SAMPLE_PIX_KEY,
            beneficiary_name: "Beneficiario Homologacao",
            payer_name: "Van360 Tecnologia"
        }]
    };
    const r82 = await axios.post(c6Url + "decode", payload, { headers, httpsAgent: agent }).catch(e => e.response);
    addRawStep("8.2", "Submeter um grupo de pagamentos (Decode)", r82);

    if (r82.status < 300) {
        const gid = r82.data.group_id;
        console.log("   Aguardando 30s...");
        await new Promise(r => setTimeout(r, 30000));

        // 8.3
        console.log("-> 8.3");
        const r83 = await axios.get(`${c6Url}${gid}/items`, { headers, httpsAgent: agent }).catch(e => e.response);
        addRawStep("8.3", "Obter todos os itens de um grupo", r83);

        const itemId = r83.data.items?.[0]?.id;

        // 8.4
        console.log("-> 8.4");
        if (itemId) {
            const r84 = await axios.delete(`${c6Url}${gid}/items`, { 
                headers, httpsAgent: agent, data: [{ id: itemId }] 
            }).catch(e => e.response);
            addRawStep("8.4", "Remover uma lista de pagamentos do grupo", r84);
        }

        // 8.5
        console.log("-> 8.5");
        const p85 = await axios.post(c6Url + "decode", payload, { headers, httpsAgent: agent }).catch(e => e.response);
        const gid85 = p85.data.group_id;
        await new Promise(r => setTimeout(r, 25000));
        const l85 = await axios.get(`${c6Url}${gid85}/items`, { headers, httpsAgent: agent }).catch(e => e.response);
        const item85 = l85.data.items?.[0]?.id;
        if (item85) {
            const r85 = await axios.delete(`${c6Url}${gid85}/items/${item85}`, { headers, httpsAgent: agent }).catch(e => e.response);
            addRawStep("8.5", "Remover um pagamento do grupo", r85);
        }

        // 8.6
        console.log("-> 8.6");
        const p86 = await axios.post(c6Url + "decode", payload, { headers, httpsAgent: agent }).catch(e => e.response);
        const gid86 = p86.data.group_id;
        await new Promise(r => setTimeout(r, 30000));
        const r86 = await axios.post(c6Url + "submit", { group_id: gid86, uploader_name: "Thiago Gerente" }, { headers, httpsAgent: agent }).catch(e => e.response);
        addRawStep("8.6", "Enviar um grupo de pagamentos para aprovação", r86);
    }

    fs.writeFileSync(OUTPUT_FILE, finalContent, "utf-8");
    console.log("\n✅ LOGS 100% RAW GERADOS EM: " + OUTPUT_FILE);
}

run().catch(console.error);
