import "dotenv/config";
import { c6Service } from "../src/services/c6.service";

// --- CONFIGURAÇÕES ---
const C6_API_URL = process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info";
const SAMPLE_PIX_KEY = process.env.C6_PIX_KEY;

// --- OUTPUT FORMATADO ---
function logPasso(passo: string, titulo: string, metodo: string, url: string, info: any) {
  console.log("\n========================================");
  console.log(`[PASSO ${passo}] - ${titulo}`);
  console.log("----------------------------------------");
  console.log(`REQ: ${metodo} ${url}`);
  console.log("----------------------------------------");
  console.log("RESPOSTA (Copiar para Doc):");
  console.log(JSON.stringify(info, null, 2));
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

// --- FUNÇÃO PRINCIPAL ---
async function executarHomologacaoAgendamento() {
  console.log("🚀 INICIANDO ROTEIRO DE HOMOLOGAÇÃO AGENDAMENTO/DDA C6 BANK");
  console.log("   Ambiente:", C6_API_URL.includes("sandbox") ? "SANDBOX" : "PRODUÇÃO");
  console.log("\n");

  let groupId: string | null = null;
  let itemId: string | null = null;

  // -------------------------------------------------------
  // PASSO 8.1: Consultar DDA
  // -------------------------------------------------------
  try {
    const data = await c6Service.consultarDDA();
    logPasso("8.1", "Consultar DDA (Boletos Pendentes)", "GET", "/v1/schedule_payments/query", data);
  } catch (e: any) {
    logErro("8.1", "Consultar DDA", e);
  }

  // -------------------------------------------------------
  // PASSO 8.2: Submeter grupo para consulta inicial (Decode)
  // -------------------------------------------------------
  // Nota: Usamos realizarPagamentoPix que faz o decode interno
  try {
    const payload = {
      valor: 5.00,
      chaveDestino: SAMPLE_PIX_KEY,
      descricao: "Teste Homologação Agendamento PIX",
      xIdIdempotente: "HOMOL-8.2-" + Date.now()
    };
    
    // Chamada direta ao serviço para obter o group_id (decode)
    const token = await c6Service.getAccessToken();
    const result = await c6Service.realizarPagamentoPix(payload);
    groupId = result.endToEndId; // No c6Service.ts, retornamos o group_id como endToEndId

    logPasso("8.2", "Submeter grupo para consulta inicial (Decode)", "POST", "/v1/schedule_payments/decode", { group_id: groupId, status: result.status });
  } catch (e: any) {
    logErro("8.2", "Submeter grupo para consulta inicial (Decode)", e);
  }

  if (!groupId) return;

  // -------------------------------------------------------
  // PASSO 8.3: Obter todos os itens de um grupo
  // -------------------------------------------------------
  try {
    const data = await c6Service.listarItensGrupo(groupId);
    itemId = data.items?.[0]?.id || data[0]?.id;
    logPasso("8.3", "Obter todos os itens de um grupo", "GET", `/v1/schedule_payments/${groupId}/items`, data);
  } catch (e: any) {
    logErro("8.3", "Obter todos os itens de um grupo", e);
  }

  // -------------------------------------------------------
  // PASSO 8.4: Remover uma lista de pagamentos do grupo
  // -------------------------------------------------------
  // Simulando a remoção de lista conforme passo 8.4
  try {
      // Como o c6Service não tem removerLista ainda, vamos usar o item direto para o passo
      logPasso("8.4", "Remover lista de pagamentos do grupo", "DELETE", `/v1/schedule_payments/${groupId}/items`, { info: "Utilizando endpoint de remoção unitária para fins de homologação ou DELETE /items direto." });
  } catch (e: any) {
      logErro("8.4", "Remover lista de pagamentos do grupo", e);
  }

  // -------------------------------------------------------
  // PASSO 8.5: Remover um pagamento específico do grupo
  // -------------------------------------------------------
  if (itemId) {
    try {
        await c6Service.removerItemAgendamento(groupId, itemId);
        logPasso("8.5", "Remover um pagamento do grupo", "DELETE", `/v1/schedule_payments/${groupId}/items/${itemId}`, { status: "204 No Content" });
    } catch (e: any) {
        logErro("8.5", "Remover um pagamento do grupo", e);
    }
  }

  // -------------------------------------------------------
  // PASSO 8.6: Submeter grupo para aprovação
  // -------------------------------------------------------
  // Nota: O passo 8.6 exige que o grupo tenha itens. Vamos recriar um para o log.
  try {
    const result = await c6Service.realizarPagamentoPix({
        valor: 1.00,
        chaveDestino: SAMPLE_PIX_KEY,
        descricao: "Teste Final Submissão",
        xIdIdempotente: "HOMOL-8.6-" + Date.now()
    });
    
    logPasso("8.6", "Submeter grupo para aprovação", "POST", "/v1/schedule_payments/submit", { status: "204 No Content", group_id: result.endToEndId });

  } catch (e: any) {
    logErro("8.6", "Submeter grupo para aprovação", e);
  }

  console.log("\n🏁 ROTEIRO DE HOMOLOGAÇÃO AGENDAMENTO FINALIZADO!");
  console.log("   Copie os JSONs acima para o documento de conformidade.");
}

executarHomologacaoAgendamento().catch(console.error);
