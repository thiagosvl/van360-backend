import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import { cobrancaCalculoService } from "../src/services/cobranca-calculo.service.js";
import { motoristaFinanceiroService } from "../src/services/motorista-financeiro.service.js";
import { cobrancaPagamentoService } from "../src/services/cobranca-pagamento.service.js";
import { ModoCobrancaEnum, CobrancaStatus, StatusRepasseEnum, ProvedorPagamentoEnum } from "../src/types/enums.js";

async function runAudit() {
  console.log("=== INICIANDO AUDITORIA: RECIBO AUTOMATICO & TAXA PERSONALIZADA ===");

  // 1. Buscar motorista
  const { data: motoristas } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome")
    .eq("tipo", "motorista")
    .limit(1);

  if (!motoristas || motoristas.length === 0) {
    throw new Error("Nenhum motorista encontrado");
  }
  const motoristaId = motoristas[0].id;
  console.log(`Motorista: ${motoristas[0].nome} (${motoristaId})`);

  // ==========================================
  // TESTE 1: TAXA PERSONALIZADA DA PLATAFORMA
  // ==========================================
  console.log("\n--- TESTE 1: TAXA PERSONALIZADA ---");

  // 1.1 Configurar taxa personalizada de R$ 1.50 para o motorista
  await motoristaFinanceiroService.atualizarConfiguracoes(motoristaId, {
    modo_cobranca: ModoCobrancaEnum.AUTOMATICA,
    chave_pix_repasse: "11988887777",
    tipo_chave_pix: "telefone",
    taxa_personalizada: 1.50,
    enviar_recibo_automatico: false
  });

  const configPersonalizada = await motoristaFinanceiroService.obterConfiguracoes(motoristaId);
  console.log(`[PASS] Taxa efetiva retornada pela API: R$ ${configPersonalizada.taxa_efetiva} (esperado 1.50)`);
  if (configPersonalizada.taxa_efetiva !== 1.50) {
    throw new Error(`Taxa efetiva esperada 1.50, obtido: ${configPersonalizada.taxa_efetiva}`);
  }

  // 1.2 Resolver taxa para cÃ¡lculo de split
  const taxaResolvida = cobrancaCalculoService.resolverTaxaPlataforma(configPersonalizada.taxa_personalizada);
  console.log(`[PASS] cobrancaCalculoService.resolverTaxaPlataforma: ${taxaResolvida} (esperado 1.50)`);
  if (taxaResolvida !== 1.50) {
    throw new Error(`Taxa resolvida esperada 1.50, obtido: ${taxaResolvida}`);
  }

  // 1.3 Calcular divisÃ£o de cobranÃ§a de R$ 300,00
  const divisao = cobrancaCalculoService.calcularDivisaoCobranca({
    valorMensalidade: 300,
    taxaPlataforma: taxaResolvida
  });
  console.log(`[PASS] DivisÃ£o de R$ 300 com taxa R$ 1.50: LÃ­quido motorista = R$ ${divisao.valorLiquidoMotorista}, Taxa plataforma = R$ ${divisao.taxaPlataforma}`);
  if (divisao.valorLiquidoMotorista !== 298.50 || divisao.taxaPlataforma !== 1.50) {
    throw new Error(`CÃ¡lculo de divisÃ£o incorreto: liquido=${divisao.valorLiquidoMotorista}, taxa=${divisao.taxaPlataforma}`);
  }

  // 1.4 Testar remoÃ§Ã£o de taxa personalizada (volta para a taxa padrÃ£o global)
  await motoristaFinanceiroService.atualizarConfiguracoes(motoristaId, {
    taxa_personalizada: null
  });

  const configGlobal = await motoristaFinanceiroService.obterConfiguracoes(motoristaId);
  console.log(`[PASS] Taxa efetiva apÃ³s remover personalizaÃ§Ã£o: R$ ${configGlobal.taxa_efetiva}`);
  if (configGlobal.taxa_personalizada !== null) {
    throw new Error("Taxa personalizada deveria ser null");
  }

  // ==========================================
  // TESTE 2: REGRA DE ENVIAR RECIBO OU NÃƒO
  // ==========================================
  console.log("\n--- TESTE 2: ENVIAR RECIBO AUTOMÃTICO ---");

  // 2.1 Desativar envio de recibo
  await motoristaFinanceiroService.atualizarConfiguracoes(motoristaId, {
    enviar_recibo_automatico: false
  });

  const configReciboDesativado = await motoristaFinanceiroService.obterConfiguracoes(motoristaId);
  console.log(`[PASS] enviar_recibo_automatico configurado como: ${configReciboDesativado.enviar_recibo_automatico} (esperado false)`);
  if (configReciboDesativado.enviar_recibo_automatico !== false) {
    throw new Error("enviar_recibo_automatico deveria ser false");
  }

  // 2.2 Reativar envio de recibo
  await motoristaFinanceiroService.atualizarConfiguracoes(motoristaId, {
    enviar_recibo_automatico: true
  });

  const configReciboAtivado = await motoristaFinanceiroService.obterConfiguracoes(motoristaId);
  console.log(`[PASS] enviar_recibo_automatico reativado como: ${configReciboAtivado.enviar_recibo_automatico} (esperado true)`);
  if (configReciboAtivado.enviar_recibo_automatico !== true) {
    throw new Error("enviar_recibo_automatico deveria ser true");
  }

  console.log("\n=== AMBAS AS REGRAS ESTÃƒO FUNCIONANDO COM 100% DE PRECISÃƒO! ===");
}

runAudit().catch((err) => {
  console.error("ERRO NA AUDITORIA:", err);
  process.exit(1);
});

