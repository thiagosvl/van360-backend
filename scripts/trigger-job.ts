// Exemplos:
// npx tsx scripts/trigger-job.ts jobs/driver-monitor '{"force":true}'
// npx tsx scripts/trigger-job.ts jobs/passenger-monitor '{"diasAntecedenciaOverride":1}'

import axios from "axios";

// 1. Capturar argumentos
const endpoint = process.argv[2]; // ex: jobs/passenger-monitor
const payloadStr = process.argv[3]; // ex: '{"force": true}'

if (!endpoint) {
    console.error("\n❌ Erro: Endpoint é obrigatório.");
    console.error("Uso: npx tsx scripts/trigger-job.ts <endpoint> [json-payload]");
    console.error("Ex: npx tsx scripts/trigger-job.ts jobs/passenger-monitor '{\"force\":true}'\n");
    process.exit(1);
}

// 2. Preparar Payload
let payload = {};
if (payloadStr) {
    try {
        payload = JSON.parse(payloadStr);
    } catch (e) {
        console.error("❌ Erro: Payload não é um JSON válido.");
        process.exit(1);
    }
}

// 3. Montar URL
// Aceita tanto "jobs/driver-monitor" quanto "http://localhost.../jobs..."
let url = endpoint;
if (!endpoint.startsWith("http")) {
    url = `http://localhost:3000/${endpoint}`;
}

async function trigger() {
    console.log(`\n🚀 Disparando POST para: ${url}`);
    if (Object.keys(payload).length > 0) {
        console.log("📦 Payload:", JSON.stringify(payload, null, 2));
    }

    try {
        const { data } = await axios.post(url, payload);
        console.log("\n✅ [200 OK] Sucesso!");
        console.log("📄 Resposta:", JSON.stringify(data, null, 2));
    } catch (error: any) {
        console.error("\n❌ Falha na requisição:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error("Erro:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Erro:", error.message);
        }
    }
}

trigger();
