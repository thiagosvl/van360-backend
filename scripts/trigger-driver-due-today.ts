import "dotenv/config";

process.env.TZ = "America/Sao_Paulo";

import { userRepository } from "../src/repositories/user.repository.js";
import { cobrancaRepository } from "../src/repositories/cobranca.repository.js";
import { passageiroRepository } from "../src/repositories/passageiro.repository.js";
import { cobrancaService } from "../src/services/cobranca.service.js";
import { getNowBR, toPersistenceString } from "../src/utils/date.utils.js";
import { logger } from "../src/config/logger.js";

async function main() {
  const isExecute = process.argv.includes("--execute");
  const now = getNowBR();
  const hojeStr = toPersistenceString(now);

  console.log(`\n==================================================`);
  console.log(`🚀 [Alerta Diário de Parcelas - Motoristas]`);
  console.log(`📅 Data de Referência (BRT): ${hojeStr}`);
  console.log(`⚙️ Modo: ${isExecute ? "🚨 PRODUÇÃO (EXECUÇÃO REAL)" : "🔍 SIMULAÇÃO (DRY-RUN)"}`);
  console.log(`==================================================\n`);

  const { data: motoristas } = await userRepository.listMotoristasAtivosParaAlertaDiario();

  if (!motoristas || motoristas.length === 0) {
    console.log("ℹ️ Nenhum motorista ativo elegível encontrado.");
    process.exit(0);
  }

  const motoristaIds = motoristas.map(m => m.id);

  const [cobrancasResult, contagemMap] = await Promise.all([
    cobrancaRepository.getPendentesVencendoHojeParaMotoristas(hojeStr, motoristaIds),
    passageiroRepository.getContagemPassageirosAtivosPorMotorista(motoristaIds)
  ]);

  if (cobrancasResult.error) {
    console.error("❌ Erro ao buscar cobranças pendentes de hoje:", cobrancasResult.error.message);
    process.exit(1);
  }

  type CobrancaItem = NonNullable<typeof cobrancasResult.data>[number];
  const cobrancasPorMotorista = new Map<string, CobrancaItem[]>();

  for (const c of cobrancasResult.data || []) {
    if (!c.usuario_id) continue;
    if (!cobrancasPorMotorista.has(c.usuario_id)) {
      cobrancasPorMotorista.set(c.usuario_id, []);
    }
    cobrancasPorMotorista.get(c.usuario_id)!.push(c);
  }

  console.log(`Total de motoristas ativos elegíveis: ${motoristas.length}`);
  console.log(`Total de cobranças vencendo hoje (${hojeStr}): ${cobrancasResult.data?.length || 0}\n`);

  for (const m of motoristas) {
    const lista = cobrancasPorMotorista.get(m.id) || [];
    const contagemAlunos = contagemMap.get(m.id) || 0;
    const temAlunos = contagemAlunos >= 2;
    const totalValor = lista.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);

    console.log(`- Motorista: ${m.nome} (${m.email || m.telefone || m.id})`);
    console.log(`  Alunos ativos: ${contagemAlunos} (temAlunos: ${temAlunos})`);
    console.log(`  Cobranças hoje: ${lista.length} | Valor total: R$ ${totalValor.toFixed(2)}`);
  }

  if (!isExecute) {
    console.log(`\n==================================================`);
    console.log(`⚠️ Modo DRY-RUN concluído. Nenhuma notificação foi disparada.`);
    console.log(`Para disparar em produção, execute:`);
    console.log(`npx tsx scripts/trigger-driver-due-today.ts --execute`);
    console.log(`==================================================\n`);
    process.exit(0);
  }

  console.log(`\n🚨 Disparando notificações reais para os motoristas...`);
  await cobrancaService.enviarAlertaVencimentoHojeParaMotoristas();
  console.log(`✅ Disparo concluído com sucesso!\n`);
}

main().catch((err) => {
  logger.error({ err }, "Erro fatal ao executar script de alerta diário de parcelas");
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
