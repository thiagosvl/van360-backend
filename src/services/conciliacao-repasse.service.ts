import { logger } from "../config/logger.js";
import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { addToRepasseQueue } from "../queues/repasse.queue.js";
import { paymentService } from "./payments/payment.service.js";
import { cobrancaCalculoService } from "./cobranca-calculo.service.js";
import { cobrancaPagamentoService } from "./cobranca-pagamento.service.js";
import { PaymentProvider, StatusRepasseEnum, ProvedorPagamentoEnum } from "../types/enums.js";

export async function conciliarRepassesPendentes(): Promise<void> {
  logger.info("[ConciliacaoRepasse] Iniciando varredura de repasses pendentes/falhos...");

  try {
    const repassesPendentes = await cobrancaRepasseRepository.getPendentesParaConciliacao();

    if (repassesPendentes.length > 0) {
      logger.info({ count: repassesPendentes.length }, "[ConciliacaoRepasse] Repasses encontrados para reprocessamento");

      for (const repasse of repassesPendentes) {
        try {
          const config = await motoristaFinanceiroRepository.getByUsuarioId(repasse.motorista_id);
          const chavePix = config.chave_pix_repasse;

          if (!chavePix) {
            logger.warn({ repasseId: repasse.id, motoristaId: repasse.motorista_id }, "[ConciliacaoRepasse] Motorista sem chave Pix cadastrada");
            continue;
          }

          await addToRepasseQueue({
            repasseId: repasse.id,
            cobrancaId: repasse.cobranca_id,
            motoristaId: repasse.motorista_id,
            chavePix,
            valorLiquido: Number(repasse.valor_liquido_motorista),
            transacaoProvedorId: repasse.transacao_provedor_id
          });
        } catch (itemErr: unknown) {
          const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
          logger.error({ error: msg, repasseId: repasse.id }, "[ConciliacaoRepasse] Falha ao enfileirar repasse na conciliação");
        }
      }
    }

    const { data: cobrancasTravadas, error: cobrancasError } = await cobrancaRepository.getCobrancasTravadasEmProcessamento(10);
    if (!cobrancasError && cobrancasTravadas && cobrancasTravadas.length > 0) {
      logger.info({ count: cobrancasTravadas.length }, "[ConciliacaoRepasse] Cobranças em processamento encontradas para conciliação");

      for (const cobranca of cobrancasTravadas) {
        try {
          const repasseExistente = await cobrancaRepasseRepository.getByCobrancaId(cobranca.id);

          if (repasseExistente) {
            if (repasseExistente.status_repasse === StatusRepasseEnum.SUCESSO) {
              await cobrancaPagamentoService.registrarPagamentoAutomatico(cobranca.id);
            }
            continue;
          }

          if (cobranca.provedor_cobranca_id) {
            const statusProvedor = await paymentService.getChargeStatus(cobranca.provedor_cobranca_id, PaymentProvider.WOOVI);

            if (statusProvedor === "COMPLETED") {
              const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(cobranca.usuario_id);
              const chavePix = motoristaConfig.chave_pix_repasse;

              if (chavePix) {
                const taxaPlataforma = cobrancaCalculoService.resolverTaxaPlataforma(
                  cobranca.valor_taxa_plataforma ? Number(cobranca.valor_taxa_plataforma) : null
                );
                const divisao = cobrancaCalculoService.calcularDivisaoCobranca({
                  valorMensalidade: Number(cobranca.valor),
                  taxaPlataforma,
                  repassarAoPai: Boolean(cobranca.taxa_repassada_ao_pai)
                });

                const novoRepasse = await cobrancaRepasseRepository.create({
                  cobranca_id: cobranca.id,
                  motorista_id: cobranca.usuario_id,
                  passageiro_id: cobranca.passageiro_id,
                  provedor: ProvedorPagamentoEnum.WOOVI,
                  valor_bruto: Number(cobranca.valor),
                  taxa_plataforma: divisao.taxaPlataforma,
                  tarifa_gateway_pix_in: divisao.tarifaGatewayPixIn,
                  tarifa_gateway_saque: divisao.tarifaGatewaySaque,
                  valor_liquido_motorista: divisao.valorLiquidoMotorista,
                  transacao_provedor_id: cobranca.provedor_cobranca_id,
                  status_repasse: StatusRepasseEnum.PENDENTE,
                  data_pagamento_pai: new Date().toISOString()
                });

                await addToRepasseQueue({
                  repasseId: novoRepasse.id,
                  cobrancaId: cobranca.id,
                  motoristaId: cobranca.usuario_id,
                  chavePix,
                  valorLiquido: divisao.valorLiquidoMotorista,
                  transacaoProvedorId: cobranca.provedor_cobranca_id
                });
                continue;
              }
            } else {
              await cobrancaRepository.update(cobranca.id, {
                repasse_em_processamento: false
              });
            }
          } else {
            await cobrancaRepository.update(cobranca.id, {
              repasse_em_processamento: false
            });
          }
        } catch (travadaErr: unknown) {
          const msg = travadaErr instanceof Error ? travadaErr.message : String(travadaErr);
          logger.error({ error: msg, cobrancaId: cobranca.id }, "[ConciliacaoRepasse] Falha ao conciliar cobrança travada");
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[ConciliacaoRepasse] Falha geral no cron de conciliação de repasses");
  }
}

