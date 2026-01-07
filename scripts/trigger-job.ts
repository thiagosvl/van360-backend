import axios from "axios";
import "dotenv/config";

const API_URL = "http://localhost:3000/api/jobs";
const SECRET = process.env.CRON_SECRET || "super_secret_cron_key";

async function triggerJob(jobName: string, params: any = {}) {
    console.log(`🚀 Iniciando Job: ${jobName}...`);
    
    try {
        const { data } = await axios.post(`${API_URL}/${jobName}`, params, {
            headers: {
                "Authorization": `Bearer ${SECRET}`
            }
        });

        console.log("✅ Job Executado com Sucesso!");
        console.log("Resultado:", JSON.stringify(data, null, 2));

    } catch (error: any) {
        console.error("❌ Falha ao executar Job:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error("Erro:", error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

// Exemplo de Uso:
// npx tsx scripts/trigger-job.ts generate-monthly-charges
// npx tsx scripts/trigger-job.ts daily-monitor "{\"force\":true}"
// (Parâmetros podem ser passados como JSON no terceiro argumento, ou hardcoded abaixo)

const jobName = process.argv[2] || "generate-monthly-charges";
const paramsJson = process.argv[3] ? JSON.parse(process.argv[3]) : {};

triggerJob(jobName, paramsJson);
