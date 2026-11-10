import crypto from "node:crypto";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository, isMatriculaCoveringMonthYear } from "../repositories/passageiro.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO } from "../config/constants.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { getNowBR, toPersistenceString } from "../utils/date.utils.js";
import { getDriverDisplayName, getFirstAndSecondName } from "../utils/format.js";
import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import {
  AtividadeAcao,
  AtividadeEntidadeTipo,
  CobrancaStatus,
  CobrancaTipoPagamento,
  NotificationChannelEnum,
} from "../types/enums.js";
import type { Tables } from "../types/database.types.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { notifyReciboPassageiro } from "./cobranca-pagamento.service.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";
import { calculateAuditDiff } from "../utils/audit-diff.util.js";
import {
  CreateCobrancaOptions,
  enrichCobrancaWithResponsavelPrincipal,
} from "./cobranca-helpers.js";
import { cobrancaPixService } from "./cobranca-pix.service.js";
import { cobrancaGeracaoService, ListCobrancasFilterParams } from "./cobranca-geracao.service.js";
import { cobrancaNotificacaoService } from "./cobranca-notificacao.service.js";
import { cobrancaMotoristaAlertaService } from "./cobranca-motorista-alerta.service.js";

type CobrancaRow = Tables<"cobrancas">;

export const cobrancaService = {
  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await cobrancaRepository.countByPassageiro(passageiroId);
    if (error) throw error;
    return count || 0;
  },

  async createCobranca(data: CreateCobrancaDTO, options: CreateCobrancaOptions = {}): Promise<CobrancaRow> {
    if (!data.passageiro_id || !data.usuario_id) {
      throw new AppError("Campos obrigatórios ausentes (passageiro_id, usuario_id).", 400);
    }

    const requestedAnoLetivo = data.ano_letivo !== undefined && data.ano_letivo !== null ? Number(data.ano_letivo) : undefined;
    const passageiro = await passageiroRepository.getResponsavelInfo(data.passageiro_id, requestedAnoLetivo);

    if (!passageiro) throw new AppError("Aluno não encontrado para gerar cobrança.", 404);
    if (passageiro.isento === true) {
      throw new AppError("Aluno é isento de pagamento e não possui cobranças.", 400);
    }

    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;
    const statusVal = data.status || CobrancaStatus.PENDENTE;
    const cobrancaMes = Number(data.mes);
    const cobrancaAno = Number(data.ano);

    let resolvedAnoLetivo: number;
    if (requestedAnoLetivo !== undefined) {
      resolvedAnoLetivo = requestedAnoLetivo;
    } else {
      const { data: matriculas } = await passageiroRepository.getMatriculasByPassageiro(data.passageiro_id);
      const listMatriculas = (matriculas || []) as Array<Record<string, unknown>>;
      const exactCoveringMatricula = listMatriculas.find(
        (m) => Number(m.ano_letivo) === cobrancaAno && isMatriculaCoveringMonthYear(m, cobrancaMes, cobrancaAno)
      );
      const anyCoveringMatricula =
        exactCoveringMatricula ||
        listMatriculas.find((m) => isMatriculaCoveringMonthYear(m, cobrancaMes, cobrancaAno));
      const exactYearMatricula = listMatriculas.find((m) => Number(m.ano_letivo) === cobrancaAno);

      if (anyCoveringMatricula) {
        resolvedAnoLetivo = Number(anyCoveringMatricula.ano_letivo);
      } else if (exactYearMatricula) {
        resolvedAnoLetivo = Number(exactYearMatricula.ano_letivo);
      } else {
        resolvedAnoLetivo = cobrancaAno || Number(passageiro.ano_letivo) || getNowBR().getFullYear();
      }
    }

    const { data: existingCobranca } = await cobrancaRepository.getByPassageiroMesAno(
      data.passageiro_id,
      Number(data.mes),
      Number(data.ano)
    );

    let inserted: CobrancaRow;

    if (existingCobranca) {
      const valorMudou = Number(existingCobranca.valor) !== valorNumerico;
      const vencimentoMudou = existingCobranca.data_vencimento !== data.data_vencimento;
      const vaiParaPago = statusVal === CobrancaStatus.PAGO;

      if ((valorMudou || vencimentoMudou || vaiParaPago) && existingCobranca.provedor_cobranca_id) {
        await cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
          existingCobranca.id,
          existingCobranca.provedor_cobranca_id,
          existingCobranca.provedor
        );
      }

      const updateData: Record<string, unknown> = {
        valor: valorNumerico,
        data_vencimento: data.data_vencimento,
        status: statusVal,
        data_pagamento: statusVal === CobrancaStatus.PAGO ? data.data_pagamento || getNowBR().toISOString() : null,
        tipo_pagamento:
          statusVal === CobrancaStatus.PAGO ? data.tipo_pagamento || CobrancaTipoPagamento.PIX : null,
        valor_pago: statusVal === CobrancaStatus.PAGO ? valorNumerico : null,
        pagamento_manual: statusVal === CobrancaStatus.PAGO,
        ...(valorMudou || vencimentoMudou || vaiParaPago
          ? {
              pix_copia_cola: null,
              pix_qrcode_url: null,
              pix_expiracao: null,
              provedor_cobranca_id: null,
              provedor: null,
              boleto_linha_digitavel: null,
              boleto_codigo_barras: null,
              boleto_url: null,
              boleto_nosso_numero: null,
              repasse_em_processamento: false,
            }
          : {}),
      };

      if (data.desativar_lembretes !== undefined) {
        updateData.desativar_lembretes = data.desativar_lembretes;
      }
      if (data.ano_letivo !== undefined) {
        updateData.ano_letivo = Number(data.ano_letivo);
      } else if (existingCobranca.ano_letivo === null || existingCobranca.ano_letivo !== resolvedAnoLetivo) {
        updateData.ano_letivo = resolvedAnoLetivo;
      }
      if (data.observacao !== undefined) {
        updateData.observacao = data.observacao && data.observacao.trim() ? data.observacao.trim() : null;
      }

      const { data: updated, error: updateError } = await cobrancaRepository.update(
        existingCobranca.id,
        updateData
      );
      if (updateError || !updated) {
        throw new AppError(`Erro ao atualizar cobrança no banco: ${updateError?.message}`, 500);
      }
      inserted = updated;
    } else {
      const cobrancaId = crypto.randomUUID();
      const cobrancaData = {
        id: cobrancaId,
        passageiro_id: data.passageiro_id,
        usuario_id: data.usuario_id,
        mes: Number(data.mes),
        ano: Number(data.ano),
        ano_letivo: resolvedAnoLetivo,
        valor: valorNumerico,
        data_vencimento: data.data_vencimento,
        status: statusVal,
        data_pagamento: statusVal === CobrancaStatus.PAGO ? data.data_pagamento || getNowBR().toISOString() : null,
        tipo_pagamento:
          statusVal === CobrancaStatus.PAGO ? data.tipo_pagamento || CobrancaTipoPagamento.PIX : null,
        valor_pago: statusVal === CobrancaStatus.PAGO ? valorNumerico : null,
        pagamento_manual: statusVal === CobrancaStatus.PAGO,
        desativar_lembretes: data.desativar_lembretes ?? false,
        observacao: data.observacao && data.observacao.trim() ? data.observacao.trim() : null,
      };

      const { data: created, error: insertError } = await cobrancaRepository.insert(cobrancaData);
      if (insertError || !created) {
        throw new AppError(`Erro ao criar cobrança no banco: ${insertError?.message}`, 500);
      }
      inserted = created;
    }

    if (!options.skipLog) {
      const isPago = statusVal === CobrancaStatus.PAGO;
      const statusDescricao = isPago
        ? `paga${inserted.tipo_pagamento ? ` (${inserted.tipo_pagamento})` : ""}`
        : "pendente";

      historicoService.log({
        usuario_id: data.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: inserted.id,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: `Cobrança de R$ ${valorNumerico.toFixed(2)} (${data.mes}/${data.ano}) gerada como ${statusDescricao} para ${getFirstAndSecondName(passageiro.nome)}.`,
        meta: {
          passageiro_id: data.passageiro_id,
          mes: data.mes,
          ano: data.ano,
          valor: valorNumerico,
          status: inserted.status,
          ...(isPago
            ? {
                tipo_pagamento: inserted.tipo_pagamento,
                data_pagamento: inserted.data_pagamento,
                valor_pago: inserted.valor_pago,
              }
            : {}),
        },
      });
    }

    if (statusVal === CobrancaStatus.PAGO) {
      try {
        const reciboUrl = await receiptService.generateForCobranca(inserted.id);
        if (reciboUrl) {
          await cobrancaRepository.update(inserted.id, { recibo_url: reciboUrl });
          inserted.recibo_url = reciboUrl;
        }

        if (inserted.recibo_url) {
          await notifyReciboPassageiro(inserted.id, inserted, [NotificationChannelEnum.FIREBASE]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg, cobrancaId: inserted.id }, "[cobrancaService] Erro ao gerar/enviar recibo na criação");
      }
    }

    return inserted;
  },

  async updateCobranca(
    id: string,
    data: Partial<CreateCobrancaDTO>,
    cobrancaOriginal?: Record<string, unknown>
  ): Promise<CobrancaRow> {
    if (!id) throw new AppError("ID da cobrança é obrigatório", 400);

    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    if (cobrancaOriginal?.status === CobrancaStatus.PAGO) {
      throw new AppError("Não é possível editar uma parcela com pagamento já confirmado.", 400);
    }

    if (cobrancaOriginal?.status === CobrancaStatus.CANCELADA) {
      throw new AppError("Não é possível editar uma parcela cancelada. Reative-a primeiro.", 400);
    }

    await cobrancaValidacaoService.validarImpedimentoPorRepasse(
      id,
      cobrancaOriginal as { repasse_em_processamento?: boolean | null },
      "editar parcela"
    );

    const cobrancaData: Record<string, unknown> = {};
    const valorMudou = data.valor !== undefined && Number(data.valor) !== Number(cobrancaOriginal?.valor);
    const vencimentoMudou =
      data.data_vencimento !== undefined &&
      toPersistenceString(data.data_vencimento) !== cobrancaOriginal?.data_vencimento;

    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) {
      cobrancaData.data_vencimento = data.data_vencimento ? toPersistenceString(data.data_vencimento) : undefined;
    }

    if ((valorMudou || vencimentoMudou) && cobrancaOriginal?.provedor_cobranca_id) {
      await cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
        id,
        String(cobrancaOriginal.provedor_cobranca_id),
        cobrancaOriginal.provedor as string | null | undefined
      );
      cobrancaData.pix_copia_cola = null;
      cobrancaData.pix_qrcode_url = null;
      cobrancaData.pix_expiracao = null;
      cobrancaData.provedor_cobranca_id = null;
      cobrancaData.provedor = null;
      cobrancaData.boleto_linha_digitavel = null;
      cobrancaData.boleto_codigo_barras = null;
      cobrancaData.boleto_url = null;
      cobrancaData.boleto_nosso_numero = null;
      cobrancaData.repasse_em_processamento = false;
    }

    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);
    if (data.observacao !== undefined) {
      cobrancaData.observacao = data.observacao && data.observacao.trim() ? data.observacao.trim() : null;
    }

    const { data: updated, error } = await cobrancaRepository.update(id, cobrancaData);
    if (error || !updated) throw new AppError(`Erro ao atualizar cobrança: ${error?.message}`, 500);

    const diff = calculateAuditDiff(cobrancaOriginal, cobrancaData);

    if (diff.hasChanges) {
      const passObj =
        (cobrancaOriginal?.passageiros as { nome?: string } | undefined) ||
        (cobrancaOriginal?.passageiro as { nome?: string } | undefined);
      const passageiroNomeUpdate = passObj?.nome;

      historicoService.log({
        usuario_id: String(cobrancaOriginal?.usuario_id || updated.usuario_id),
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: id,
        acao: AtividadeAcao.COBRANCA_EDITADA,
        descricao: `Cobrança de ${cobrancaOriginal?.mes}/${cobrancaOriginal?.ano} do aluno ${getFirstAndSecondName(passageiroNomeUpdate)} editada pelo motorista.`,
        meta: {
          antes: { valor: cobrancaOriginal?.valor, vencimento: cobrancaOriginal?.data_vencimento },
          depois: { valor: updated.valor, vencimento: updated.data_vencimento },
          passageiro: passageiroNomeUpdate,
          campos_alterados: diff.campos,
          campos: diff.campos,
          alteracoes: diff.alteracoes,
        },
      });
    }

    return updated;
  },

  async getCobranca(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await cobrancaRepository.getById(id);
    if (error || !data) throw new AppError("Cobrança não encontrada.", 404);
    return enrichCobrancaWithResponsavelPrincipal(data as unknown as Record<string, unknown>);
  },

  async deleteCobranca(id: string): Promise<void> {
    const { data: cobranca, error: fetchError } = await cobrancaRepository.getByIdBasic(id);

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    if (cobranca.status === CobrancaStatus.PAGO) {
      throw new AppError("Não é possível cancelar uma parcela com pagamento confirmado.", 400);
    }

    await cobrancaValidacaoService.validarImpedimentoPorRepasse(id, cobranca, "cancelar parcela");

    if (cobranca.provedor_cobranca_id) {
      await cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
        id,
        cobranca.provedor_cobranca_id,
        cobranca.provedor
      );
    }

    const { error: updateError } = await cobrancaRepository.update(id, {
      status: CobrancaStatus.CANCELADA,
      repasse_em_processamento: false,
      pix_copia_cola: null,
      pix_qrcode_url: null,
      pix_expiracao: null,
      provedor_cobranca_id: null,
      provedor: null,
      boleto_linha_digitavel: null,
      boleto_codigo_barras: null,
      boleto_url: null,
      boleto_nosso_numero: null,
    });
    if (updateError) throw new AppError("Erro ao cancelar cobrança no banco de dados.", 500);

    void historicoRepository.deleteFalhaIntegracaoByEntidadeId(id);

    const cobrancaJoined = cobranca as unknown as Record<string, { nome?: string } | undefined>;
    const passageiroNomeDelete = cobrancaJoined.passageiros?.nome || cobrancaJoined.passageiro?.nome;

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EXCLUIDA,
      descricao: `Parcela de ${cobranca.mes}/${cobranca.ano} do aluno ${getFirstAndSecondName(passageiroNomeDelete)} foi cancelada.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        backup: cobranca,
      },
    });
  },

  async restaurarCobranca(id: string): Promise<CobrancaRow> {
    const { data: cobranca, error: fetchError } = await cobrancaRepository.getByIdBasic(id);

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para restauração.");
      throw new AppError("Erro ao buscar cobrança para restauração.", 500);
    }

    if (cobranca.status !== CobrancaStatus.CANCELADA) {
      throw new AppError("Apenas cobranças canceladas podem ser reativadas.", 400);
    }

    const { data: updated, error: updateError } = await cobrancaRepository.update(id, {
      status: CobrancaStatus.PENDENTE,
      repasse_em_processamento: false,
      updated_at: new Date().toISOString(),
    });

    if (updateError || !updated) throw new AppError("Erro ao reativar cobrança no banco de dados.", 500);

    const cobrancaJoined = cobranca as unknown as Record<string, { nome?: string } | undefined>;
    const passageiroNomeRestore = cobrancaJoined.passageiros?.nome || cobrancaJoined.passageiro?.nome;

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_CRIADA,
      descricao: `Parcela de ${cobranca.mes}/${cobranca.ano} do aluno ${getFirstAndSecondName(passageiroNomeRestore)} foi reativada para pendente.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        status: CobrancaStatus.PENDENTE,
      },
    });

    return updated;
  },

  listCobrancasWithFilters(filtros: ListCobrancasFilterParams) {
    return cobrancaGeracaoService.listCobrancasWithFilters(filtros);
  },

  listCobrancasByPassageiro(passageiroId: string, ano?: string) {
    return cobrancaGeracaoService.listCobrancasByPassageiro(passageiroId, ano);
  },

  toggleNotificacoes(cobrancaId: string, novoStatus: boolean) {
    return cobrancaNotificacaoService.toggleNotificacoes(cobrancaId, novoStatus);
  },

  gerarCobrancasMensaisParaMotorista(motoristaId: string, targetMonth: number, targetYear: number) {
    return cobrancaGeracaoService.gerarCobrancasMensaisParaMotorista(
      motoristaId,
      targetMonth,
      targetYear,
      (data, opts) => this.createCobranca(data, opts)
    );
  },

  gerarCobrancasMensaisParaTodos() {
    return cobrancaGeracaoService.gerarCobrancasMensaisParaTodos();
  },

  obterOuGerarPixCobranca(cobrancaId: string, options?: { force?: boolean }) {
    return cobrancaPixService.obterOuGerarPixCobranca(cobrancaId, options);
  },

  enviarNotificacoesDiarias() {
    return cobrancaNotificacaoService.enviarNotificacoesDiarias((id) => this.obterOuGerarPixCobranca(id));
  },

  processarResumoSemanalMotorista: cobrancaMotoristaAlertaService.processarResumoSemanalMotorista.bind(
    cobrancaMotoristaAlertaService
  ),
  enviarResumoSemanalMotoristas: cobrancaMotoristaAlertaService.enviarResumoSemanalMotoristas.bind(
    cobrancaMotoristaAlertaService
  ),
  dispararPushAlertaHojeParaMotorista: cobrancaMotoristaAlertaService.dispararPushAlertaHojeParaMotorista.bind(
    cobrancaMotoristaAlertaService
  ),
  processarAlertaVencimentoHojeMotorista:
    cobrancaMotoristaAlertaService.processarAlertaVencimentoHojeMotorista.bind(cobrancaMotoristaAlertaService),
  enviarAlertaVencimentoHojeParaMotoristas:
    cobrancaMotoristaAlertaService.enviarAlertaVencimentoHojeParaMotoristas.bind(
      cobrancaMotoristaAlertaService
    ),
  isDiaDeDisparoNoturno: cobrancaMotoristaAlertaService.isDiaDeDisparoNoturno.bind(
    cobrancaMotoristaAlertaService
  ),
  enviarLembreteNoturnoBaixasParaMotoristas:
    cobrancaMotoristaAlertaService.enviarLembreteNoturnoBaixasParaMotoristas.bind(
      cobrancaMotoristaAlertaService
    ),
  isentarEncargos: cobrancaPixService.isentarEncargos.bind(cobrancaPixService),
  processarLiquidacaoBancaria: cobrancaPixService.processarLiquidacaoBancaria.bind(cobrancaPixService),
};
