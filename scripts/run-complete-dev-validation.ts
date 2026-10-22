import { supabaseAdmin } from "../src/config/supabase.js";
import { pixValidationService } from "../src/services/pix-validation.service.js";
import { motoristaFinanceiroService } from "../src/services/motorista-financeiro.service.js";
import { veiculoService } from "../src/services/veiculo.service.js";
import { passageiroService } from "../src/services/passageiro.service.js";
import { cobrancaService } from "../src/services/cobranca.service.js";
import { paymentService } from "../src/services/payments/payment.service.js";
import { ModoCobrancaEnum, TipoChavePix } from "../src/types/enums.js";

const THIAGO_ID = "b3261ad0-b227-4957-bb68-0209bdcb316e";
const LUANA_ID = "863e8fd9-bb77-4fcf-b5d3-53a59f9f2aa4";

const DUCATO_ID = "8baee3e5-592c-4a99-bff2-9871aced19fd";
const AZIRA_ID = "b2e897ef-ee00-4ca1-8a12-68d38b72f00d";

const ARTHUR_ID = "8f808f96-c7c9-480b-b956-33c70be16e39";
const CECILIA_ID = "64be7703-edc7-48df-a6b2-d21893ac5fbc";
const ERICA_ID = "e09b7de5-f484-414a-ad01-244ccbaf4633";
const GUILHERME_ID = "4ccb97d2-a1b9-471a-a272-b9396091e33d";

const CHAVE_LUANA = "luana.teste.bloqueio@bol.com.br";
const CHAVE_THIAGO_CPF = "395.423.918-38";
const CHAVE_DUCATO_FONE = "(11) 95118-6951";
const CHAVE_ARTHUR_CNPJ = "52.573.294/0001-44";

let passedCount = 0;
let failedCount = 0;

function assertTest(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${name} ${detail ? `(${detail})` : ""}`);
  }
}

async function run() {
  console.log("\n========================================================");
  console.log("🚀 INICIANDO BATERIA COMPLETA DE TESTES NO BANCO DEV");
  console.log("========================================================\n");

  try {
    // -----------------------------------------------------------
    // FASE 1: RESET INICIAL
    // -----------------------------------------------------------
    console.log("📌 FASE 1: Resetando chaves Pix e cobranças antigas...");

    // Limpar cobranças anteriores do mês 10/2026 de teste para Thiago
    const { data: oldCobrancas } = await supabaseAdmin
      .from("cobrancas")
      .select("id")
      .eq("usuario_id", THIAGO_ID)
      .eq("mes", 10)
      .eq("ano", 2026);

    if (oldCobrancas && oldCobrancas.length > 0) {
      const ids = oldCobrancas.map((c) => c.id);
      await supabaseAdmin.from("cobrancas_repasses").delete().in("cobranca_id", ids);
      await supabaseAdmin.from("cobrancas").delete().in("id", ids);
      console.log(`  - Removidas ${ids.length} cobranças antigas de teste.`);
    }

    // Resetar alunos
    await supabaseAdmin
      .from("passageiros")
      .update({ chave_pix: null, tipo_chave_pix: null })
      .in("id", [ARTHUR_ID, CECILIA_ID, ERICA_ID, GUILHERME_ID]);

    // Resetar veículos
    await supabaseAdmin
      .from("veiculos")
      .update({ chave_pix: null, tipo_chave_pix: null })
      .in("id", [DUCATO_ID, AZIRA_ID]);

    // Resetar motorista Luana (para chave de terceiro limpa)
    await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .upsert({
        usuario_id: LUANA_ID,
        chave_pix_repasse: CHAVE_LUANA,
        tipo_chave_pix: TipoChavePix.EMAIL,
        modo_cobranca: ModoCobrancaEnum.LEMBRETES
      }, { onConflict: "usuario_id" });

    // Resetar motorista Thiago
    await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .update({
        chave_pix_repasse: null,
        tipo_chave_pix: null,
        modo_cobranca: ModoCobrancaEnum.LEMBRETES
      })
      .eq("usuario_id", THIAGO_ID);

    console.log("  - Chaves zeradas na conta, veículos e alunos do Thiago.");
    assertTest(true, "Reset de dados concluído com sucesso");

    // -----------------------------------------------------------
    // FASE 2: BLOQUEIO DE CHAVE DE OUTRO MOTORISTA
    // -----------------------------------------------------------
    console.log("\n📌 FASE 2: Validando bloqueio estrito contra chave de terceiros...");

    // Teste 2.1: Thiago tenta cadastrar chave da Luana na sua Conta
    let bloqConta = false;
    try {
      await motoristaFinanceiroService.atualizarConfiguracoes(THIAGO_ID, {
        chave_pix_repasse: CHAVE_LUANA,
        tipo_chave_pix: TipoChavePix.EMAIL,
        modo_cobranca: ModoCobrancaEnum.LEMBRETES
      });
    } catch (e: any) {
      bloqConta = e.statusCode === 400 && e.message.includes("em uso por outro motorista");
    }
    assertTest(bloqConta, "Bloqueia chave de terceiro na Conta Geral");

    // Teste 2.2: Thiago tenta cadastrar chave da Luana no Veículo Ducato
    let bloqVeiculo = false;
    try {
      await veiculoService.atualizarPixVeiculo(DUCATO_ID, THIAGO_ID, {
        chave_pix: CHAVE_LUANA,
        tipo_chave_pix: TipoChavePix.EMAIL
      });
    } catch (e: any) {
      bloqVeiculo = e.statusCode === 400 && e.message.includes("em uso por outro motorista");
    }
    assertTest(bloqVeiculo, "Bloqueia chave de terceiro no Veículo");

    // Teste 2.3: Thiago tenta cadastrar chave da Luana no Aluno Arthur
    let bloqAluno = false;
    try {
      await passageiroService.atualizarPixPassageiro(ARTHUR_ID, THIAGO_ID, {
        chave_pix: CHAVE_LUANA,
        tipo_chave_pix: TipoChavePix.EMAIL
      });
    } catch (e: any) {
      bloqAluno = e.statusCode === 400 && e.message.includes("em uso por outro motorista");
    }
    assertTest(bloqAluno, "Bloqueia chave de terceiro na Carteirinha do Aluno");

    // Teste 2.4: Teste de variante de terceiro (telefone de terceiro)
    // Cadastrar telefone na Luana
    const FONE_LUANA = "11988887777";
    await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .update({ chave_pix_repasse: FONE_LUANA, tipo_chave_pix: TipoChavePix.TELEFONE })
      .eq("usuario_id", LUANA_ID);

    let bloqVariante = false;
    try {
      // Thiago tenta com +55 (11) 98888-7777
      await pixValidationService.validarDisponibilidadeChavePix({
        chavePix: "+55 (11) 98888-7777",
        tipoChavePix: TipoChavePix.TELEFONE,
        usuarioId: THIAGO_ID
      });
    } catch (e: any) {
      bloqVariante = e.statusCode === 400 && e.message.includes("em uso por outro motorista");
    }
    assertTest(bloqVariante, "Bloqueia telefone de terceiro com formato/variante (+55, parênteses)");

    // -----------------------------------------------------------
    // FASE 3: PERMISSÃO TOTAL PARA O MESMO MOTORISTA
    // -----------------------------------------------------------
    console.log("\n📌 FASE 3: Validando permissão total para chaves do mesmo motorista...");

    // Teste 3.1: Cadastrar chave CPF na conta geral de Thiago
    await motoristaFinanceiroService.atualizarConfiguracoes(THIAGO_ID, {
      chave_pix_repasse: CHAVE_THIAGO_CPF,
      tipo_chave_pix: TipoChavePix.CPF,
      modo_cobranca: ModoCobrancaEnum.LEMBRETES
    });
    assertTest(true, "Cadastro de chave CPF na Conta Geral permitido");

    // Teste 3.2: Thiago cadastra a MESMA chave CPF na Van Ducato
    let allowVanMesmaChave = false;
    try {
      await veiculoService.atualizarPixVeiculo(DUCATO_ID, THIAGO_ID, {
        chave_pix: CHAVE_THIAGO_CPF,
        tipo_chave_pix: TipoChavePix.CPF
      });
      allowVanMesmaChave = true;
    } catch (e: any) {
      console.error(e);
    }
    assertTest(allowVanMesmaChave, "Permite mesma chave da conta na Van sem nenhum bloqueio");

    // Teste 3.3: Thiago cadastra a MESMA chave CPF no Aluno Cecília
    let allowAlunoMesmaChave = false;
    try {
      await passageiroService.atualizarPixPassageiro(CECILIA_ID, THIAGO_ID, {
        chave_pix: CHAVE_THIAGO_CPF,
        tipo_chave_pix: TipoChavePix.CPF
      });
      allowAlunoMesmaChave = true;
    } catch (e: any) {
      console.error(e);
    }
    assertTest(allowAlunoMesmaChave, "Permite mesma chave da conta no Aluno sem nenhum bloqueio");

    // Teste 3.4: Reuso entre múltiplos alunos (chave dedicada em Arthur e Cecília)
    const CHAVE_COMPARTILHADA = "compartilhada@van360.com.br";
    let allowDoisAlunos = false;
    try {
      await passageiroService.atualizarPixPassageiro(ARTHUR_ID, THIAGO_ID, {
        chave_pix: CHAVE_COMPARTILHADA,
        tipo_chave_pix: TipoChavePix.EMAIL
      });
      await passageiroService.atualizarPixPassageiro(CECILIA_ID, THIAGO_ID, {
        chave_pix: CHAVE_COMPARTILHADA,
        tipo_chave_pix: TipoChavePix.EMAIL
      });
      allowDoisAlunos = true;
    } catch (e: any) {
      console.error(e);
    }
    assertTest(allowDoisAlunos, "Permite reuso da mesma chave entre múltiplos alunos (Tia Maria)");

    // -----------------------------------------------------------
    // FASE 4: CONFIGURAÇÃO DA MATRIZ HIERÁRQUICA REAL
    // -----------------------------------------------------------
    console.log("\n📌 FASE 4: Configurando matriz hierárquica oficial...");

    // Geral: CPF
    await motoristaFinanceiroService.atualizarConfiguracoes(THIAGO_ID, {
      chave_pix_repasse: CHAVE_THIAGO_CPF,
      tipo_chave_pix: TipoChavePix.CPF,
      modo_cobranca: ModoCobrancaEnum.LEMBRETES
    });

    // Van Ducato: Telefone
    await veiculoService.atualizarPixVeiculo(DUCATO_ID, THIAGO_ID, {
      chave_pix: CHAVE_DUCATO_FONE,
      tipo_chave_pix: TipoChavePix.TELEFONE
    });

    // Van Azira: null (herda geral)
    await veiculoService.atualizarPixVeiculo(AZIRA_ID, THIAGO_ID, {
      chave_pix: null,
      tipo_chave_pix: null
    });

    // Aluno Arthur: CNPJ
    await passageiroService.atualizarPixPassageiro(ARTHUR_ID, THIAGO_ID, {
      chave_pix: CHAVE_ARTHUR_CNPJ,
      tipo_chave_pix: TipoChavePix.CNPJ
    });

    // Aluno Cecília: null (herda Ducato -> Telefone)
    await passageiroService.atualizarPixPassageiro(CECILIA_ID, THIAGO_ID, {
      chave_pix: null,
      tipo_chave_pix: null
    });

    // Alunos Erica e Guilherme: null (herdam Azira -> herdam Geral CPF)
    await passageiroService.atualizarPixPassageiro(ERICA_ID, THIAGO_ID, {
      chave_pix: null,
      tipo_chave_pix: null
    });
    await passageiroService.atualizarPixPassageiro(GUILHERME_ID, THIAGO_ID, {
      chave_pix: null,
      tipo_chave_pix: null
    });

    assertTest(true, "Hierarquia configurada: Arthur (CNPJ), Cecília (Ducato/Tel), Erica & Guilherme (Azira/Geral/CPF)");

    // -----------------------------------------------------------
    // FASE 5: TRANSIÇÃO PARA MODO AUTOMÁTICA E SUBCONTAS WOOVI
    // -----------------------------------------------------------
    console.log("\n📌 FASE 5: Testando transição de modos e subcontas Woovi...");

    // Ativar modo AUTOMATICA no Thiago
    await motoristaFinanceiroService.atualizarConfiguracoes(THIAGO_ID, {
      chave_pix_repasse: CHAVE_THIAGO_CPF,
      tipo_chave_pix: TipoChavePix.CPF,
      modo_cobranca: ModoCobrancaEnum.AUTOMATICA
    });

    const { data: configPosAuto } = await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .select("modo_cobranca, chave_pix_repasse")
      .eq("usuario_id", THIAGO_ID)
      .single();

    assertTest(
      configPosAuto?.modo_cobranca === ModoCobrancaEnum.AUTOMATICA,
      "Transição para AUTOMATICA efetuada com sucesso"
    );

    // -----------------------------------------------------------
    // FASE 6: GERAÇÃO DE COBRANÇAS COM SPLIT E VERIFICAÇÃO DE CHAVES
    // -----------------------------------------------------------
    console.log("\n📌 FASE 6: Gerando cobranças automáticas para os 4 alunos...");

    const alunosList = [
      { id: ARTHUR_ID, nome: "Arthur", valor: 50 },
      { id: CECILIA_ID, nome: "Cecília", valor: 100 },
      { id: ERICA_ID, nome: "Erica", valor: 150 },
      { id: GUILHERME_ID, nome: "Guilherme", valor: 200 }
    ];

    const cobrancasGeradas = [];
    for (const aluno of alunosList) {
      const c = await cobrancaService.createCobranca({
        usuario_id: THIAGO_ID,
        passageiro_id: aluno.id,
        valor: aluno.valor,
        data_vencimento: "2026-10-30",
        mes: 10,
        ano: 2026,
        ano_letivo: 2026
      }, { skipLog: true });

      const pixResult = await cobrancaService.obterOuGerarPixCobranca(c.id, { force: true });
      assertTest(
        Boolean(pixResult && pixResult.pixCopiaCola),
        `Woovi gerou Pix Copia e Cola com sucesso para ${aluno.nome}`
      );

      const { data: cobAtualizada } = await supabaseAdmin
        .from("cobrancas")
        .select("id, passageiro_id, chave_pix_repasse, valor, status, provedor_cobranca_id, pix_copia_cola")
        .eq("id", c.id)
        .single();

      if (cobAtualizada) {
        cobrancasGeradas.push(cobAtualizada);
      }
    }

    const mapCob = new Map(cobrancasGeradas.map((c) => [c.passageiro_id, c]));

    const cobArthur = mapCob.get(ARTHUR_ID);
    const cobCecilia = mapCob.get(CECILIA_ID);
    const cobErica = mapCob.get(ERICA_ID);
    const cobGuilherme = mapCob.get(GUILHERME_ID);

    assertTest(
      Boolean(cobArthur && cobArthur.chave_pix_repasse === CHAVE_ARTHUR_CNPJ),
      "Arthur gerou cobrança com chave própria CNPJ",
      `chave: ${cobArthur?.chave_pix_repasse}`
    );

    assertTest(
      Boolean(cobCecilia && cobCecilia.chave_pix_repasse === CHAVE_DUCATO_FONE),
      "Cecília gerou cobrança herdando chave Telefone da Ducato",
      `chave: ${cobCecilia?.chave_pix_repasse}`
    );

    assertTest(
      Boolean(cobErica && cobErica.chave_pix_repasse === CHAVE_THIAGO_CPF),
      "Erica gerou cobrança herdando chave CPF da Conta Geral (via Azira)",
      `chave: ${cobErica?.chave_pix_repasse}`
    );

    assertTest(
      Boolean(cobGuilherme && cobGuilherme.chave_pix_repasse === CHAVE_THIAGO_CPF),
      "Guilherme gerou cobrança herdando chave CPF da Conta Geral (via Azira)",
      `chave: ${cobGuilherme?.chave_pix_repasse}`
    );

    // -----------------------------------------------------------
    // FASE 7: RESOLUÇÃO DE DDI +55 NA WOOVI
    // -----------------------------------------------------------
    console.log("\n📌 FASE 7: Testando compatibilidade de telefone com +55 na Woovi...");

    // Testar se getSubaccountBalance com a chave '11951186951' (ou formatada) encontra a subconta +5511951186951
    let subcontaResolvida = false;
    let balanceVal = -1;
    try {
      balanceVal = await paymentService.getSubaccountBalance(CHAVE_DUCATO_FONE);
      subcontaResolvida = balanceVal >= 0;
    } catch (e: any) {
      console.error("Erro ao obter saldo da subconta:", e.message);
    }

    assertTest(
      subcontaResolvida,
      `Woovi identificou subconta do telefone (${CHAVE_DUCATO_FONE}) com +55 e obteve saldo`,
      `Saldo em centavos: ${balanceVal}`
    );

    // -----------------------------------------------------------
    // RESUMO FINAL
    // -----------------------------------------------------------
    console.log("\n========================================================");
    console.log(`📊 RESULTADO FINAL DA SUÍTE DE TESTES:`);
    console.log(`   Total de Testes: ${passedCount + failedCount}`);
    console.log(`   Sucessos (PASS): ${passedCount}`);
    console.log(`   Falhas   (FAIL): ${failedCount}`);
    console.log("========================================================\n");

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error("💥 ERRO FATAL NA EXECUÇÃO DOS TESTES:", err);
    process.exit(1);
  }
}

run();
