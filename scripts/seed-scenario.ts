import { supabaseAdmin } from "../src/config/supabase.js";
import { env } from "../src/config/env.js";
import {
    randomNumber,
    escolas,
    veiculos,
    generateName,
    generateCPF,
    generateAddress,
    generateValorCobranca,
    bairros,
} from "./mocks.js";

import {
    PassageiroModalidade,
    PeriodoEnum,
    PassageiroGenero,
    ParentescoResponsavel,
    GastoCategoria,
    CobrancaStatus,
    CobrancaOrigem,
    CobrancaTipoPagamento,
} from "../src/types/enums.js";

import { cenarios, ScenarioConfig } from "./scenarios.config.js";

const ALLOW_PROD = process.argv.includes("--allow-prod") || process.env.ALLOW_SEED_PROD === "true";

if (env.NODE_ENV !== "development" && !ALLOW_PROD) {
    console.error(`[ERRO] O script de seed requer a flag --allow-prod ou a variável ALLOW_SEED_PROD=true para execução fora do ambiente de desenvolvimento. Ambiente atual: ${env.NODE_ENV}`);
    process.exit(1);
}

const TARGET_PHONE = "11951186951";

// Lê o nome do cenário passado via argumento CLI, ex: npm run seed:scenario -- cenario-1
const args = process.argv.slice(2);
const scenarioName = args[0] || "cenario-1";
const config: ScenarioConfig = cenarios[scenarioName];

if (!config) {
    console.error(`[ERRO] Cenário '${scenarioName}' não encontrado em scenarios.config.ts`);
    console.log(`Cenários disponíveis: ${Object.keys(cenarios).join(", ")}`);
    process.exit(1);
}

async function clearData(usuarioId: string) {
    console.log(`[SEED] Iniciando limpeza das tabelas (Cenário selecionado: ${scenarioName})...`);
    const tablesToClean = [
        "historico_atividades",
        "cobrancas",
        "contratos",
        "gastos",
        "pre_passageiros",
        "execucoes_rota",
        "rotas",
        "passageiros",
        "escolas",
        "veiculos",
        "gasto_categorias",
    ];

    for (const table of tablesToClean) {
        console.log(`- Deletando dados da tabela: ${table}`);
        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq("usuario_id", usuarioId);

        if (error) {
            console.error(`Erro ao limpar tabela ${table}:`, error);
            throw error;
        }
    }
    console.log("[SEED] Banco limpo com sucesso.");
}

async function seedEscolas(usuarioId: string, config: ScenarioConfig) {
    if (config.escolas.quantidade === 0) return [];
    console.log(`[SEED] Inserindo ${config.escolas.quantidade} escolas...`);

    const escolasToInsert = Array.from({ length: config.escolas.quantidade }).map((_, i) => {
        const e = escolas[i % escolas.length];
        return { ...e, nome: `${e.nome} ${i >= escolas.length ? `(${i + 1})` : ''}`.trim(), usuario_id: usuarioId, ativo: true };
    });

    const { data, error } = await supabaseAdmin
        .from("escolas")
        .insert(escolasToInsert)
        .select();

    if (error) throw error;
    return data;
}

async function seedVeiculos(usuarioId: string, config: ScenarioConfig) {
    if (config.veiculos.quantidade === 0) return [];
    console.log(`[SEED] Inserindo ${config.veiculos.quantidade} veículos...`);

    const veiculosToInsert = Array.from({ length: config.veiculos.quantidade }).map((_, i) => {
        const v = veiculos[i % veiculos.length];
        return { ...v, placa: `TST-${(1000 + i).toString()}`, usuario_id: usuarioId, ativo: true };
    });

    const { data, error } = await supabaseAdmin
        .from("veiculos")
        .insert(veiculosToInsert)
        .select();

    if (error) throw error;
    return data;
}

async function seedPassageiros(usuarioId: string, escolasInseridas: any[], veiculosInseridos: any[], config: ScenarioConfig) {
    if (config.passageiros.quantidade === 0) return [];

    console.log(`[SEED] Inserindo ${config.passageiros.quantidade} passageiros...`);
    const periodos = Object.values(PeriodoEnum);
    const modalidades = Object.values(PassageiroModalidade);
    const generos = Object.values(PassageiroGenero);
    const parentescos = Object.values(ParentescoResponsavel);

    const passageirosToInsert = Array.from({ length: config.passageiros.quantidade }).map(() => {
        const escola = escolasInseridas[randomNumber(0, escolasInseridas.length - 1)];
        const veiculo = veiculosInseridos[randomNumber(0, veiculosInseridos.length - 1)];
        const semEndereco = config.passageiros.percentualSemEndereco
            ? randomNumber(1, 100) <= config.passageiros.percentualSemEndereco
            : false;
        const endereco = semEndereco ? null : generateAddress();

        // Aniversariantes no mês atual baseado na porcentagem configurada
        let data_nascimento = null;
        if (randomNumber(1, 100) <= config.passageiros.percentualComAniversario) {
            const hoje = new Date();
            const ano = randomNumber(hoje.getFullYear() - 16, hoje.getFullYear() - 4); // Idade escolar
            const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
            const dia = randomNumber(1, 28).toString().padStart(2, '0');
            data_nascimento = `${ano}-${mes}-${dia}`;
        }

        return {
            usuario_id: usuarioId,
            escola_id: escola.id,
            veiculo_id: veiculo.id,
            nome: generateName(),
            ativo: true,
            periodo: periodos[randomNumber(0, periodos.length - 1)],
            modalidade: modalidades[randomNumber(0, modalidades.length - 1)],
            genero: generos[randomNumber(0, generos.length - 1)],
            turma: `${randomNumber(1, 9)}º ano`,

        const endereco = generateAddress();
        const respParentesco = parentescos[randomNumber(0, parentescos.length - 1)];

        return {
            passengerData: {
                usuario_id: usuarioId,
                escola_id: escola.id,
                veiculo_id: veiculo.id,
                nome: generateName(),
                ativo: true,
                periodo: periodos[randomNumber(0, periodos.length - 1)],
                modalidade: modalidades[randomNumber(0, modalidades.length - 1)],
                genero: generos[randomNumber(0, generos.length - 1)],
                turma: `${randomNumber(1, 9)}º ano`,

                logradouro: endereco ? endereco.logradouro : null,
                numero: endereco ? endereco.numero : null,
                bairro: endereco ? endereco.bairro : null,
                cidade: endereco ? endereco.cidade : null,
                estado: endereco ? endereco.estado : null,
                cep: endereco ? endereco.cep : null,
                referencia: endereco ? endereco.referencia : null,

                dia_vencimento: [5, 10, 15, 20][randomNumber(0, 3)],
                valor_cobranca: generateValorCobranca(),
                data_inicio_cobranca: new Date().toISOString().split("T")[0],
                data_fim_cobranca: "2028-12-31",
                data_inicio_transporte: new Date().toISOString().split("T")[0],
                data_fim_transporte: "2028-12-31",
                data_nascimento,

                enviar_notificacoes: true,
            },
            responsavelData: {
                nome: generateName(),
                cpf: generateCPF(),
                telefone: "11951186951",
                parentesco: respParentesco,
            }
        };
    });

    const insertedPassengers = [];
    for (const item of passageirosToInsert) {
        const { data: pData, error: pError } = await supabaseAdmin
            .from("passageiros")
            .insert(item.passengerData)
            .select()
            .single();

        if (pError) throw pError;

        const { data: rData, error: rError } = await supabaseAdmin
            .from("responsaveis")
            .insert({
                nome: item.responsavelData.nome,
                cpf: item.responsavelData.cpf,
                telefone: item.responsavelData.telefone,
            })
            .select()
            .single();

        if (rError) throw rError;

        await supabaseAdmin.from("passageiro_responsaveis").insert({
            passageiro_id: pData.id,
            responsavel_id: rData.id,
            tipo: "principal",
            parentesco: item.responsavelData.parentesco,
        });

        insertedPassengers.push(pData);
    }

    return insertedPassengers;
}

async function seedGastos(usuarioId: string, veiculosInseridos: any[], config: ScenarioConfig) {
    if (config.gastos.quantidadeTotal === 0) return;

    console.log(`[SEED] Inserindo ${config.gastos.quantidadeTotal} gastos...`);
    const descricoesGastos = ["Abastecimento Posto BR", "Troca de óleo", "Lavagem Completa", "Manutenção pneu furado", "Pedágio"];
    const categoriasGastos = Object.values(GastoCategoria);

    const gastosToInsert = Array.from({ length: config.gastos.quantidadeTotal }).map((_, index) => {
        // Decide se esse gasto tem veículo com base na configuração
        const gastosComVeiculo = config.gastos.quantidadeTotal - config.gastos.quantidadeSemVeiculo;
        const semVeiculo = index >= gastosComVeiculo;
        const veiculo_id = semVeiculo ? null : veiculosInseridos[randomNumber(0, veiculosInseridos.length - 1)].id;

        const diasAtras = randomNumber(0, 45);
        const data = new Date();
        data.setDate(data.getDate() - diasAtras);

        return {
            usuario_id: usuarioId,
            veiculo_id,
            descricao: descricoesGastos[randomNumber(0, descricoesGastos.length - 1)],
            categoria: categoriasGastos[randomNumber(0, categoriasGastos.length - 1)],
            valor: randomNumber(50, 400),
            data: data.toISOString().split("T")[0],
        };
    });

    const { error } = await supabaseAdmin.from("gastos").insert(gastosToInsert);
    if (error) throw error;
}

async function seedPrePassageiros(usuarioId: string, config: ScenarioConfig) {
    if (config.prePassageiros.quantidade === 0) return;

    console.log(`[SEED] Inserindo ${config.prePassageiros.quantidade} pré-passageiros (leads)...`);
    const periodos = Object.values(PeriodoEnum);

    const prePassageirosToInsert = Array.from({ length: config.prePassageiros.quantidade }).map(() => ({
        usuario_id: usuarioId,
        nome: generateName(),
        nome_responsavel: generateName(),
        telefone_responsavel: '11951186951',
        bairro: bairros[randomNumber(0, bairros.length - 1)],
        cidade: "São Paulo",
        periodo: periodos[randomNumber(0, periodos.length - 1)],
    }));

    const { error } = await supabaseAdmin.from("pre_passageiros").insert(prePassageirosToInsert);
    if (error) throw error;
}

async function seedCobrancas(usuarioId: string, passageirosInseridos: any[]) {
    if (!passageirosInseridos || passageirosInseridos.length === 0) return;

    console.log("[SEED] Inserindo cobranças do mês atual e anterior...");
    const hoje = new Date();
    const cobrancasToInsert: any[] = [];

    // Gerar cobranças para mês atual e mês anterior para popular os gráficos de faturamento
    for (const passageiro of passageirosInseridos) {
        if (!passageiro.valor_cobranca || !passageiro.dia_vencimento) continue;

        for (let i = 0; i <= 1; i++) {
            const dataVenc = new Date(hoje.getFullYear(), hoje.getMonth() - i, passageiro.dia_vencimento);
            const formatVenc = dataVenc.toISOString().split("T")[0];

            let status = CobrancaStatus.PENDENTE;
            let pagamento_manual = false;
            let data_pagamento = null;
            let valor_pago = null;
            let tipo_pagamento = null;

            const tiposPagamentoDisponiveis = Object.values(CobrancaTipoPagamento);
            const randomTipoPagamento = () => tiposPagamentoDisponiveis[randomNumber(0, tiposPagamentoDisponiveis.length - 1)];

            if (i === 1) {
                // Mês anterior: 95% de chance de estar pago
                if (randomNumber(1, 100) <= 95) {
                    status = CobrancaStatus.PAGO;
                    pagamento_manual = true;
                    data_pagamento = formatVenc;
                    valor_pago = passageiro.valor_cobranca;
                    tipo_pagamento = randomTipoPagamento();
                }
            } else {
                // Mês atual: depende do dia do vencimento
                if (dataVenc < hoje) {
                    // Já venceu
                    const rnd = randomNumber(1, 10);
                    if (rnd <= 8) { // 80% pago
                        status = CobrancaStatus.PAGO;
                        pagamento_manual = true;
                        data_pagamento = formatVenc;
                        valor_pago = passageiro.valor_cobranca;
                        tipo_pagamento = randomTipoPagamento();
                    }
                    // O resto fica pendente (atrasado logicamente)
                } else {
                    // A vencer
                    if (randomNumber(1, 10) <= 3) { // 30% pagou adiantado
                        status = CobrancaStatus.PAGO;
                        pagamento_manual = true;
                        data_pagamento = new Date().toISOString().split("T")[0];
                        valor_pago = passageiro.valor_cobranca;
                        tipo_pagamento = randomTipoPagamento();
                    }
                }
            }

            cobrancasToInsert.push({
                usuario_id: usuarioId,
                passageiro_id: passageiro.id,
                valor: passageiro.valor_cobranca,
                data_vencimento: formatVenc,
                mes: dataVenc.getMonth() + 1,
                ano: dataVenc.getFullYear(),
                status,
                origem: CobrancaOrigem.AUTOMATICA,
                pagamento_manual,
                data_pagamento,
                valor_pago,
                tipo_pagamento,
            });
        }
    }

    const { error } = await supabaseAdmin.from("cobrancas").insert(cobrancasToInsert);
    if (error) throw error;
}

async function seedResponsaveisAdicionais(passageirosInseridos: any[], config: ScenarioConfig) {
    if (!config.passageiros.percentualComResponsaveisAdicionais || config.passageiros.percentualComResponsaveisAdicionais === 0) return;
    if (!passageirosInseridos || passageirosInseridos.length === 0) return;

    console.log(`[SEED] Inserindo responsáveis adicionais para passageiros...`);
    const parentescos = Object.values(ParentescoResponsavel);

    const responsaveisToInsert = [];

    for (const passageiro of passageirosInseridos) {
        const deveTerResponsavel = randomNumber(1, 100) <= config.passageiros.percentualComResponsaveisAdicionais;
        if (deveTerResponsavel) {
            const endereco = generateAddress();
            responsaveisToInsert.push({
                passageiro_id: passageiro.id,
                nome: generateName(),
                telefone: "11951186951",
                cpf: generateCPF(),
                parentesco: parentescos[randomNumber(0, parentescos.length - 1)],
                logradouro: endereco.logradouro,
                numero: endereco.numero,
                bairro: endereco.bairro,
                cidade: endereco.cidade,
                estado: endereco.estado,
                cep: endereco.cep,
                referencia: endereco.referencia,
            });
        }
    }

    if (responsaveisToInsert.length === 0) return;

    const { error } = await supabaseAdmin
        .from("passageiro_responsaveis_adicionais")
        .insert(responsaveisToInsert);

    if (error) throw error;
    console.log(`[SEED] Inseridos ${responsaveisToInsert.length} responsáveis adicionais.`);
}

async function main() {
    console.log(`[SEED] Buscando usuário pelo telefone: ${TARGET_PHONE}...`);
    const { data: usuario, error: userError } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .eq("telefone", TARGET_PHONE)
        .single();

    if (userError || !usuario) {
        console.error("Usuário não encontrado!", userError);
        return;
    }

    const usuarioId = usuario.id;
    console.log(`[SEED] Usuário encontrado: ${usuarioId}. Iniciando processo com o cenário: '${scenarioName}'...`);

    try {
        await clearData(usuarioId);

        if (config.resetarPix) {
            console.log(`[SEED] Resetando configurações de Pix do usuário...`);
            const { error: updateError } = await supabaseAdmin
                .from("usuarios")
                .update({
                    chave_pix: null,
                    tipo_chave_pix: null,
                })
                .eq("id", usuarioId);

            if (updateError) {
                console.error("[SEED] Erro ao resetar configurações de Pix:", updateError);
            }
        }

        const escolasInseridas = await seedEscolas(usuarioId, config);
        const veiculosInseridos = await seedVeiculos(usuarioId, config);

        if (escolasInseridas && veiculosInseridos) {
            const passageirosInseridos = await seedPassageiros(usuarioId, escolasInseridas, veiculosInseridos, config);

            await seedResponsaveisAdicionais(passageirosInseridos, config);

            await seedGastos(usuarioId, veiculosInseridos, config);
            await seedPrePassageiros(usuarioId, config);

            if (passageirosInseridos && passageirosInseridos.length > 0) {
                await seedCobrancas(usuarioId, passageirosInseridos);
            }
        }

        console.log("[SUCCESS] Seed finalizado com sucesso! Seu banco está pronto para demonstração.");
    } catch (error) {
        console.error("[ERRO FATAL] Ocorreu um erro durante a execução do seed:", error);
    }
}

main().catch(console.error);
