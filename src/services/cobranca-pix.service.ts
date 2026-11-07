import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { EVENTO_PASSAGEIRO_VENCIMENTO_HOJE } from "../config/constants.js";
import { getNowBR, toPersistenceString } from "../utils/date.utils.js";
import {
  AtividadeAcao,
  AtividadeEntidadeTipo,
  CheckoutPaymentMethod,
  CobrancaStatus,
  CobrancaTipoPagamento,
  ModoCobrancaEnum,
  NotificationChannelEnum,
  PaymentProvider,
  ProvedorPagamentoEnum,
} from "../types/enums.js";
import { paymentService } from "./payments/payment.service.js";
import { cobrancaCalculoService } from "./cobranca-calculo.service.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { cobrancaPagamentoService } from "./cobranca-pagamento.service.js";
import { historicoService } from "./historico.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { errorAlertService } from "./error-alert.service.js";
import { getResponsavelFromPassageiro, PassageiroCobrancaInfo } from "./cobranca-helpers.js";

export interface PixGeradoCobrancaResult {
  pixCopiaCola: string;
  pixQrCodeUrl?: string | null;
  valorTotalPix: number;
  boletoLinhaDigitavel?: string | null;
  boletoUrl?: string | null;
  boletoNossoNumero?: string | null;
}

export const cobrancaPixService = {
  async obterOuGerarPixCobranca(
    cobrancaId: string,
    options?: { force?: boolean }
  ): Promise<PixGeradoCobrancaResult | null> {
    const { data: cobranca } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);
    if (!cobranca || cobranca.status === CobrancaStatus.PAGO || cobranca.status === CobrancaStatus.CANCELADA) {
      return null;
    }

    const motoristaId = cobranca.usuario_id;
    if (!motoristaId) return null;

    const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(motoristaId);
    const passageiro = cobranca.passageiro as PassageiroCobrancaInfo & Record<string, unknown> | undefined;
    const pixResolvido = cobrancaCalculoService.resolverPixEfetivo({
      passageiro,
      motoristaConfig,
    });
    const chavePixRepasseEfetiva = pixResolvido.chave;

    const elegivel = cobrancaCalculoService.verificarElegibilidadeCobrancaAutomatica({
      motoristaConfig,
      passageiroModoCobranca: passageiro?.modo_cobranca as ModoCobrancaEnum | null | undefined,
      statusCobranca: cobranca.status,
      chavePixEfetiva: chavePixRepasseEfetiva,
    });

    if (!elegivel || !chavePixRepasseEfetiva) {
      if (cobranca.pix_copia_cola || cobranca.provedor_cobranca_id) {
        if (cobranca.provedor_cobranca_id) {
          void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
            cobranca.id,
            cobranca.provedor_cobranca_id,
            cobranca.provedor
          );
        }
        await cobrancaRepository.limparDadosPix(cobranca.id);
      }
      return null;
    }

    const chavePixMudou = Boolean(
      cobranca.chave_pix_repasse &&
        cobranca.chave_pix_repasse.trim() !== chavePixRepasseEfetiva.trim()
    );

    if ((options?.force || chavePixMudou) && cobranca.provedor_cobranca_id) {
      void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
        cobranca.id,
        cobranca.provedor_cobranca_id,
        cobranca.provedor
      );
      await cobrancaRepository.update(cobranca.id, {
        pix_copia_cola: null,
        pix_qrcode_url: null,
        pix_expiracao: null,
        provedor_cobranca_id: null,
        provedor: null,
        boleto_linha_digitavel: null,
        boleto_codigo_barras: null,
        boleto_url: null,
        boleto_nosso_numero: null,
        chave_pix_repasse: null,
      });
      cobranca.pix_copia_cola = null;
      cobranca.pix_qrcode_url = null;
      cobranca.pix_expiracao = null;
      cobranca.provedor_cobranca_id = null;
      cobranca.provedor = null;
      cobranca.boleto_linha_digitavel = null;
      cobranca.boleto_codigo_barras = null;
      cobranca.boleto_url = null;
      cobranca.boleto_nosso_numero = null;
      cobranca.chave_pix_repasse = null;
    }

    const agora = new Date();
    if (
      !options?.force &&
      !chavePixMudou &&
      ((cobranca.pix_copia_cola && cobranca.pix_expiracao && new Date(cobranca.pix_expiracao) > agora) ||
        cobranca.boleto_linha_digitavel)
    ) {
      return {
        pixCopiaCola: cobranca.pix_copia_cola || "",
        pixQrCodeUrl: cobranca.pix_qrcode_url,
        valorTotalPix: Number(cobranca.valor),
        boletoLinhaDigitavel: cobranca.boleto_linha_digitavel,
        boletoUrl: cobranca.boleto_url,
        boletoNossoNumero: cobranca.boleto_nosso_numero,
      };
    }

    const taxaGlobal = await motoristaFinanceiroRepository.getTaxaPadraoGlobal();
    const taxaPlataforma = cobrancaCalculoService.resolverTaxaPlataforma(
      motoristaConfig.taxa_personalizada,
      taxaGlobal
    );

    const valorOriginal = Number(cobranca.valor);
    const todayStr = toPersistenceString(getNowBR());
    const encargos = cobrancaCalculoService.resolverEncargosAtraso(motoristaConfig);

    const divisao = cobrancaCalculoService.calcularDivisaoCobranca({
      valorMensalidade: valorOriginal,
      taxaPlataforma,
    });

    const valorTotalPix = divisao.valorCobrancaPai;
    const valorRepasseMotorista = divisao.valorLiquidoMotorista;
    const passageiroNome = passageiro?.nome || "Aluno";

    const resp = getResponsavelFromPassageiro(passageiro);
    const respObj = resp.raw;
    const cleanTaxId = resp.cpf.replace(/\D/g, "");
    const hasValidTaxId = Boolean(cleanTaxId && (cleanTaxId.length === 11 || cleanTaxId.length === 14));

    if (encargos.hasOverdueRules && !hasValidTaxId) {
      logger.warn(
        { cobrancaId, motoristaId, passageiroId: cobranca.passageiro_id },
        "[CobrancaPixService] Cobrança possui regras de multa/juros mas o responsável não possui CPF cadastrado"
      );
      void errorAlertService.notifyPaymentError({
        provider:
          motoristaConfig?.provedor_ativo === ProvedorPagamentoEnum.BANCO_DO_BRASIL
            ? PaymentProvider.BANCO_DO_BRASIL
            : PaymentProvider.WOOVI,
        error: `Responsável do aluno ${passageiroNome} não possui CPF cadastrado (obrigatório para multa/juros)`,
        externalId: cobranca.id,
        amount: `R$ ${valorTotalPix.toFixed(2)}`,
        details: {
          motivo: "CPF_RESPONSAVEL_AUSENTE",
          motoristaId,
          passageiroId: cobranca.passageiro_id,
        },
      });
      historicoService.log({
        usuario_id: motoristaId,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: cobranca.id,
        acao: AtividadeAcao.COBRANCA_EDITADA,
        descricao: `Falha ao gerar Pix da cobrança (${cobranca.mes}/${cobranca.ano}): o responsável do aluno ${passageiroNome} não possui CPF cadastrado (obrigatório pelo Banco Central para regras de juros e multa).`,
        meta: {
          motivo: "CPF_RESPONSAVEL_AUSENTE",
          passageiro_id: cobranca.passageiro_id,
          cobranca_id: cobranca.id,
        },
      });
      return null;
    }

    const isBB = motoristaConfig?.provedor_ativo === ProvedorPagamentoEnum.BANCO_DO_BRASIL;
    const providerToUse = isBB ? PaymentProvider.BANCO_DO_BRASIL : PaymentProvider.WOOVI;
    const provedorEnumToUse = isBB ? ProvedorPagamentoEnum.BANCO_DO_BRASIL : ProvedorPagamentoEnum.WOOVI;

    const externalCorrelationId = `${cobranca.id}_${Date.now()}`;
    const chavePixSplit = chavePixRepasseEfetiva;

    const billingAddress = {
      street: respObj?.logradouro || "Não informado",
      number: respObj?.numero || "S/N",
      neighborhood: respObj?.bairro || "Centro",
      city: respObj?.cidade || "São Paulo",
      state: respObj?.estado || "SP",
      zipcode: respObj?.cep || "01001-000",
    };

    const splitsBB = [
      {
        pix_chave: "",
        amount: 0,
        description: JSON.stringify(motoristaConfig?.provedor_config || {}),
      },
    ];

    const chargeRes = await paymentService.createCharge(
      {
        externalId: externalCorrelationId,
        amount: valorTotalPix,
        description: `Parcela ${cobranca.mes}/${cobranca.ano} - ${passageiroNome}`,
        paymentMethod: isBB ? CheckoutPaymentMethod.BOLETO : CheckoutPaymentMethod.PIX,
        dueDate: cobranca.data_vencimento,
        daysAfterDueDate: encargos.daysAfterDueDate,
        fines: encargos.fines,
        interests: encargos.interests,
        customer: {
          name: resp.nome || passageiroNome,
          document: cleanTaxId || "",
          phone: resp.telefone || undefined,
          email: resp.email || undefined,
        },
        billingAddress,
        splits: isBB
          ? splitsBB
          : [
              {
                pix_chave: chavePixSplit,
                amount: valorRepasseMotorista,
              },
            ],
      },
      providerToUse
    );

    if (!chargeRes.success || (!chargeRes.pixCopyPaste && !chargeRes.boletoLinhaDigitavel)) {
      logger.error(
        { cobrancaId, error: chargeRes.error },
        `[CobrancaPixService] Falha ao criar cobrança no provedor ${providerToUse}`
      );
      historicoService.log({
        usuario_id: motoristaId,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: cobranca.id,
        acao: AtividadeAcao.COBRANCA_EDITADA,
        descricao: `Falha na integração ao gerar cobrança para o aluno ${passageiroNome}: ${chargeRes.error || "Erro desconhecido"}`,
        meta: {
          erro_provedor: chargeRes.error,
          cobranca_id: cobranca.id,
        },
      });
      return null;
    }

    const expiracaoBaseDate =
      cobranca.data_vencimento < todayStr ? getNowBR() : new Date(cobranca.data_vencimento);
    const expiracao = new Date(expiracaoBaseDate);
    expiracao.setDate(expiracao.getDate() + (encargos.hasOverdueRules ? encargos.daysAfterDueDate : 15));

    await cobrancaRepository.update(cobranca.id, {
      provedor: provedorEnumToUse,
      provedor_cobranca_id: chargeRes.providerId || externalCorrelationId,
      boleto_nosso_numero: chargeRes.boletoNossoNumero || null,
      boleto_linha_digitavel: chargeRes.boletoLinhaDigitavel || null,
      boleto_codigo_barras: chargeRes.boletoCodigoBarras || null,
      boleto_url: chargeRes.invoiceUrl || null,
      pix_copia_cola: chargeRes.pixCopyPaste || null,
      pix_qrcode_url: chargeRes.pixQrCodeUrl || null,
      pix_expiracao: expiracao.toISOString(),
      valor_taxa_plataforma: isBB ? 0 : taxaPlataforma,
      chave_pix_repasse: isBB ? null : chavePixSplit,
    });

    void historicoRepository.deleteFalhaIntegracaoByEntidadeId(cobranca.id);

    return {
      pixCopiaCola: chargeRes.pixCopyPaste || "",
      pixQrCodeUrl: chargeRes.pixQrCodeUrl || null,
      valorTotalPix,
      boletoLinhaDigitavel: chargeRes.boletoLinhaDigitavel || null,
      boletoUrl: chargeRes.invoiceUrl || null,
      boletoNossoNumero: chargeRes.boletoNossoNumero || null,
    };
  },

  async isentarEncargos(cobrancaId: string, motoristaId: string) {
    const { data: cobranca, error: cobrancaErr } = await cobrancaRepository.getById(cobrancaId);
    if (cobrancaErr || !cobranca) throw new AppError("Cobrança não encontrada", 404);
    if (cobranca.usuario_id && cobranca.usuario_id !== motoristaId) {
      throw new AppError("Acesso não autorizado a esta cobrança", 403);
    }
    if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já consta como paga", 400);
    if (cobranca.status === CobrancaStatus.CANCELADA) throw new AppError("Esta cobrança está cancelada", 400);
    if (!cobranca.pix_copia_cola || !cobranca.provedor_cobranca_id) {
      throw new AppError("Esta cobrança não possui código Pix de baixa automática", 400);
    }

    const todayStr = toPersistenceString(getNowBR());
    if (cobranca.data_vencimento >= todayStr) {
      throw new AppError("Esta cobrança não está em atraso", 400);
    }

    await cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
      cobranca.id,
      cobranca.provedor_cobranca_id,
      cobranca.provedor
    );

    const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(motoristaId);
    if (!motoristaConfig) {
      throw new AppError("Configurações financeiras do motorista não encontradas", 400);
    }

    const { data: passageiro } = await passageiroRepository.getById(cobranca.passageiro_id);
    const passageiroNome = (passageiro?.nome as string) || "Aluno";
    const resp = getResponsavelFromPassageiro(passageiro as PassageiroCobrancaInfo | null);
    const cleanTaxId = resp.cpf.replace(/\D/g, "");

    const taxaGlobal = await motoristaFinanceiroRepository.getTaxaPadraoGlobal();
    const taxaPlataforma = cobrancaCalculoService.resolverTaxaPlataforma(
      motoristaConfig.taxa_personalizada,
      taxaGlobal
    );

    const valorOriginal = Number(cobranca.valor);
    const divisao = cobrancaCalculoService.calcularDivisaoCobranca({
      valorMensalidade: valorOriginal,
      taxaPlataforma,
    });

    const valorTotalPix = divisao.valorCobrancaPai;
    const valorRepasseMotorista = divisao.valorLiquidoMotorista;
    const pixResolvido = cobrancaCalculoService.resolverPixEfetivo({
      passageiro,
      motoristaConfig,
      cobrancaSnapshotPix: cobranca.chave_pix_repasse,
    });
    const chavePixSplit = pixResolvido.chave;

    if (!chavePixSplit) {
      throw new AppError("Chave Pix de repasse do motorista não configurada", 400);
    }

    const externalCorrelationId = `${cobranca.id}_${Date.now()}`;

    const chargeRes = await paymentService.createCharge(
      {
        externalId: externalCorrelationId,
        amount: valorTotalPix,
        description: `Parcela ${cobranca.mes}/${cobranca.ano} - ${passageiroNome}`,
        paymentMethod: CheckoutPaymentMethod.PIX,
        dueDate: todayStr,
        daysAfterDueDate: 30,
        customer: {
          name: resp.nome || passageiroNome,
          document: cleanTaxId || "",
          phone: resp.telefone || undefined,
          email: resp.email || undefined,
        },
        splits: [
          {
            pix_chave: chavePixSplit,
            amount: valorRepasseMotorista,
          },
        ],
      },
      PaymentProvider.WOOVI
    );

    if (!chargeRes.success || !chargeRes.pixCopyPaste) {
      throw new AppError(`Falha ao gerar novo Pix na Woovi: ${chargeRes.error || "Erro desconhecido"}`, 500);
    }

    const expiracao = new Date(getNowBR());
    expiracao.setDate(expiracao.getDate() + 30);

    const { data: cobrancaAtualizada, error: updateErr } = await cobrancaRepository.update(cobranca.id, {
      data_vencimento: todayStr,
      provedor: ProvedorPagamentoEnum.WOOVI,
      provedor_cobranca_id: chargeRes.providerId || externalCorrelationId,
      pix_copia_cola: chargeRes.pixCopyPaste,
      pix_qrcode_url: chargeRes.pixQrCodeUrl || null,
      pix_expiracao: expiracao.toISOString(),
      valor_taxa_plataforma: taxaPlataforma,
      chave_pix_repasse: chavePixSplit,
      data_envio_ultima_notificacao: todayStr,
    });

    if (updateErr) throw updateErr;

    const telefoneResp = resp.telefone.trim();
    if (telefoneResp) {
      try {
        const { data: motoristaProfile } = await userRepository.getById(motoristaId);
        await notificationService.notifyPassenger(
          telefoneResp,
          EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
          {
            nomeResponsavel: resp.nome || "Responsável",
            nomePassageiro: passageiroNome,
            nomeMotorista: motoristaProfile?.apelido || motoristaProfile?.nome || "Motorista",
            apelidoMotorista: motoristaProfile?.apelido || undefined,
            telefoneMotorista: motoristaProfile?.telefone || undefined,
            valor: valorTotalPix,
            dataVencimento: todayStr,
            usuarioId: motoristaId,
            passageiroId: cobranca.passageiro_id,
            pixCopiaCola: chargeRes.pixCopyPaste,
            pixQrCodeUrl: chargeRes.pixQrCodeUrl || undefined,
            boletoLinhaDigitavel: chargeRes.boletoLinhaDigitavel,
            boletoUrl: chargeRes.invoiceUrl,
            boletoNossoNumero: chargeRes.boletoNossoNumero,
            mes: cobranca.mes,
            ano: cobranca.ano,
            cobrancaId: cobranca.id,
          },
          {
            channels: [NotificationChannelEnum.WABA],
            usuarioId: motoristaId,
            passageiroId: cobranca.passageiro_id,
            email: resp.email.trim() || undefined,
            metadata: {
              cobrancaId: cobranca.id,
              isencaoEncargos: true,
            },
          }
        );
      } catch (notifErr: unknown) {
        logger.error({ error: notifErr, cobrancaId }, "[CobrancaPixService] Falha ao enviar notificação WABA de isenção");
      }
    }

    await historicoService.log({
      usuario_id: motoristaId,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobranca.id,
      acao: AtividadeAcao.COBRANCA_EDITADA,
      descricao: `Isenção de juros e multa concedida para a parcela (${cobranca.mes}/${cobranca.ano}) do aluno ${passageiroNome}. Novo Pix gerado e enviado via WhatsApp.`,
      meta: {
        cobranca_id: cobranca.id,
        passageiro_id: cobranca.passageiro_id,
        novo_vencimento: todayStr,
        pix_copia_cola: chargeRes.pixCopyPaste,
      },
    });

    return cobrancaAtualizada;
  },

  async processarLiquidacaoBancaria(params: {
    nossoNumero: string;
    valorPago: number;
    dataPagamento: Date;
    provedor: ProvedorPagamentoEnum;
    tipoPagamento?: CobrancaTipoPagamento;
    pagadorNome?: string | null;
    pagadorDocumento?: string | null;
    pagadorBanco?: string | null;
  }): Promise<{ success: boolean; cobrancaId?: string; status: string }> {
    const {
      nossoNumero,
      valorPago,
      dataPagamento,
      provedor,
      tipoPagamento,
      pagadorNome,
      pagadorDocumento,
      pagadorBanco,
    } = params;

    const { data: cobrancaPorNossoNumero } = await cobrancaRepository.getByBoletoNossoNumero(nossoNumero);
    let cobranca = cobrancaPorNossoNumero;

    if (!cobranca) {
      const { data: cobrancaPorProvedor } = await cobrancaRepository.getByProvedorCobrancaId(nossoNumero);
      cobranca = cobrancaPorProvedor;
    }

    if (!cobranca) {
      const baseId = nossoNumero.split("_")[0];
      const { data: cobrancaPorId } = await cobrancaRepository.getById(baseId);
      cobranca = cobrancaPorId;
    }

    if (!cobranca) {
      logger.warn({ nossoNumero }, "[CobrancaPixService] Cobrança não encontrada para liquidação bancária");
      return { success: false, status: "cobranca_not_found" };
    }

    if (cobranca.status === CobrancaStatus.PAGO && !cobranca.pagamento_manual) {
      logger.info({ cobrancaId: cobranca.id, nossoNumero }, "[CobrancaPixService] Cobrança já liquidada anteriormente");
      return { success: true, cobrancaId: cobranca.id, status: "already_paid" };
    }

    const valorReal = valorPago > 0 ? valorPago : Number(cobranca.valor);

    await cobrancaPagamentoService.registrarPagamentoAutomatico(
      cobranca.id,
      dataPagamento,
      valorReal,
      tipoPagamento || CobrancaTipoPagamento.BOLETO,
      provedor,
      {
        pagadorNome,
        pagadorDocumento,
        pagadorBanco,
      }
    );

    return { success: true, cobrancaId: cobranca.id, status: "paid" };
  },
};
