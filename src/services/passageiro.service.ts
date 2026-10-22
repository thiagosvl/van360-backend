import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { responsavelRepository } from "../repositories/responsavel.repository.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";
import { AppError } from "../errors/AppError.js";
import { CreatePassageiroDTO, ListPassageirosFiltersDTO, UpdatePassageiroDTO, CreateResponsavelAdicionalDTO, UpdateResponsavelAdicionalDTO, UpdatePassageiroBatchItemDTO, AtualizarPixPassageiroDTO } from "../types/dtos/passageiro.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, TipoResponsavel, ModoCobrancaEnum, ContratoStatus, RenovacaoStatus, TipoChavePix } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits, normalizePhone } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { parseLocalDate, toPersistenceString, getNowBR, getSafeDueDateString } from "../utils/date.utils.js";
import { isValidPixKey } from "../utils/validators.js";
import { pixValidationService } from "./pix-validation.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA } from "../config/constants.js";
import { NotificationChannelEnum, CobrancaStatus } from "../types/enums.js";
import { formatarPlacaExibicao } from "../utils/placa.utils.js";
import { userRepository } from "../repositories/user.repository.js";
import { calculateAuditDiff } from "../utils/audit-diff.util.js";
import { getFirstAndSecondName, getFirstName } from "../utils/format.js";
import { supabaseAdmin } from "../config/supabase.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { logger } from "../config/logger.js";

const MATRICULA_KEYS = [
    "ano_letivo",
    "ativo",
    "escola_id",
    "veiculo_id",
    "periodo",
    "modalidade",
    "turma",
    "sala",
    "nome_professor",
    "horario_entrada",
    "horario_saida",
    "valor_cobranca",
    "dia_vencimento",
    "isento",
    "modo_cobranca",
    "data_inicio_transporte",
    "data_fim_transporte",
    "data_inicio_cobranca",
    "data_fim_cobranca",
] as const;

const PERMANENT_KEYS = [
    "usuario_id",
    "nome",
    "data_nascimento",
    "genero",
    "observacoes",
    "enviar_notificacoes",
] as const;

const _matchContratoForYear = (contratos: Record<string, any>[] | undefined, targetYear: number) => {
    if (!Array.isArray(contratos) || contratos.length === 0) return null;
    const validContratos = contratos.filter((c) => c.status !== ContratoStatus.SUBSTITUIDO);
    const exactMatch = validContratos.find(
        (c) => Number(c.ano) === Number(targetYear) || (!c.ano && Number(targetYear) === 2026)
    );
    return exactMatch || null;
};

const _enrichPassageiroWithResponsavel = (p: Record<string, any>, isListMode: boolean = false) => {
    if (!p) return p;
    const links = (p.responsaveis as any[]) || [];
    const principalLink = links.find((l: any) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
    const rawResp = principalLink?.responsavel;
    const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

    const enriched: Record<string, any> = {
        ...p,
        responsavel_principal: principalLink && resp ? {
            id: resp.id,
            nome: resp.nome || null,
            telefone: resp.telefone || null,
            cpf: resp.cpf || null,
            email: resp.email || null,
            parentesco: principalLink.parentesco || null,
            logradouro: resp.logradouro || null,
            numero: resp.numero || null,
            bairro: resp.bairro || null,
            cidade: resp.cidade || null,
            estado: resp.estado || null,
            cep: resp.cep || null,
            referencia: resp.referencia || null,
            complemento: resp.complemento || null,
            notificacoes_rota_habilitadas: principalLink?.notificacoes_rota_habilitadas !== false,
        } : null
    };

    if (!isListMode) {
        const sortedLinks = [...links].sort((a: any, b: any) => {
            if (a.tipo === TipoResponsavel.PRINCIPAL) return -1;
            if (b.tipo === TipoResponsavel.PRINCIPAL) return 1;
            return 0;
        });
        enriched.responsaveis = sortedLinks.map((l: any) => {
            const rawLResp = l.responsavel;
            const lResp = Array.isArray(rawLResp) ? rawLResp[0] : rawLResp;
            return {
                id: lResp?.id || l.id,
                passageiro_id: p.id,
                nome: lResp?.nome || null,
                telefone: lResp?.telefone || null,
                cpf: lResp?.cpf || null,
                email: lResp?.email || null,
                parentesco: l.parentesco || null,
                tipo: l.tipo,
                notificacoes_rota_habilitadas: l.notificacoes_rota_habilitadas !== false,
                created_at: l.created_at,
                logradouro: lResp?.logradouro || null,
                numero: lResp?.numero || null,
                bairro: lResp?.bairro || null,
                cidade: lResp?.cidade || null,
                estado: lResp?.estado || null,
                cep: lResp?.cep || null,
                referencia: lResp?.referencia || null,
                complemento: lResp?.complemento || null
            };
        });
    } else {
        delete enriched.responsaveis;
    }

    return enriched;
};

const _preparePassageiroData = (data: Partial<CreatePassageiroDTO> | UpdatePassageiroDTO, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
        prepared.ativo = true;
    }

    if (data.nome) prepared.nome = cleanString(data.nome, true);

    if (data.escola_id !== undefined) prepared.escola_id = (data.escola_id === "none" || data.escola_id === "") ? null : data.escola_id;
    if (data.veiculo_id !== undefined) prepared.veiculo_id = (data.veiculo_id === "none" || data.veiculo_id === "") ? null : data.veiculo_id;

    if (data.observacoes !== undefined) prepared.observacoes = data.observacoes ? cleanString(data.observacoes, true) : null;

    if (data.periodo !== undefined) prepared.periodo = data.periodo ? cleanString(data.periodo.toLocaleLowerCase()) : null;
    if (data.genero !== undefined) prepared.genero = data.genero ? cleanString(data.genero) : null;
    if (data.valor_cobranca !== undefined) prepared.valor_cobranca = typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : (data.valor_cobranca || 0);
    if (data.dia_vencimento !== undefined) prepared.dia_vencimento = data.dia_vencimento;

    if (data.modalidade !== undefined) prepared.modalidade = data.modalidade;
    if (data.turma !== undefined) prepared.turma = data.turma ? cleanString(data.turma, true) : null;
    if (data.sala !== undefined) prepared.sala = data.sala ? cleanString(data.sala, true) : null;
    if (data.nome_professor !== undefined) prepared.nome_professor = data.nome_professor ? cleanString(data.nome_professor, true) : null;
    if (data.data_nascimento !== undefined && data.data_nascimento) {
        if (data.data_nascimento.getTime() > getNowBR().getTime()) {
            throw new AppError("Data de nascimento não pode ser no futuro", 400);
        }
        prepared.data_nascimento = toPersistenceString(data.data_nascimento);
    } else if (data.data_nascimento === null) {
        prepared.data_nascimento = null;
    }
    if (data.data_inicio_transporte !== undefined) prepared.data_inicio_transporte = data.data_inicio_transporte ? toPersistenceString(data.data_inicio_transporte) : null;
    if (data.data_fim_transporte !== undefined) prepared.data_fim_transporte = data.data_fim_transporte ? toPersistenceString(data.data_fim_transporte) : null;
    if (data.horario_entrada !== undefined) prepared.horario_entrada = data.horario_entrada ? cleanString(data.horario_entrada, true) : null;
    if (data.horario_saida !== undefined) prepared.horario_saida = data.horario_saida ? cleanString(data.horario_saida, true) : null;
    if (data.data_inicio_cobranca !== undefined) prepared.data_inicio_cobranca = data.data_inicio_cobranca ? toPersistenceString(data.data_inicio_cobranca) : null;
    if (data.data_fim_cobranca !== undefined) prepared.data_fim_cobranca = data.data_fim_cobranca ? toPersistenceString(data.data_fim_cobranca) : null;
    if (data.ano_letivo !== undefined) {
        prepared.ano_letivo = Number(data.ano_letivo);
    } else if (!isUpdate && data.data_inicio_cobranca) {
        prepared.ano_letivo = data.data_inicio_cobranca.getFullYear();
    }
    if (data.enviar_notificacoes !== undefined) prepared.enviar_notificacoes = data.enviar_notificacoes;

    if (data.ativo !== undefined) prepared.ativo = data.ativo;
    if (data.isento !== undefined) prepared.isento = data.isento;
    if (data.modo_cobranca !== undefined) prepared.modo_cobranca = data.modo_cobranca;

    if (prepared.horario_entrada && prepared.horario_saida && prepared.horario_saida <= prepared.horario_entrada) {
        throw new AppError("Horário de saída deve ser maior que o horário de entrada", 400);
    }

    if (prepared.isento === true) {
        prepared.valor_cobranca = null;
        prepared.dia_vencimento = null;
        prepared.data_inicio_cobranca = null;
        prepared.data_fim_cobranca = null;
        prepared.modo_cobranca = ModoCobrancaEnum.DESATIVADO;
    }

    return prepared;
};

const _syncResponsavelPrincipal = async (
    passageiroId: string,
    respData: Record<string, any>,
    currentResp?: Record<string, any> | null
) => {
    const rawPhone = respData.telefone || currentResp?.telefone;
    if (!rawPhone) return null;

    const targetPhone = normalizePhone(String(rawPhone));
    if (!targetPhone) return null;

    const respObj = await passageiroRepository.upsertResponsavel({
        telefone: targetPhone,
        nome: cleanString(respData.nome || currentResp?.nome || "Responsável", true),
        cpf: respData.cpf !== undefined ? (respData.cpf ? onlyDigits(String(respData.cpf)) : null) : (currentResp?.cpf || null),
        email: respData.email !== undefined ? (respData.email ? cleanString(String(respData.email).trim().toLowerCase()) : null) : (currentResp?.email || null),
        logradouro: respData.logradouro !== undefined ? (respData.logradouro ? cleanString(String(respData.logradouro), true) : null) : (currentResp?.logradouro || null),
        numero: respData.numero !== undefined ? (respData.numero ? String(respData.numero) : null) : (currentResp?.numero || null),
        bairro: respData.bairro !== undefined ? (respData.bairro ? cleanString(String(respData.bairro), true) : null) : (currentResp?.bairro || null),
        cidade: respData.cidade !== undefined ? (respData.cidade ? cleanString(String(respData.cidade), true) : null) : (currentResp?.cidade || null),
        estado: respData.estado !== undefined ? (respData.estado ? String(respData.estado).toUpperCase() : null) : (currentResp?.estado || null),
        cep: respData.cep !== undefined ? (respData.cep ? onlyDigits(String(respData.cep)) : null) : (currentResp?.cep || null),
        referencia: respData.referencia !== undefined ? (respData.referencia ? cleanString(String(respData.referencia), true) : null) : (currentResp?.referencia || null),
        complemento: respData.complemento !== undefined ? (respData.complemento ? cleanString(String(respData.complemento), true) : null) : (currentResp?.complemento || null),
    });

    const parentesco = respData.parentesco !== undefined ? respData.parentesco : (currentResp?.parentesco || null);
    const notificacoesRota = respData.notificacoes_rota_habilitadas !== undefined
        ? respData.notificacoes_rota_habilitadas
        : (currentResp?.notificacoes_rota_habilitadas !== undefined ? currentResp.notificacoes_rota_habilitadas : true);

    await passageiroRepository.linkPassageiroResponsavel(
        passageiroId,
        respObj.id,
        TipoResponsavel.PRINCIPAL,
        parentesco,
        notificacoesRota
    );

    return respObj;
};

const createPassageiro = async (data: CreatePassageiroDTO, isPreCadastro: boolean = false): Promise<any> => {
    if (!data.usuario_id) throw new Error("Usuário obrigatório");
    if (!data.nome) throw new Error("Nome do aluno é obrigatório");

    const passageiroData = _preparePassageiroData(data, data.usuario_id, false);
    const targetAnoLetivo = Number(passageiroData.ano_letivo) || getNowBR().getFullYear();
    passageiroData.ano_letivo = targetAnoLetivo;

    const { data: inserted, error } = await passageiroRepository.insert(passageiroData);

    if (error) throw error;

    const matriculaPayload: Record<string, unknown> = {
        usuario_id: inserted.usuario_id,
        passageiro_id: inserted.id,
        ano_letivo: targetAnoLetivo,
        ativo: inserted.ativo ?? true,
        escola_id: inserted.escola_id,
        veiculo_id: inserted.veiculo_id,
        periodo: inserted.periodo,
        modalidade: inserted.modalidade,
        turma: inserted.turma,
        sala: inserted.sala,
        nome_professor: inserted.nome_professor,
        horario_entrada: inserted.horario_entrada,
        horario_saida: inserted.horario_saida,
        valor_cobranca: inserted.valor_cobranca,
        dia_vencimento: inserted.dia_vencimento,
        isento: inserted.isento ?? false,
        modo_cobranca: inserted.modo_cobranca,
        data_inicio_transporte: inserted.data_inicio_transporte,
        data_fim_transporte: inserted.data_fim_transporte,
        data_inicio_cobranca: inserted.data_inicio_cobranca,
        data_fim_cobranca: inserted.data_fim_cobranca,
    };

    const { error: matError } = await passageiroRepository.upsertMatricula(matriculaPayload);
    if (matError) {
        await passageiroRepository.delete(inserted.id);
        throw matError;
    }

    const respPrincipalData = data.responsavel_principal;
    if (respPrincipalData) {
        try {
            await _syncResponsavelPrincipal(inserted.id, respPrincipalData);
        } catch (syncErr) {
            await passageiroRepository.delete(inserted.id);
            throw syncErr;
        }
    }

    if (!isPreCadastro) {
        historicoService.log({
            usuario_id: inserted.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: inserted.id,
            acao: AtividadeAcao.PASSAGEIRO_CRIADO,
            descricao: `Novo aluno ${getFirstAndSecondName(inserted.nome)} cadastrado.`,
            meta: {
                nome: inserted.nome,
                ano_letivo: targetAnoLetivo,
                responsavel: respPrincipalData?.nome || null,
                valor_cobranca: inserted.valor_cobranca
            }
        });
    }

    const fullPassageiro = await passageiroRepository.getByIdCompleto(inserted.id, undefined, targetAnoLetivo);
    return _enrichPassageiroWithResponsavel(fullPassageiro as Record<string, any>);
};

const updatePassageiro = async (id: string, data: UpdatePassageiroDTO, targetOwnerId?: string, assignedVeiculoId?: string): Promise<any> => {
    if (!id) throw new Error("ID do aluno é obrigatório");

    const requestedAno = data.ano_letivo ? Number(data.ano_letivo) : undefined;
    const estadoAnterior = await getPassageiro(id, targetOwnerId, assignedVeiculoId, requestedAno);
    if (!estadoAnterior) throw new AppError("Aluno não encontrado", 404);

    const effectiveAno = requestedAno || Number(estadoAnterior.ano_letivo) || getNowBR().getFullYear();
    const passageiroData = _preparePassageiroData(data, undefined, true);
    delete passageiroData.ano_letivo;

    const entradaFinal = passageiroData.horario_entrada !== undefined ? passageiroData.horario_entrada : estadoAnterior.horario_entrada;
    const saidaFinal = passageiroData.horario_saida !== undefined ? passageiroData.horario_saida : estadoAnterior.horario_saida;

    if (entradaFinal && saidaFinal && saidaFinal <= entradaFinal) {
        throw new AppError("Horário de saída deve ser maior que o horário de entrada", 400);
    }

    const permanentPayload: Record<string, unknown> = {};
    for (const key of PERMANENT_KEYS) {
        if (passageiroData[key] !== undefined) {
            permanentPayload[key] = passageiroData[key];
        }
    }

    const matriculaPayload: Record<string, unknown> = {};
    for (const key of MATRICULA_KEYS) {
        if (key !== "ano_letivo" && passageiroData[key] !== undefined) {
            matriculaPayload[key] = passageiroData[key];
        }
    }

    if (Object.keys(matriculaPayload).length > 0) {
        const { data: updatedMat, error: matErr } = await passageiroRepository.updateMatricula(id, effectiveAno, matriculaPayload);
        if (matErr) throw matErr;

        if (!updatedMat) {
            const upsertData: Record<string, unknown> = {
                usuario_id: estadoAnterior.usuario_id,
                passageiro_id: id,
                ano_letivo: effectiveAno,
                ativo: matriculaPayload.ativo ?? estadoAnterior.ativo ?? true,
                escola_id: matriculaPayload.escola_id ?? estadoAnterior.escola_id,
                veiculo_id: matriculaPayload.veiculo_id ?? estadoAnterior.veiculo_id,
                periodo: matriculaPayload.periodo !== undefined ? matriculaPayload.periodo : estadoAnterior.periodo,
                modalidade: matriculaPayload.modalidade !== undefined ? matriculaPayload.modalidade : estadoAnterior.modalidade,
                turma: matriculaPayload.turma !== undefined ? matriculaPayload.turma : estadoAnterior.turma,
                sala: matriculaPayload.sala !== undefined ? matriculaPayload.sala : estadoAnterior.sala,
                nome_professor: matriculaPayload.nome_professor !== undefined ? matriculaPayload.nome_professor : estadoAnterior.nome_professor,
                horario_entrada: matriculaPayload.horario_entrada !== undefined ? matriculaPayload.horario_entrada : estadoAnterior.horario_entrada,
                horario_saida: matriculaPayload.horario_saida !== undefined ? matriculaPayload.horario_saida : estadoAnterior.horario_saida,
                valor_cobranca: matriculaPayload.valor_cobranca !== undefined ? matriculaPayload.valor_cobranca : estadoAnterior.valor_cobranca,
                dia_vencimento: matriculaPayload.dia_vencimento !== undefined ? matriculaPayload.dia_vencimento : estadoAnterior.dia_vencimento,
                isento: matriculaPayload.isento ?? estadoAnterior.isento ?? false,
                modo_cobranca: matriculaPayload.modo_cobranca !== undefined ? matriculaPayload.modo_cobranca : estadoAnterior.modo_cobranca,
                data_inicio_transporte: matriculaPayload.data_inicio_transporte !== undefined ? matriculaPayload.data_inicio_transporte : estadoAnterior.data_inicio_transporte,
                data_fim_transporte: matriculaPayload.data_fim_transporte !== undefined ? matriculaPayload.data_fim_transporte : estadoAnterior.data_fim_transporte,
                data_inicio_cobranca: matriculaPayload.data_inicio_cobranca !== undefined ? matriculaPayload.data_inicio_cobranca : estadoAnterior.data_inicio_cobranca,
                data_fim_cobranca: matriculaPayload.data_fim_cobranca !== undefined ? matriculaPayload.data_fim_cobranca : estadoAnterior.data_fim_cobranca,
            };
            const { error: upsertErr } = await passageiroRepository.upsertMatricula(upsertData);
            if (upsertErr) throw upsertErr;
        }
    }

    const currentYear = getNowBR().getFullYear();
    const shouldMirrorMatriculaToLegacyTable =
        effectiveAno === currentYear ||
        (Array.isArray(estadoAnterior.anos_matriculados) && estadoAnterior.anos_matriculados.length <= 1);

    const legacyUpdatePayload = shouldMirrorMatriculaToLegacyTable
        ? { ...permanentPayload, ...matriculaPayload }
        : permanentPayload;

    if (Object.keys(legacyUpdatePayload).length > 0) {
        const { error } = await passageiroRepository.update(id, legacyUpdatePayload);
        if (error) throw error;
    }

    const valorMudou = passageiroData.valor_cobranca !== undefined && Number(passageiroData.valor_cobranca) !== Number(estadoAnterior.valor_cobranca);
    const vencimentoMudou = passageiroData.dia_vencimento !== undefined && passageiroData.dia_vencimento !== estadoAnterior.dia_vencimento;
    const modoMudou = passageiroData.modo_cobranca !== undefined && passageiroData.modo_cobranca !== estadoAnterior.modo_cobranca;
    const isentoMudou = passageiroData.isento !== undefined && passageiroData.isento !== estadoAnterior.isento;

    if (valorMudou || vencimentoMudou || modoMudou || isentoMudou) {
        try {
            const { data: cobrancasPendentes } = await supabaseAdmin
                .from("cobrancas")
                .select("id, mes, ano, ano_letivo, valor, data_vencimento, provedor_cobranca_id")
                .eq("passageiro_id", id)
                .eq("status", CobrancaStatus.PENDENTE)
                .or(`ano_letivo.eq.${effectiveAno},and(ano_letivo.is.null,ano.eq.${effectiveAno})`);

            if (cobrancasPendentes && cobrancasPendentes.length > 0) {
                for (const cob of cobrancasPendentes) {
                    if (passageiroData.isento === true) {
                        if (cob.provedor_cobranca_id) {
                            void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
                        }
                        await supabaseAdmin
                            .from("cobrancas")
                            .update({
                                status: CobrancaStatus.CANCELADA,
                                pix_copia_cola: null,
                                pix_qrcode_url: null,
                                pix_expiracao: null,
                                provedor_cobranca_id: null,
                                repasse_em_processamento: false
                            })
                            .eq("id", cob.id);
                    } else {
                        const updateCobData: Record<string, unknown> = {};

                        if (valorMudou && passageiroData.valor_cobranca !== null && passageiroData.valor_cobranca !== undefined) {
                            updateCobData.valor = passageiroData.valor_cobranca;
                        }

                        if (vencimentoMudou && passageiroData.dia_vencimento) {
                            updateCobData.data_vencimento = getSafeDueDateString(Number(passageiroData.dia_vencimento), cob.mes, cob.ano);
                        }

                        const deveCancelarPix = Boolean(
                            cob.provedor_cobranca_id && (
                                valorMudou ||
                                vencimentoMudou ||
                                passageiroData.modo_cobranca === ModoCobrancaEnum.DESATIVADO ||
                                passageiroData.modo_cobranca === ModoCobrancaEnum.LEMBRETES
                            )
                        );

                        if (deveCancelarPix && cob.provedor_cobranca_id) {
                            void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
                            updateCobData.pix_copia_cola = null;
                            updateCobData.pix_qrcode_url = null;
                            updateCobData.pix_expiracao = null;
                            updateCobData.provedor_cobranca_id = null;
                            updateCobData.repasse_em_processamento = false;
                        }

                        if (Object.keys(updateCobData).length > 0) {
                            await supabaseAdmin
                                .from("cobrancas")
                                .update(updateCobData)
                                .eq("id", cob.id);
                        }
                    }
                }
            }
        } catch (syncCobErr: unknown) {
            logger.error({ error: syncCobErr, passageiroId: id }, "[PassageiroService] Erro ao sincronizar cobranças pendentes na edição do aluno");
        }
    }

    if (data.responsavel_principal) {
        await _syncResponsavelPrincipal(id, data.responsavel_principal, estadoAnterior.responsavel_principal);
    }

    const fullPassageiro = await passageiroRepository.getByIdCompleto(id, undefined, effectiveAno);
    const enriched = _enrichPassageiroWithResponsavel(fullPassageiro as Record<string, any>);

    const diff = calculateAuditDiff(estadoAnterior, passageiroData);

    if (diff.hasChanges && fullPassageiro) {
        historicoService.log({
            usuario_id: fullPassageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: id,
            acao: AtividadeAcao.PASSAGEIRO_EDITADO,
            descricao: `Cadastro do aluno ${getFirstAndSecondName(fullPassageiro.nome)} (${effectiveAno}) atualizado.`,
            meta: {
                nome: fullPassageiro.nome,
                ano_letivo: effectiveAno,
                campos_alterados: diff.campos,
                campos: diff.campos,
                alteracoes: diff.alteracoes,
                responsavel: enriched.responsavel_principal?.nome || null,
                valor_cobranca: fullPassageiro.valor_cobranca,
                dia_vencimento: fullPassageiro.dia_vencimento
            }
        });
    }

    return getPassageiro(id, targetOwnerId, assignedVeiculoId, effectiveAno);
};

const deletePassageiro = async (id: string, targetOwnerId?: string, assignedVeiculoId?: string): Promise<void> => {
    if (!id) throw new Error("ID do aluno é obrigatório");

    const passageiro = await getPassageiro(id, targetOwnerId, assignedVeiculoId);

    if (passageiro?.id) {
        const { error } = await passageiroRepository.delete(id);
        if (error) throw error;

        historicoService.log({
            usuario_id: passageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: id,
            acao: AtividadeAcao.PASSAGEIRO_EXCLUIDO,
            descricao: `Aluno ${getFirstAndSecondName(passageiro.nome)} removido permanentemente.`,
            meta: {
                backup: passageiro
            }
        });
    }
};

const deleteMatricula = async (
    id: string,
    anoLetivo: number,
    targetOwnerId?: string,
    assignedVeiculoId?: string
): Promise<{ deletedStudent: boolean; remainingYears: number[] }> => {
    if (!id || !anoLetivo) throw new AppError("ID do aluno e ano letivo são obrigatórios", 400);

    const passageiro = await getPassageiro(id, targetOwnerId, assignedVeiculoId, anoLetivo);
    if (!passageiro) throw new AppError("Aluno não encontrado", 404);

    const { data: cobrancasPagas } = await supabaseAdmin
        .from("cobrancas")
        .select("id")
        .eq("passageiro_id", id)
        .eq("status", CobrancaStatus.PAGO)
        .or(`ano_letivo.eq.${anoLetivo},and(ano_letivo.is.null,ano.eq.${anoLetivo})`)
        .limit(1);

    if (cobrancasPagas && cobrancasPagas.length > 0) {
        throw new AppError(`Não é possível excluir a matrícula de ${anoLetivo} pois existem parcelas pagas neste ano letivo.`, 400);
    }

    const { data: todasMatriculas } = await passageiroRepository.getMatriculasByPassageiro(id);
    const listMats = todasMatriculas || [];

    if (listMats.length <= 1) {
        await deletePassageiro(id, targetOwnerId, assignedVeiculoId);
        return { deletedStudent: true, remainingYears: [] };
    }

    const { data: cobrancasPendentes } = await supabaseAdmin
        .from("cobrancas")
        .select("id, provedor_cobranca_id")
        .eq("passageiro_id", id)
        .eq("status", CobrancaStatus.PENDENTE)
        .or(`ano_letivo.eq.${anoLetivo},and(ano_letivo.is.null,ano.eq.${anoLetivo})`);

    if (cobrancasPendentes && cobrancasPendentes.length > 0) {
        for (const cob of cobrancasPendentes) {
            if (cob.provedor_cobranca_id) {
                void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
            }
        }
        await supabaseAdmin
            .from("cobrancas")
            .update({
                status: CobrancaStatus.CANCELADA,
                pix_copia_cola: null,
                pix_qrcode_url: null,
                pix_expiracao: null,
                provedor_cobranca_id: null,
                repasse_em_processamento: false,
            })
            .in("id", cobrancasPendentes.map((c) => c.id));
    }

    await supabaseAdmin
        .from("contratos")
        .update({ status: ContratoStatus.SUBSTITUIDO, updated_at: new Date().toISOString() })
        .eq("passageiro_id", id)
        .eq("ano", anoLetivo);

    const { error: delMatError } = await passageiroRepository.deleteMatricula(id, anoLetivo);
    if (delMatError) throw delMatError;

    await supabaseAdmin
        .from("passageiro_renovacoes")
        .update({
            status: RenovacaoStatus.PENDENTE,
            confirmado_em: null,
            updated_at: new Date().toISOString(),
        })
        .eq("passageiro_id", id)
        .eq("ano_destino", anoLetivo)
        .eq("status", RenovacaoStatus.CONFIRMADO);

    const remainingMats = listMats.filter((m) => Number(m.ano_letivo) !== Number(anoLetivo));
    const remainingYears = remainingMats.map((m) => Number(m.ano_letivo)).sort((a, b) => a - b);

    const fallbackMat = remainingMats.find((m) => Number(m.ano_letivo) === getNowBR().getFullYear()) || remainingMats[remainingMats.length - 1];
    if (fallbackMat) {
        await passageiroRepository.update(id, {
            ano_letivo: fallbackMat.ano_letivo,
            ativo: fallbackMat.ativo,
            escola_id: fallbackMat.escola_id,
            veiculo_id: fallbackMat.veiculo_id,
            periodo: fallbackMat.periodo,
            modalidade: fallbackMat.modalidade,
            turma: fallbackMat.turma,
            sala: fallbackMat.sala,
            nome_professor: fallbackMat.nome_professor,
            horario_entrada: fallbackMat.horario_entrada,
            horario_saida: fallbackMat.horario_saida,
            valor_cobranca: fallbackMat.valor_cobranca,
            dia_vencimento: fallbackMat.dia_vencimento,
            isento: fallbackMat.isento,
            modo_cobranca: fallbackMat.modo_cobranca,
            data_inicio_transporte: fallbackMat.data_inicio_transporte,
            data_fim_transporte: fallbackMat.data_fim_transporte,
            data_inicio_cobranca: fallbackMat.data_inicio_cobranca,
            data_fim_cobranca: fallbackMat.data_fim_cobranca,
        });
    }

    historicoService.log({
        usuario_id: passageiro.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: id,
        acao: AtividadeAcao.PASSAGEIRO_EDITADO,
        descricao: `Matrícula de ${anoLetivo} do aluno ${getFirstAndSecondName(passageiro.nome)} foi excluída.`,
        meta: {
            ano_excluido: anoLetivo,
            anos_restantes: remainingYears,
        }
    });

    return { deletedStudent: false, remainingYears };
};

const getPassageiro = async (id: string, targetOwnerId?: string, assignedVeiculoId?: string, anoLetivo?: number): Promise<any> => {
    const { data, error } = await passageiroRepository.getById(id, undefined, anoLetivo);

    if (error) throw error;
    if (!data) throw new AppError("Aluno não encontrado", 404);

    if (targetOwnerId && data.usuario_id !== targetOwnerId) {
        throw new AppError("Acesso negado", 403);
    }

    const enriched = _enrichPassageiroWithResponsavel(data);
    const allContratos = (data.contratos as Record<string, any>[]) || [];
    const targetYear = Number(data.ano_letivo) || getNowBR().getFullYear();

    const contratoDoAno = _matchContratoForYear(allContratos, targetYear);
    const statusContrato = contratoDoAno ? contratoDoAno.status : null;
    const contratoId = contratoDoAno ? contratoDoAno.id : null;
    const contratoUrl = contratoDoAno ? (contratoDoAno.contrato_final_url || contratoDoAno.minuta_url) : null;

    const rawMatriculas = Array.isArray(data.matriculas) ? (data.matriculas as Record<string, any>[]) : [];
    const matriculasEnriquecidas = [...rawMatriculas]
        .sort((a, b) => Number(a.ano_letivo) - Number(b.ano_letivo))
        .map((m) => {
            const cMat = _matchContratoForYear(allContratos, Number(m.ano_letivo));
            const contratoObj = cMat ? {
                id: cMat.id,
                status: cMat.status,
                provider: cMat.provider ?? null,
                minuta_url: cMat.minuta_url ?? null,
                contrato_final_url: cMat.contrato_final_url ?? null,
                token_acesso: cMat.token_acesso ?? null,
                ano: cMat.ano ?? null,
            } : null;
            return {
                ...m,
                contrato: contratoObj,
                status_contrato: cMat?.status ?? null,
                contrato_id: cMat?.id ?? null,
                contrato_url: cMat ? (cMat.contrato_final_url || cMat.minuta_url) : null,
                contrato_provider: cMat?.provider ?? null,
                minuta_url: cMat?.minuta_url ?? null,
                contrato_final_url: cMat?.contrato_final_url ?? null,
                token_acesso: cMat?.token_acesso ?? null,
                contrato_ano: cMat?.ano ?? null,
            };
        });

    return {
        ...enriched,
        matriculas: matriculasEnriquecidas,
        status_contrato: statusContrato,
        contrato_id: contratoId,
        contrato_url: contratoUrl,
        contrato_provider: contratoDoAno?.provider ?? null,
        minuta_url: contratoDoAno?.minuta_url,
        contrato_final_url: contratoDoAno?.contrato_final_url,
        token_acesso: contratoDoAno?.token_acesso,
        contrato_ano: contratoDoAno?.ano ?? null
    };
};

const listPassageiros = async (
    usuarioId: string,
    filtros?: ListPassageirosFiltersDTO
): Promise<{ list: any[]; total: number; page?: number; limit?: number; totalPages?: number }> => {
    if (!usuarioId) throw new Error("Usuário obrigatório");

    const { data, count, error } = await passageiroRepository.list(usuarioId, filtros);
    if (error) throw error;

    const listData = data || [];
    const total = count !== null && count !== undefined ? count : listData.length;

    const passageiros = listData.map((p: Record<string, any>) => {
        const enriched = _enrichPassageiroWithResponsavel(p, true);
        const targetYear = Number(p.ano_letivo) || getNowBR().getFullYear();
        const contratoDoAno = _matchContratoForYear(p.contratos as Record<string, any>[], targetYear);
        const enrichedClean = { ...enriched };
        delete enrichedClean.contratos;

        return {
            ...enrichedClean,
            status_contrato: contratoDoAno?.status ?? null,
            contrato_id: contratoDoAno?.id ?? null,
            contrato_status: contratoDoAno?.status ?? null,
            contrato_provider: contratoDoAno?.provider ?? null,
            token_acesso: contratoDoAno?.token_acesso ?? null,
            contrato_ano: contratoDoAno?.ano ?? null,
        };
    });

    const isPaginated = Boolean((filtros?.page && filtros.page > 0) || (filtros?.limit && filtros.limit > 0));
    const page = isPaginated ? (filtros?.page && filtros.page > 0 ? Number(filtros.page) : 1) : undefined;
    const limit = isPaginated ? (filtros?.limit && filtros.limit > 0 ? Number(filtros.limit) : 50) : undefined;
    const totalPages = limit ? Math.ceil(total / limit) : undefined;

    return {
        list: passageiros,
        total,
        page,
        limit,
        totalPages
    };
};

const toggleAtivo = async (passageiroId: string, novoStatus: boolean, targetOwnerId?: string, assignedVeiculoId?: string, anoLetivo?: number): Promise<boolean> => {
    const pass = await getPassageiro(passageiroId, targetOwnerId, assignedVeiculoId, anoLetivo);
    const effectiveAno = anoLetivo || Number(pass.ano_letivo) || getNowBR().getFullYear();
    const { error } = await passageiroRepository.updateAtivo(passageiroId, novoStatus, effectiveAno);

    if (error) throw new Error(`Falha ao alterar status do aluno: ${error.message}`);

    if (pass && pass.ativo !== novoStatus) {
        historicoService.log({
            usuario_id: pass.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: passageiroId,
            acao: AtividadeAcao.PASSAGEIRO_STATUS,
            descricao: `Cadastro de ${getFirstAndSecondName(pass.nome)} (${effectiveAno}) foi ${novoStatus ? 'ATIVADO' : 'DESATIVADO'}.`,
            meta: {
                ano_letivo: effectiveAno,
                ativo: novoStatus,
                alteracoes: [{
                    campo: "ativo",
                    de: pass.ativo,
                    para: novoStatus
                }],
                campos: ["ativo"]
            }
        });
    }

    return true;
};

const countListPassageirosByUsuario = async (
    usuarioId: string,
    filtros?: {
        ativo?: string;
        veiculo?: string;
        ano_letivo?: number | string;
    }
): Promise<number> => {
    const { count, error } = await passageiroRepository.countByUsuario(usuarioId, filtros);

    if (error) throw new Error(error.message || "Erro ao contar alunos");
    return count || 0;
};

const finalizePreCadastro = async (
    prePassageiroId: string,
    data: UpdatePassageiroDTO,
    usuarioId: string
): Promise<any> => {
    const { data: pre, error } = await prePassageiroRepository.getById(prePassageiroId, usuarioId);

    if (error) throw error;
    if (!pre) throw new AppError("Pré-cadastro não encontrado.", 404);

    const responsavelPrincipal = {
        nome: data.responsavel_principal?.nome || pre.nome_responsavel || "",
        telefone: data.responsavel_principal?.telefone || pre.telefone_responsavel || "",
        cpf: data.responsavel_principal?.cpf !== undefined ? data.responsavel_principal.cpf : (pre.cpf_responsavel || null),
        email: data.responsavel_principal?.email !== undefined ? data.responsavel_principal.email : (pre.email_responsavel || null),
        parentesco: data.responsavel_principal?.parentesco !== undefined ? data.responsavel_principal.parentesco : (pre.parentesco_responsavel || null),
        logradouro: data.responsavel_principal?.logradouro !== undefined ? data.responsavel_principal.logradouro : (pre.logradouro || null),
        numero: data.responsavel_principal?.numero !== undefined ? data.responsavel_principal.numero : (pre.numero || null),
        bairro: data.responsavel_principal?.bairro !== undefined ? data.responsavel_principal.bairro : (pre.bairro || null),
        cidade: data.responsavel_principal?.cidade !== undefined ? data.responsavel_principal.cidade : (pre.cidade || null),
        estado: data.responsavel_principal?.estado !== undefined ? data.responsavel_principal.estado : (pre.estado || null),
        cep: data.responsavel_principal?.cep !== undefined ? data.responsavel_principal.cep : (pre.cep || null),
        referencia: data.responsavel_principal?.referencia !== undefined ? data.responsavel_principal.referencia : (pre.referencia || null),
        complemento: data.responsavel_principal?.complemento !== undefined ? data.responsavel_principal.complemento : (pre.complemento || null),
    };

    const payload: CreatePassageiroDTO = {
        ...pre,
        ...data,
        nome: data.nome || pre.nome || pre.nome_aluno || "Aluno",
        usuario_id: usuarioId,
        responsavel_principal: responsavelPrincipal,
        ano_letivo: data.ano_letivo !== undefined ? data.ano_letivo : (pre.ano_letivo || getNowBR().getFullYear()),
        valor_cobranca: data.valor_cobranca !== undefined ? data.valor_cobranca : pre.valor_cobranca,
        dia_vencimento: data.dia_vencimento !== undefined ? data.dia_vencimento : pre.dia_vencimento,
    };

    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).created_at;
    delete (payload as Record<string, unknown>).updated_at;

    const novoPassageiro = await createPassageiro(payload, true);

    await prePassageiroRepository.delete(prePassageiroId);

    historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: novoPassageiro.id,
        acao: AtividadeAcao.PRE_CADASTRO_CONCLUIDO,
        descricao: `Cadastro Pendente de (${getFirstAndSecondName(novoPassageiro.nome)}) aprovado como aluno.`,
        meta: { pre_id: prePassageiroId }
    });

    return novoPassageiro;
};

const lookupResponsavelByCpf = async (usuarioId: string, searchVal: string): Promise<any> => {
    if (!usuarioId) throw new AppError("Usuário não identificado", 401);
    if (!searchVal) throw new AppError("Termo de busca obrigatório", 400);

    const termClean = normalizePhone(searchVal);

    const { data, error } = await passageiroRepository.lookupResponsavel(usuarioId, termClean);

    if (error) {
        throw new AppError("Erro ao buscar responsável.", 500);
    }

    return data;
};

const listarAniversariantesDoMes = async (usuarioId: string, mes: number, veiculoId?: string) => {
    if (!usuarioId) throw new Error("Usuário obrigatório");
    if (mes < 1 || mes > 12) throw new AppError("Mês inválido", 400);

    const { data: todosAtivos, error } = await passageiroRepository.listAniversariantesInfo(usuarioId, veiculoId);
    if (error) throw new AppError("Erro ao buscar alunos para aniversários", 500);

    let passageirosSemData = 0;
    const passageirosSemDataList: any[] = [];
    const aniversariantesMap = new Map<number, any[]>();
    for (let i = 1; i <= 5; i++) {
        aniversariantesMap.set(i, []);
    }

    const passageiros = todosAtivos || [];

    passageiros.forEach(p => {
        if (!p.data_nascimento) {
            passageirosSemData++;
            passageirosSemDataList.push({
                id: p.id,
                nome: p.nome,
                veiculo: p.veiculo,
                escola: p.escola
            });
            return;
        }

        const date = parseLocalDate(p.data_nascimento);
        const pMes = date.getMonth() + 1;

        if (pMes === mes) {
            const dia = date.getDate();
            const semanaNoMes = Math.ceil(dia / 7);
            const semanaGarantida = semanaNoMes > 5 ? 5 : semanaNoMes;

            const lista = aniversariantesMap.get(semanaGarantida) || [];
            lista.push({
                id: p.id,
                nome: p.nome,
                dia: dia,
                veiculo: p.veiculo,
                escola: p.escola
            });
            aniversariantesMap.set(semanaGarantida, lista);
        }
    });

    const semanasFormatadas = Array.from(aniversariantesMap.entries()).map(([semana, aniversariantes]) => {
        aniversariantes.sort((a, b) => a.dia - b.dia);
        return {
            semana,
            aniversariantes
        };
    }).filter(s => s.aniversariantes.length > 0);

    return {
        semanas: semanasFormatadas,
        passageirosSemData,
        passageirosSemDataList,
        totalPassageiros: passageiros.length
    };
};

const addResponsavelAdicional = async (passageiroId: string, data: CreateResponsavelAdicionalDTO) => {
    const result = await responsavelRepository.addResponsavelAdicional(passageiroId, {
        nome: cleanString(data.nome, true),
        telefone: normalizePhone(data.telefone),
        cpf: data.cpf ? onlyDigits(data.cpf) : null,
        email: data.email ? cleanString(data.email.trim().toLowerCase()) : null,
        parentesco: data.parentesco,
        logradouro: data.logradouro ? cleanString(data.logradouro, true) : null,
        numero: data.numero ? String(data.numero) : null,
        bairro: data.bairro ? cleanString(data.bairro, true) : null,
        cidade: data.cidade ? cleanString(data.cidade, true) : null,
        estado: data.estado ? String(data.estado).toUpperCase() : null,
        cep: data.cep ? onlyDigits(data.cep) : null,
        referencia: data.referencia ? cleanString(data.referencia, true) : null,
        complemento: data.complemento ? cleanString(data.complemento, true) : null,
        tornar_principal: data.tornar_principal,
        notificacoes_rota_habilitadas: data.notificacoes_rota_habilitadas,
    });

    const { data: passageiro } = await passageiroRepository.getById(passageiroId);
    if (passageiro) {
        historicoService.log({
            usuario_id: passageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.RESPONSAVEL,
            entidade_id: result.id,
            acao: AtividadeAcao.RESPONSAVEL_CADASTRADO,
            descricao: `Responsável ${getFirstName(data.nome)} cadastrado para o aluno ${getFirstAndSecondName(passageiro.nome)}.`,
            meta: {
                passageiro_id: passageiroId,
                passageiro_nome: passageiro.nome,
                responsavel_nome: data.nome,
                parentesco: data.parentesco
            }
        });
    }

    return result;
};

const updateResponsavelAdicional = async (responsavelId: string, data: UpdateResponsavelAdicionalDTO, passageiroId?: string) => {
    const prepared: Record<string, unknown> = {};
    if (data.nome !== undefined) prepared.nome = data.nome ? cleanString(data.nome, true) : null;
    if (data.telefone !== undefined) prepared.telefone = data.telefone ? normalizePhone(data.telefone) : null;
    if (data.cpf !== undefined) prepared.cpf = data.cpf ? onlyDigits(data.cpf) : null;
    if (data.email !== undefined) prepared.email = data.email ? cleanString(data.email.trim().toLowerCase()) : null;
    if (data.parentesco !== undefined) prepared.parentesco = data.parentesco;
    if (data.logradouro !== undefined) prepared.logradouro = data.logradouro ? cleanString(data.logradouro, true) : null;
    if (data.numero !== undefined) prepared.numero = data.numero ? String(data.numero) : null;
    if (data.bairro !== undefined) prepared.bairro = data.bairro ? cleanString(data.bairro, true) : null;
    if (data.cidade !== undefined) prepared.cidade = data.cidade ? cleanString(data.cidade, true) : null;
    if (data.estado !== undefined) prepared.estado = data.estado ? String(data.estado).toUpperCase() : null;
    if (data.cep !== undefined) prepared.cep = data.cep ? onlyDigits(data.cep) : null;
    if (data.referencia !== undefined) prepared.referencia = data.referencia ? cleanString(data.referencia, true) : null;
    if (data.complemento !== undefined) prepared.complemento = data.complemento ? cleanString(data.complemento, true) : null;
    if (data.tornar_principal !== undefined) prepared.tornar_principal = data.tornar_principal;
    if (data.notificacoes_rota_habilitadas !== undefined) prepared.notificacoes_rota_habilitadas = data.notificacoes_rota_habilitadas;

    const { data: respAnterior } = await responsavelRepository.getById(responsavelId);
    const result = await responsavelRepository.updateResponsavelAdicional(responsavelId, prepared, passageiroId);

    if (passageiroId) {
        const { data: passageiro } = await passageiroRepository.getById(passageiroId);
        const diff = calculateAuditDiff(respAnterior, prepared);

        if (passageiro && diff.hasChanges) {
            historicoService.log({
                usuario_id: passageiro.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.RESPONSAVEL,
                entidade_id: responsavelId,
                acao: AtividadeAcao.RESPONSAVEL_EDITADO,
                descricao: `Dados do responsável do aluno ${getFirstAndSecondName(passageiro.nome)} foram atualizados.`,
                meta: {
                    passageiro_id: passageiroId,
                    passageiro_nome: passageiro.nome,
                    responsavel_id: responsavelId,
                    campos_alterados: diff.campos,
                    campos: diff.campos,
                    alteracoes: diff.alteracoes
                }
            });

            if (diff.campos.includes("cpf") && prepared.cpf) {
                try {
                    const now = getNowBR();
                    const anoAtual = now.getFullYear();

                    const { data: cobrancasPendentes } = await supabaseAdmin
                        .from("cobrancas")
                        .select("id, provedor_cobranca_id, pix_copia_cola")
                        .eq("passageiro_id", passageiroId)
                        .eq("status", CobrancaStatus.PENDENTE)
                        .gte("ano", anoAtual)
                        .not("pix_copia_cola", "is", null);

                    if (cobrancasPendentes && cobrancasPendentes.length > 0) {
                        for (const cob of cobrancasPendentes) {
                            if (cob.provedor_cobranca_id) {
                                void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
                            }
                            await supabaseAdmin
                                .from("cobrancas")
                                .update({
                                    pix_copia_cola: null,
                                    pix_qrcode_url: null,
                                    pix_expiracao: null,
                                    provedor_cobranca_id: null,
                                    repasse_em_processamento: false
                                })
                                .eq("id", cob.id);
                        }
                    }
                } catch (cleanPixErr: unknown) {
                    logger.error({ error: cleanPixErr, passageiroId }, "[PassageiroService] Erro ao invalidar Pix pendentes na atualização do CPF do responsável");
                }
            }
        }
    }

    return result;
};

const deleteResponsavelAdicional = async (responsavelId: string, passageiroId?: string) => {
    if (passageiroId) {
        const { data: link } = await supabaseAdmin
            .from("passageiro_responsaveis")
            .select("tipo")
            .eq("passageiro_id", passageiroId)
            .eq("responsavel_id", responsavelId)
            .maybeSingle();

        if (link?.tipo === TipoResponsavel.PRINCIPAL) {
            throw new AppError("Não é permitido excluir o responsável principal do aluno.", 400);
        }
    }

    await responsavelRepository.deleteResponsavelAdicional(responsavelId, passageiroId);

    if (passageiroId) {
        const { data: passageiro } = await passageiroRepository.getById(passageiroId);
        if (passageiro) {
            historicoService.log({
                usuario_id: passageiro.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.RESPONSAVEL,
                entidade_id: responsavelId,
                acao: AtividadeAcao.RESPONSAVEL_EXCLUIDO,
                descricao: `Responsável removido do cadastro do aluno ${getFirstAndSecondName(passageiro.nome)}.`,
                meta: {
                    passageiro_id: passageiroId,
                    passageiro_nome: passageiro.nome,
                    responsavel_id: responsavelId
                }
            });
        }
    }

    return { success: true };
};

const setPrincipalResponsavel = async (passageiroId: string, responsavelId: string) => {
    await responsavelRepository.setPrincipalResponsavel(passageiroId, responsavelId);

    const { data: passageiro } = await passageiroRepository.getById(passageiroId);
    if (passageiro) {
        historicoService.log({
            usuario_id: passageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.RESPONSAVEL,
            entidade_id: responsavelId,
            acao: AtividadeAcao.RESPONSAVEL_PRINCIPAL,
            descricao: `Responsável principal alterado para o aluno ${getFirstAndSecondName(passageiro.nome)}.`,
            meta: {
                passageiro_id: passageiroId,
                passageiro_nome: passageiro.nome,
                responsavel_id: responsavelId,
                alteracoes: [{
                    campo: "responsavel_principal",
                    de: "adicional",
                    para: "principal"
                }],
                campos: ["responsavel_principal"]
            }
        });
    }

    return { success: true };
};

const toggleNotificacoesRota = async (passageiroId: string, responsavelId: string, status?: boolean) => {
    const updated = await responsavelRepository.toggleNotificacoesRota(passageiroId, responsavelId, status);

    const { data: passageiro } = await passageiroRepository.getById(passageiroId);
    if (passageiro) {
        const novoStatus = status !== false;
        historicoService.log({
            usuario_id: passageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.RESPONSAVEL,
            entidade_id: responsavelId,
            acao: AtividadeAcao.RESPONSAVEL_NOTIFICACAO,
            descricao: `Notificações de rota ${novoStatus ? "ativadas" : "desativadas"} para responsável do aluno ${getFirstAndSecondName(passageiro.nome)}.`,
            meta: {
                passageiro_id: passageiroId,
                passageiro_nome: passageiro.nome,
                responsavel_id: responsavelId,
                status: novoStatus,
                alteracoes: [{
                    campo: "notificacoes_rota_habilitadas",
                    de: !novoStatus,
                    para: novoStatus
                }],
                campos: ["notificacoes_rota_habilitadas"]
            }
        });
    }

    return updated;
};

const processarLembreteAniversarioMotorista = async (params: {
    motoristaId: string;
    telefone?: string;
    nomeMotorista?: string;
    mesAtual?: number;
    diaAtual?: number;
}): Promise<{ sent: boolean; reason?: string }> => {
    let { motoristaId, telefone, nomeMotorista, mesAtual, diaAtual } = params;

    if (!telefone || !nomeMotorista) {
        const { data: user } = await userRepository.getById(motoristaId);
        if (!user) return { sent: false, reason: "Motorista não encontrado" };
        telefone = user.telefone || "";
        nomeMotorista = user.nome || "Motorista";
    }

    if (!telefone) return { sent: false, reason: "Telefone não cadastrado" };

    const hoje = getNowBR();
    const mes = mesAtual || (hoje.getMonth() + 1);
    const dia = diaAtual || hoje.getDate();

    const { semanas, passageirosSemData, totalPassageiros } = await listarAniversariantesDoMes(motoristaId, mes);

    if (totalPassageiros === 0) {
        return { sent: false, reason: "Sem alunos cadastrados" };
    }

    const semanaAtualNoMes = Math.ceil(dia / 7);
    const semanaGarantida = semanaAtualNoMes > 5 ? 5 : semanaAtualNoMes;

    const dadosDaSemana = semanas.find(s => s.semana === semanaGarantida);
    const aniversariantesList = dadosDaSemana?.aniversariantes || [];

    await notificationService.notifyDriver(telefone, EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA, {
        nomeMotorista,
        aniversariantesList: aniversariantesList.map((p: any) => ({
            veiculo: p.veiculo?.placa ? formatarPlacaExibicao(p.veiculo.placa) : undefined,
            escola: p.escola?.nome,
            nome: p.nome,
            dia: p.dia,
            mes
        })),
        passageirosSemData
    }, { channels: [NotificationChannelEnum.FIREBASE], usuarioId: motoristaId });

    return { sent: true };
};

const updatePassageirosBatch = async (
    items: UpdatePassageiroBatchItemDTO[],
    targetOwnerId?: string,
    assignedVeiculoId?: string,
    batchAnoLetivo?: number
): Promise<{ success: boolean; updatedCount: number }> => {
    if (!targetOwnerId) {
        throw new AppError("Usuário não autenticado", 401);
    }

    if (!items || items.length === 0) {
        return { success: true, updatedCount: 0 };
    }

    const ids = items.map(i => i.id);
    const { data: passageirosExistentes, error } = await passageiroRepository.findByIds(ids);

    if (error) throw error;

    const existentesMap = new Map((passageirosExistentes || []).map(p => [p.id, p]));

    for (const item of items) {
        const existente = existentesMap.get(item.id);
        if (!existente || existente.usuario_id !== targetOwnerId) {
            throw new AppError(`Acesso negado para o aluno ${item.id}`, 403);
        }
    }

    const currentYear = getNowBR().getFullYear();
    let updatedCount = 0;
    const CHUNK_SIZE = 10;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item) => {
            const payload: Record<string, unknown> = {};
            const itemAno = item.ano_letivo || batchAnoLetivo || currentYear;

            if (item.escola_id !== undefined) payload.escola_id = (item.escola_id === "none" || item.escola_id === "") ? null : item.escola_id;
            if (item.veiculo_id !== undefined) payload.veiculo_id = (item.veiculo_id === "none" || item.veiculo_id === "") ? null : item.veiculo_id;
            if (item.turma !== undefined) payload.turma = item.turma ? cleanString(item.turma, true) : null;
            if (item.sala !== undefined) payload.sala = item.sala ? cleanString(item.sala, true) : null;
            if (item.nome_professor !== undefined) payload.nome_professor = item.nome_professor ? cleanString(item.nome_professor, true) : null;
            if (item.periodo !== undefined) payload.periodo = item.periodo ? cleanString(item.periodo.toLowerCase()) : null;
            if (item.valor_cobranca !== undefined) payload.valor_cobranca = typeof item.valor_cobranca === "string" ? moneyToNumber(item.valor_cobranca) : item.valor_cobranca;
            if (item.dia_vencimento !== undefined) payload.dia_vencimento = item.dia_vencimento;
            if (item.ativo !== undefined) payload.ativo = item.ativo;

            if (Object.keys(payload).length > 0) {
                const { error: updateMatError } = await passageiroRepository.updateMatricula(item.id, itemAno, payload);
                if (updateMatError) throw updateMatError;

                if (itemAno === currentYear) {
                    const { error: updateError } = await passageiroRepository.update(item.id, payload);
                    if (updateError) throw updateError;
                }
                updatedCount++;
            }
        }));
    }

    if (updatedCount > 0) {
        historicoService.log({
            usuario_id: targetOwnerId,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: targetOwnerId,
            acao: AtividadeAcao.PASSAGEIRO_EDITADO,
            descricao: `Atualização rápida realizada em ${updatedCount} aluno(s).`,
            meta: {
                total_atualizados: updatedCount,
                ano_letivo: batchAnoLetivo || currentYear,
                ids: items.map(i => i.id)
            }
        });
    }

    return { success: true, updatedCount };
};

const atualizarPixPassageiro = async (passageiroId: string, usuarioId: string, payload: AtualizarPixPassageiroDTO) => {
    if (!passageiroId) throw new AppError("ID do aluno é obrigatório", 400);

    const { data: passageiro } = await passageiroRepository.getById(passageiroId, usuarioId);
    if (!passageiro) throw new AppError("Aluno não encontrado", 404);

    const { chave_pix, tipo_chave_pix } = payload;
    if ((chave_pix && !tipo_chave_pix) || (!chave_pix && tipo_chave_pix)) {
        throw new AppError("A chave Pix e o tipo de chave Pix devem ser fornecidos juntos ou ambos nulos.", 400);
    }

    const updates: { chave_pix: string | null; tipo_chave_pix: TipoChavePix | null } = {
        chave_pix: null,
        tipo_chave_pix: null
    };

    if (chave_pix && tipo_chave_pix) {
        await pixValidationService.validarDisponibilidadeChavePix({
            chavePix: chave_pix,
            tipoChavePix: tipo_chave_pix,
            usuarioId,
            escopo: "ALUNO",
            entidadeId: passageiroId,
            veiculoId: passageiro.veiculo_id || null
        });
        updates.chave_pix = chave_pix;
        updates.tipo_chave_pix = tipo_chave_pix;
    }

    const { data: updated, error } = await passageiroRepository.update(passageiroId, updates);
    if (error) {
        throw new AppError(`Erro ao atualizar dados Pix do aluno: ${error.message}`, 500);
    }

    const pixDiff = calculateAuditDiff(
        { tipo_chave_pix: passageiro.tipo_chave_pix, chave_pix: passageiro.chave_pix },
        { tipo_chave_pix: updates.tipo_chave_pix, chave_pix: updates.chave_pix }
    );

    if (pixDiff.hasChanges) {
        const descricaoPix = updates.chave_pix
            ? (passageiro.chave_pix ? `Chave Pix do aluno ${passageiro.nome} atualizada.` : `Chave Pix própria configurada para o aluno ${passageiro.nome}.`)
            : `Chave Pix própria removida do aluno ${passageiro.nome}.`;

        historicoService.log({
            usuario_id: usuarioId,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: passageiroId,
            acao: AtividadeAcao.CHAVE_PIX_ALTERADA,
            descricao: descricaoPix,
            meta: {
                passageiro_id: passageiroId,
                nome: passageiro.nome,
                tipo_chave_pix: updates.tipo_chave_pix,
                chave_pix: updates.chave_pix ? "***" : null,
                campos: pixDiff.campos
            }
        });
    }

    return updated;
};

export const passageiroService = {
    createPassageiro,
    updatePassageiro,
    updatePassageirosBatch,
    atualizarPixPassageiro,
    deletePassageiro,
    deleteMatricula,
    getPassageiro,
    listPassageiros,
    toggleAtivo,
    countListPassageirosByUsuario,
    finalizePreCadastro,
    lookupResponsavelByCpf,
    listarAniversariantesDoMes,
    processarLembreteAniversarioMotorista,
    addResponsavelAdicional,
    updateResponsavelAdicional,
    deleteResponsavelAdicional,
    setPrincipalResponsavel,
    toggleNotificacoesRota
};
