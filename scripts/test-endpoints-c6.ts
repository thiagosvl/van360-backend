
import axios from "axios";
import "dotenv/config";
import fs from "fs";
import https from "https";
import { env } from "../src/config/env";

async function getHttpsAgent() {
  const cert = fs.readFileSync(env.C6_CERT_PATH);
  const key = fs.readFileSync(env.C6_KEY_PATH);
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

async function getAccessToken(): Promise<string> {
    const url = `${env.C6_API_URL}/v1/auth/`;
    const body = new URLSearchParams();
    body.append("client_id", env.C6_CLIENT_ID);
    body.append("client_secret", env.C6_CLIENT_SECRET);
    body.append("grant_type", "client_credentials");
    
    const tokenResponse = await axios.post(url, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        httpsAgent: await getHttpsAgent()
    });
    return tokenResponse.data.access_token;
}

async function testEndpoints() {
    const chave = "9500c3e5-5d83-41e8-98f6-5ab374b53748";
    
    console.log(`\n🔍 Testando endpoints Alternativos para C6`);
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agent = await getHttpsAgent();

    const endpoints = [
        "/v2/chaves",
        "/v2/pix/chaves",
        "/v2/pix/dict/" + chave,
        "/v1/pix/chaves"
    ];

    for (const ep of endpoints) {
        console.log(`\n--- Testando: ${ep} ---`);
        try {
            const res = await axios.get(`${env.C6_API_URL}${ep}`, { headers, httpsAgent: agent });
            console.log("✅ OK!", JSON.stringify(res.data, null, 2));
        } catch (err: any) {
            console.log(`❌ Falha: ${err.response?.status || err.message}`);
            if (err.response?.data) {
                console.log("Detalhes do Erro:", JSON.stringify(err.response.data, null, 2));
            }
        }
    }
}

testEndpoints().catch(console.error);
