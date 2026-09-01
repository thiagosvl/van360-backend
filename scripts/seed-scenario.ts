import { supabaseAdmin } from "../src/config/supabase.js";
import { env } from "../src/config/env.js";
import {
    randomNumber,
    nomes,
    escolas,
    veiculos,
    generateName,
    generateCPF,
    generatePhone,
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
    CobrancaTipoPagamento,
    TipoResponsavel,
    RouteSentido,
    RouteNodeType,
} from "../src/types/enums.js";

import { cenarios, ScenarioConfig } from "./scenarios.config.js";
import { santaMariaEscolas, santaMariaStops } from "./santa-maria-data.js";

const ALLOW_PROD = process.argv.includes("--allow-prod") || process.env.ALLOW_SEED_PROD === "true";

if (env.NODE_ENV !== "development" && !ALLOW_PROD) {
    console.error(`[ERRO] O script de seed requer a flag --allow-prod ou a variável ALLOW_SEED_PROD=true para execução fora do ambiente de desenvolvimento. Ambiente atual: ${env.NODE_ENV}`);
    process.exit(1);
}

const args = process.argv.slice(2);
const phoneArg = args.find(arg => arg.startsWith("--phone="));
const TARGET_PHONE = phoneArg ? phoneArg.replace("--phone=", "").replace(/\D/g, "") : (process.env.TARGET_PHONE || "11951186951");

const scenarioName = args.find(arg => !arg.startsWith("--")) || "cenario-1";
const config: ScenarioConfig = cenarios[scenarioName];

if (!config) {
    console.error(`[ERRO] Cenário '${scenarioName}' não encontrado em scenarios.config.ts`);
    console.log(`Cenários disponíveis: ${Object.keys(cenarios).join(", ")}`);
    process.exit(1);
}

async function cleanupOrphanedResponsaveis(responsavelIds: string[]) {
    if (!responsavelIds || responsavelIds.length === 0) return;
    const uniqueIds = Array.from(new Set(responsavelIds.filter(Boolean)));

    for (const respId of uniqueIds) {
        const { count, error } = await supabaseAdmin
            .from("passageiro_responsaveis")
            .select("id", { count: "exact", head: true })
            .eq("responsavel_id", respId);

        if (!error && count === 0) {
            await supabaseAdmin
                .from("responsaveis")
                .delete()
                .eq("id", respId);
        }
    }
}

async function clearData(usuarioId: string) {
    console.log(`[SEED] Iniciando limpeza das tabelas (Cenário selecionado: ${scenarioName})...`);

    const { data: passageirosUsuario } = await supabaseAdmin
        .from("passageiros")
        .select("id")
        .eq("usuario_id", usuarioId);

    const passageiroIds = (passageirosUsuario || []).map(p => p.id);
    let responsavelIdsParaChecar: string[] = [];

    if (passageiroIds.length > 0) {
        const { data: links } = await supabaseAdmin
            .from("passageiro_responsaveis")
            .select("responsavel_id")
            .in("passageiro_id", passageiroIds);
        responsavelIdsParaChecar = (links || []).map(l => l.responsavel_id);

        await supabaseAdmin
            .from("rota_ausencias")
            .delete()
            .in("passageiro_id", passageiroIds);

        await supabaseAdmin
            .from("passageiro_ausencias")
            .delete()
            .in("passageiro_id", passageiroIds);
    }

    const { data: rotasUsuario } = await supabaseAdmin
        .from("rotas")
        .select("id")
        .eq("usuario_id", usuarioId);

    const rotaIds = (rotasUsuario || []).map(r => r.id);

    if (rotaIds.length > 0) {
        await supabaseAdmin
            .from("execucoes_rota")
            .delete()
            .in("rota_id", rotaIds);

        await supabaseAdmin
            .from("rota_passageiros")
            .delete()
            .in("rota_id", rotaIds);
    }

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

    if (responsavelIdsParaChecar.length > 0) {
        await cleanupOrphanedResponsaveis(responsavelIdsParaChecar);
    }

    console.log("[SEED] Banco limpo com sucesso.");
}

async function seedEscolas(usuarioId: string, cfg: ScenarioConfig) {
    if (cfg.escolas.quantidade === 0) return [];
    console.log(`[SEED] Inserindo ${cfg.escolas.quantidade} escolas...`);

    const escolasToInsert = Array.from({ length: cfg.escolas.quantidade }).map((_, i) => {
        const e = escolas[i % escolas.length];
        return {
            ...e,
            nome: `${e.nome} ${i >= escolas.length ? `(${i + 1})` : ''}`.trim(),
            usuario_id: usuarioId,
            ativo: true,
        };
    });

    const { data, error } = await supabaseAdmin
        .from("escolas")
        .insert(escolasToInsert)
        .select();

    if (error) throw error;
    return data;
}

async function seedVeiculos(usuarioId: string, cfg: ScenarioConfig) {
    if (cfg.veiculos.quantidade === 0) return [];
    console.log(`[SEED] Inserindo ${cfg.veiculos.quantidade} veículos...`);

    const veiculosToInsert = Array.from({ length: cfg.veiculos.quantidade }).map((_, i) => {
        const v = veiculos[i % veiculos.length];
        return {
            ...v,
            placa: `VAN-${(1000 + i).toString()}`,
            usuario_id: usuarioId,
            ativo: true,
        };
    });

    const { data, error } = await supabaseAdmin
        .from("veiculos")
        .insert(veiculosToInsert)
        .select();

    if (error) throw error;
    return data;
}

async function seedPassageiros(
    usuarioId: string,
    escolasInseridas: any[],
    veiculosInseridos: any[],
    cfg: ScenarioConfig
) {
    if (cfg.passageiros.quantidade === 0) return [];

    console.log(`[SEED] Inserindo ${cfg.passageiros.quantidade} passageiros e responsáveis...`);
    const periodos = Object.values(PeriodoEnum);
    const modalidades = Object.values(PassageiroModalidade);
    const generos = [PassageiroGenero.MASCULINO, PassageiroGenero.FEMININO];
    const parentescos = Object.values(ParentescoResponsavel);

    const insertedPassengers: any[] = [];

    for (let index = 0; index < cfg.passageiros.quantidade; index++) {
        const escola = escolasInseridas[randomNumber(0, escolasInseridas.length - 1)];
        const veiculo = veiculosInseridos[randomNumber(0, veiculosInseridos.length - 1)];

        const semEndereco = cfg.passageiros.percentualSemEndereco
            ? randomNumber(1, 100) <= cfg.passageiros.percentualSemEndereco
            : false;
        const endereco = semEndereco ? null : generateAddress();

        const hoje = new Date();
        const ano = randomNumber(hoje.getFullYear() - 16, hoje.getFullYear() - 4);
        const fazAniversarioMesAtual = randomNumber(1, 100) <= cfg.passageiros.percentualComAniversario;
        let mesNum: number;
        if (fazAniversarioMesAtual) {
            mesNum = hoje.getMonth() + 1;
        } else {
            const outrosMeses = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => m !== (hoje.getMonth() + 1));
            mesNum = outrosMeses[randomNumber(0, outrosMeses.length - 1)];
        }
        const mes = mesNum.toString().padStart(2, '0');
        const dia = randomNumber(1, 28).toString().padStart(2, '0');
        const data_nascimento = `${ano}-${mes}-${dia}`;

        const hojeStr = new Date().toISOString().split("T")[0];

        const { data: pData, error: pError } = await supabaseAdmin
            .from("passageiros")
            .insert({
                usuario_id: usuarioId,
                escola_id: escola.id,
                veiculo_id: veiculo.id,
                nome: generateName(),
                ativo: true,
                isento: false,
                periodo: periodos[randomNumber(0, periodos.length - 1)],
                modalidade: modalidades[randomNumber(0, modalidades.length - 1)],
                genero: generos[randomNumber(0, generos.length - 1)],
                turma: `${randomNumber(1, 9)}º ano`,
                nome_professor: `Prof. ${nomes[randomNumber(0, nomes.length - 1)]}`,
                data_nascimento,
                dia_vencimento: [5, 10, 15, 20][randomNumber(0, 3)],
                valor_cobranca: generateValorCobranca(),
                data_inicio_cobranca: hojeStr,
                data_fim_cobranca: "2028-12-31",
                data_inicio_transporte: hojeStr,
                data_fim_transporte: "2028-12-31",
                enviar_notificacoes: true,
            })
            .select()
            .single();

        if (pError) throw pError;

        const respTelefone = index === 0 ? TARGET_PHONE : generatePhone();
        const respParentesco = parentescos[randomNumber(0, parentescos.length - 1)];

        const respPayload: Record<string, any> = {
            telefone: respTelefone,
            nome: generateName(),
            cpf: generateCPF(),
            email: `responsavel${index + 1}@exemplo.com`,
            logradouro: endereco ? endereco.logradouro : null,
            numero: endereco ? endereco.numero : null,
            bairro: endereco ? endereco.bairro : null,
            cidade: endereco ? endereco.cidade : null,
            estado: endereco ? endereco.estado : null,
            cep: endereco ? endereco.cep : null,
            referencia: endereco ? endereco.referencia : null,
            complemento: endereco ? endereco.complemento : null,
        };

        const { data: rData, error: rError } = await supabaseAdmin
            .from("responsaveis")
            .upsert(respPayload, { onConflict: "telefone" })
            .select()
            .single();

        if (rError) throw rError;

        await supabaseAdmin.from("passageiro_responsaveis").insert({
            passageiro_id: pData.id,
            responsavel_id: rData.id,
            tipo: TipoResponsavel.PRINCIPAL,
            parentesco: respParentesco,
        });

        const deveTerAdicional = cfg.passageiros.percentualComResponsaveisAdicionais
            ? randomNumber(1, 100) <= cfg.passageiros.percentualComResponsaveisAdicionais
            : false;

        if (deveTerAdicional) {
            const endAdicional = generateAddress();
            const { data: rAdicional, error: errAdicional } = await supabaseAdmin
                .from("responsaveis")
                .upsert({
                    telefone: generatePhone(),
                    nome: generateName(),
                    cpf: generateCPF(),
                    email: `adicional${index + 1}@exemplo.com`,
                    logradouro: endAdicional.logradouro,
                    numero: endAdicional.numero,
                    bairro: endAdicional.bairro,
                    cidade: endAdicional.cidade,
                    estado: endAdicional.estado,
                    cep: endAdicional.cep,
                    referencia: endAdicional.referencia,
                    complemento: endAdicional.complemento,
                }, { onConflict: "telefone" })
                .select()
                .single();

            if (!errAdicional && rAdicional) {
                await supabaseAdmin.from("passageiro_responsaveis").insert({
                    passageiro_id: pData.id,
                    responsavel_id: rAdicional.id,
                    tipo: TipoResponsavel.ADICIONAL,
                    parentesco: parentescos[randomNumber(0, parentescos.length - 1)],
                });
            }
        }

        insertedPassengers.push(pData);
    }

    return insertedPassengers;
}

async function seedRotas(
    usuarioId: string,
    veiculosInseridos: any[],
    escolasInseridas: any[],
    passageirosInseridos: any[],
    cfg: ScenarioConfig
) {
    if (!cfg.rotas || cfg.rotas.quantidade === 0) return;
    if (passageirosInseridos.length === 0 || escolasInseridas.length === 0) return;

    console.log(`[SEED] Criando ${cfg.rotas.quantidade} rotas com paradas e sequenciamento...`);

    const nomesRotas = [
        "Rota Manhã - Ida",
        "Rota Manhã - Volta",
        "Rota Tarde - Ida",
        "Rota Tarde - Volta",
    ];

    const passageirosPorRota = Math.ceil(passageirosInseridos.length / cfg.rotas.quantidade);

    for (let rIdx = 0; rIdx < cfg.rotas.quantidade; rIdx++) {
        const nomeRota = nomesRotas[rIdx % nomesRotas.length] || `Rota ${rIdx + 1}`;
        const veiculo = veiculosInseridos[rIdx % veiculosInseridos.length];
        const sentido = rIdx % 2 === 0 ? RouteSentido.INDO : RouteSentido.VOLTANDO;

        const { data: rota, error: rError } = await supabaseAdmin
            .from("rotas")
            .insert({
                usuario_id: usuarioId,
                nome: nomeRota,
                veiculo_id: veiculo ? veiculo.id : null,
            })
            .select()
            .single();

        if (rError || !rota) {
            console.error("Erro ao criar rota:", rError);
            continue;
        }

        const startIdx = rIdx * passageirosPorRota;
        const rotaPassageirosSlice = passageirosInseridos.slice(startIdx, startIdx + passageirosPorRota);
        const escolaPrincipal = escolasInseridas[rIdx % escolasInseridas.length];

        const paradasToInsert: any[] = [];
        let ordemAtual = 1;

        if (sentido === RouteSentido.INDO) {
            for (const pass of rotaPassageirosSlice) {
                paradasToInsert.push({
                    rota_id: rota.id,
                    tipo_no: RouteNodeType.PASSAGEIRO,
                    passageiro_id: pass.id,
                    escola_id: null,
                    ordem: ordemAtual++,
                    sentido: RouteSentido.INDO,
                });
            }
            paradasToInsert.push({
                rota_id: rota.id,
                tipo_no: RouteNodeType.ESCOLA,
                passageiro_id: null,
                escola_id: escolaPrincipal.id,
                ordem: ordemAtual++,
                sentido: RouteSentido.INDO,
            });
        } else {
            paradasToInsert.push({
                rota_id: rota.id,
                tipo_no: RouteNodeType.ESCOLA,
                passageiro_id: null,
                escola_id: escolaPrincipal.id,
                ordem: ordemAtual++,
                sentido: RouteSentido.VOLTANDO,
            });
            for (const pass of rotaPassageirosSlice) {
                paradasToInsert.push({
                    rota_id: rota.id,
                    tipo_no: RouteNodeType.PASSAGEIRO,
                    passageiro_id: pass.id,
                    escola_id: null,
                    ordem: ordemAtual++,
                    sentido: RouteSentido.VOLTANDO,
                });
            }
        }

        if (paradasToInsert.length > 0) {
            await supabaseAdmin.from("rota_passageiros").insert(paradasToInsert);
        }

        if (cfg.rotas.criarAusencias && rotaPassageirosSlice.length > 0) {
            const passageiroAusente = rotaPassageirosSlice[0];
            const hoje = new Date();
            const dataHoje = hoje.toISOString().split("T")[0];

            await supabaseAdmin.from("rota_ausencias").insert({
                rota_id: rota.id,
                passageiro_id: passageiroAusente.id,
                data_ausencia: dataHoje,
                sentido,
                registrado_por: usuarioId,
            });
        }
    }
}

async function seedGastos(usuarioId: string, veiculosInseridos: any[], cfg: ScenarioConfig) {
    if (cfg.gastos.quantidadeTotal === 0) return;

    console.log(`[SEED] Inserindo ${cfg.gastos.quantidadeTotal} gastos...`);
    const descricoesGastos = [
        "Abastecimento Posto BR",
        "Troca de óleo e filtro",
        "Lavagem Completa da Van",
        "Manutenção pneu e alinhamento",
        "Pedágio rodovia",
        "Seguro veicular",
        "Revisão preventiva de freios",
    ];
    const categoriasGastos = Object.values(GastoCategoria);

    const gastosToInsert = Array.from({ length: cfg.gastos.quantidadeTotal }).map((_, index) => {
        const gastosComVeiculo = cfg.gastos.quantidadeTotal - cfg.gastos.quantidadeSemVeiculo;
        const semVeiculo = index >= gastosComVeiculo || veiculosInseridos.length === 0;
        const veiculo_id = semVeiculo ? null : veiculosInseridos[randomNumber(0, veiculosInseridos.length - 1)].id;

        const diasAtras = randomNumber(0, 45);
        const data = new Date();
        data.setDate(data.getDate() - diasAtras);

        return {
            usuario_id: usuarioId,
            veiculo_id,
            descricao: descricoesGastos[randomNumber(0, descricoesGastos.length - 1)],
            categoria: categoriasGastos[randomNumber(0, categoriasGastos.length - 1)],
            valor: randomNumber(60, 450),
            data: data.toISOString().split("T")[0],
        };
    });

    const { error } = await supabaseAdmin.from("gastos").insert(gastosToInsert);
    if (error) throw error;
}

async function seedPrePassageiros(usuarioId: string, cfg: ScenarioConfig) {
    if (cfg.prePassageiros.quantidade === 0) return;

    console.log(`[SEED] Inserindo ${cfg.prePassageiros.quantidade} pré-passageiros (leads)...`);
    const periodos = Object.values(PeriodoEnum);
    const generos = [PassageiroGenero.MASCULINO, PassageiroGenero.FEMININO];

    const prePassageirosToInsert = Array.from({ length: cfg.prePassageiros.quantidade }).map(() => ({
        usuario_id: usuarioId,
        nome: generateName(),
        nome_responsavel: generateName(),
        telefone_responsavel: TARGET_PHONE,
        bairro: bairros[randomNumber(0, bairros.length - 1)],
        cidade: "São Paulo",
        periodo: periodos[randomNumber(0, periodos.length - 1)],
        genero: generos[randomNumber(0, generos.length - 1)],
        valor_cobranca: generateValorCobranca(),
        dia_vencimento: 10,
    }));

    const { error } = await supabaseAdmin.from("pre_passageiros").insert(prePassageirosToInsert);
    if (error) throw error;
}

async function seedCobrancas(usuarioId: string, passageirosInseridos: any[], cfg: ScenarioConfig) {
    if (!passageirosInseridos || passageirosInseridos.length === 0) return;

    console.log("[SEED] Inserindo cobranças do mês atual e anterior...");
    const hoje = new Date();
    const cobrancasToInsert: any[] = [];
    const taxaInadimplencia = cfg.cobrancas?.taxaInadimplencia ?? 20;

    const tiposPagamentoDisponiveis = Object.values(CobrancaTipoPagamento);
    const randomTipoPagamento = () => tiposPagamentoDisponiveis[randomNumber(0, tiposPagamentoDisponiveis.length - 1)];

    for (const passageiro of passageirosInseridos) {
        if (!passageiro.valor_cobranca || !passageiro.dia_vencimento) continue;

        for (let i = 0; i <= 1; i++) {
            const dataVenc = new Date(hoje.getFullYear(), hoje.getMonth() - i, passageiro.dia_vencimento);
            const formatVenc = dataVenc.toISOString().split("T")[0];

            let status = CobrancaStatus.PENDENTE;
            let pagamento_manual = false;
            let data_pagamento: string | null = null;
            let valor_pago: number | null = null;
            let tipo_pagamento: string | null = null;

            if (i === 1) {
                const taxaPagoMesAnterior = Math.max(10, 100 - taxaInadimplencia);
                if (randomNumber(1, 100) <= taxaPagoMesAnterior) {
                    status = CobrancaStatus.PAGO;
                    pagamento_manual = true;
                    data_pagamento = formatVenc;
                    valor_pago = passageiro.valor_cobranca;
                    tipo_pagamento = randomTipoPagamento();
                }
            } else {
                if (dataVenc < hoje) {
                    const taxaPagoVencido = Math.max(10, 100 - taxaInadimplencia);
                    if (randomNumber(1, 100) <= taxaPagoVencido) {
                        status = CobrancaStatus.PAGO;
                        pagamento_manual = true;
                        data_pagamento = formatVenc;
                        valor_pago = passageiro.valor_cobranca;
                        tipo_pagamento = randomTipoPagamento();
                    }
                } else {
                    if (randomNumber(1, 100) <= 25) {
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
                pagamento_manual,
                data_pagamento,
                valor_pago,
                tipo_pagamento,
                desativar_lembretes: false,
            });
        }
    }

    const { error } = await supabaseAdmin.from("cobrancas").insert(cobrancasToInsert);
    if (error) throw error;
}

async function seedSantaMariaRoute(usuarioId: string, cfg: ScenarioConfig) {
    console.log(`[SEED] Inserindo cenário de rota real Santa Maria (Brasília DF)...`);

    const escolasMap = new Map<string, string>();
    for (const esc of santaMariaEscolas) {
        const { data, error } = await supabaseAdmin.from("escolas").insert({
            usuario_id: usuarioId,
            nome: esc.nome,
            logradouro: esc.logradouro,
            numero: esc.numero,
            bairro: esc.bairro,
            cidade: esc.cidade,
            estado: esc.estado,
            cep: esc.cep,
        }).select("id").single();
        if (error) throw error;
        escolasMap.set(esc.id, data.id);
    }

    const { data: veiculo, error: vErr } = await supabaseAdmin.from("veiculos").insert({
        usuario_id: usuarioId,
        placa: "VAN-0360",
        marca: "Renault",
        modelo: "Master Executiva",
        ativo: true,
    }).select("id").single();
    if (vErr) throw vErr;

    const passageirosMap = new Map<string, any>();
    const responsaveisMap = new Map<string, string>();
    const passageirosList: any[] = [];
    let respIndex = 0;

    for (const stop of santaMariaStops) {
        if (stop.tipo_no === "passageiro" && stop.passageiro && stop.responsavel) {
            const passOriginalId = stop.passageiro.id;
            if (passageirosMap.has(passOriginalId)) continue;

            let respId = responsaveisMap.get(stop.responsavel.telefone);
            if (!respId) {
                respIndex++;
                const isFirst = respIndex === 1;
                const phoneToUse = isFirst ? TARGET_PHONE : generatePhone();

                const { data: resp, error: respErr } = await supabaseAdmin.from("responsaveis").insert({
                    nome: stop.responsavel.nome,
                    telefone: phoneToUse,
                    cpf: "39542391838",
                    email: "thiago-svl@hotmail.com",
                    logradouro: stop.responsavel.logradouro,
                    numero: stop.responsavel.numero,
                    bairro: stop.responsavel.bairro,
                    cidade: stop.responsavel.cidade,
                    estado: stop.responsavel.estado,
                    cep: stop.responsavel.cep,
                    complemento: stop.responsavel.complemento,
                }).select("id").single();
                if (respErr) throw respErr;
                respId = resp.id;
                responsaveisMap.set(stop.responsavel.telefone, respId);
            }

            const targetEscolaId = escolasMap.get(stop.passageiro.escola_id) || Array.from(escolasMap.values())[0];
            const { data: pass, error: passErr } = await supabaseAdmin.from("passageiros").insert({
                usuario_id: usuarioId,
                escola_id: targetEscolaId,
                veiculo_id: veiculo.id,
                nome: stop.passageiro.nome,
                data_nascimento: stop.passageiro.data_nascimento,
                genero: stop.passageiro.genero,
                modalidade: stop.passageiro.modalidade,
                periodo: stop.passageiro.periodo,
                valor_cobranca: stop.passageiro.valor_cobranca,
                dia_vencimento: stop.passageiro.dia_vencimento,
                ativo: true,
            }).select("id, nome, valor_cobranca, dia_vencimento").single();
            if (passErr) throw passErr;

            await supabaseAdmin.from("passageiro_responsaveis").insert({
                passageiro_id: pass.id,
                responsavel_id: respId,
                parentesco: stop.responsavel.parentesco,
                tipo: TipoResponsavel.PRINCIPAL,
            });

            passageirosMap.set(passOriginalId, pass.id);
            passageirosList.push(pass);
        }
    }

    const { data: rota, error: rotaErr } = await supabaseAdmin.from("rotas").insert({
        usuario_id: usuarioId,
        veiculo_id: veiculo.id,
        nome: "Meio-dia",
    }).select("id").single();
    if (rotaErr) throw rotaErr;

    const paradasToInsert: any[] = [];
    for (const stop of santaMariaStops) {
        if (stop.tipo_no === "escola" && stop.escola) {
            const escId = escolasMap.get(stop.escola.id) || Array.from(escolasMap.values())[0];
            paradasToInsert.push({
                rota_id: rota.id,
                tipo_no: RouteNodeType.ESCOLA,
                escola_id: escId,
                passageiro_id: null,
                ordem: stop.ordem,
                sentido: null,
            });
        } else if (stop.tipo_no === "passageiro" && stop.passageiro) {
            const passId = passageirosMap.get(stop.passageiro.id);
            if (passId) {
                paradasToInsert.push({
                    rota_id: rota.id,
                    tipo_no: RouteNodeType.PASSAGEIRO,
                    escola_id: null,
                    passageiro_id: passId,
                    ordem: stop.ordem,
                    sentido: stop.sentido === "voltando" ? RouteSentido.VOLTANDO : RouteSentido.INDO,
                });
            }
        }
    }

    if (paradasToInsert.length > 0) {
        const { error: paradasErr } = await supabaseAdmin.from("rota_passageiros").insert(paradasToInsert);
        if (paradasErr) throw paradasErr;
    }

    console.log(`[SEED] Rota Meio-dia criada com sucesso com ${paradasToInsert.length} paradas fiéis a produção!`);

    await seedCobrancas(usuarioId, passageirosList, cfg);
    await seedGastos(usuarioId, [veiculo], cfg);
}

async function main() {
    console.log(`[SEED] Buscando usuário pelo telefone: ${TARGET_PHONE}...`);
    const { data: usuario, error: userError } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .eq("telefone", TARGET_PHONE)
        .single();

    if (userError || !usuario) {
        console.error(`[ERRO] Usuário com telefone '${TARGET_PHONE}' não encontrado no banco de dados.`, userError);
        return;
    }

    const usuarioId = usuario.id;
    console.log(`[SEED] Usuário encontrado: ${usuarioId}. Iniciando cenário: '${scenarioName}'...`);

    try {
        await clearData(usuarioId);

        if (config.resetarPix) {
            console.log(`[SEED] Resetando chave Pix do usuário...`);
            const { error: updateError } = await supabaseAdmin
                .from("usuarios")
                .update({
                    chave_pix: null,
                    tipo_chave_pix: null,
                })
                .eq("id", usuarioId);

            if (updateError) {
                console.error("[SEED] Erro ao resetar Pix:", updateError);
            }
        }

        if (scenarioName === "cenario-rota-real") {
            await seedSantaMariaRoute(usuarioId, config);
        } else {
            const escolasInseridas = await seedEscolas(usuarioId, config);
            const veiculosInseridos = await seedVeiculos(usuarioId, config);

            if (escolasInseridas && veiculosInseridos) {
                const passageirosInseridos = await seedPassageiros(
                    usuarioId,
                    escolasInseridas,
                    veiculosInseridos,
                    config
                );

                await seedRotas(
                    usuarioId,
                    veiculosInseridos,
                    escolasInseridas,
                    passageirosInseridos,
                    config
                );

                await seedGastos(usuarioId, veiculosInseridos, config);
                await seedPrePassageiros(usuarioId, config);

                if (passageirosInseridos.length > 0) {
                    await seedCobrancas(usuarioId, passageirosInseridos, config);
                }
            }
        }

        console.log(`\n🎉 [SUCCESS] Cenário '${scenarioName}' executado com sucesso!`);
    } catch (error) {
        console.error("[ERRO FATAL] Falha ao executar o seed de cenário:", error);
    }
}

main().catch(console.error);
