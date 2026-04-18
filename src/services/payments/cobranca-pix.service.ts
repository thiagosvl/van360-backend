import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { getNowBR, addDays, toPersistenceString } from "../../utils/date.utils.js";
import { AppError } from "../../errors/AppError.js";
import { CheckoutPaymentMethod, CobrancaStatus, ConfigKey, PaymentProvider } from "../../types/enums.js";
import { getConfigNumber } from "../configuracao.service.js";
import { paymentService } from "./payment.service.js";

type CobrancaComJoins = {
    id: string;
    usuario_id: string;
    mes: number;
    ano: number;
    valor: string | number;
    status: CobrancaStatus;
    data_vencimento: string;
    passageiro: { nome: string; cpf_responsavel: string | null } | null;
    motorista: { nome: string; taxa_servico: string | null; chave_pix: string | null } | null;
};

export const cobrancaPixService = {

    async gerarPixParaCobranca(cobrancaId: string) {
        logger.info({ cobrancaId }, "[CobrancaPixService] Iniciando geração de Pix...");

        const { data, error: cError } = await supabaseAdmin
            .from("cobrancas")
            .select("*, passageiro:passageiros(nome, cpf_responsavel), motorista:usuarios!cobrancas_usuario_id_fkey(nome, taxa_servico, chave_pix)")
            .eq("id", cobrancaId)
            .single();

        if (cError || !data) throw new AppError("Cobrança não encontrada.", 404);

        const cobranca = data as unknown as CobrancaComJoins;

        if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);

        const motorista = cobranca.motorista;
        if (!motorista?.chave_pix) {
            logger.error({ motoristaId: cobranca.usuario_id }, "[CobrancaPixService] Motorista sem chave Pix cadastrada para split.");
            throw new AppError("O motorista responsável ainda não configurou uma chave Pix para recebimento automático.", 400);
        }

        const taxaServicoPadrao = await getConfigNumber(ConfigKey.TAXA_SERVICO_PADRAO, 3.90);
        const taxaServicoMotorista = motorista.taxa_servico ? Number(motorista.taxa_servico) : taxaServicoPadrao;

        const valorCobranca = Number(cobranca.valor);
        // O motorista recebe o valor líquido após desconto da taxa de serviço Van360.
        // O split no gateway direciona esse valor diretamente para a chave Pix do motorista.
        const motoristaNet = valorCobranca - taxaServicoMotorista;

        if (motoristaNet <= 0) {
            throw new AppError("O valor da mensalidade é inferior à taxa de serviço mínima.", 400);
        }

        const chargeRes = await paymentService.createCharge({
            amount: valorCobranca,
            description: `Mensalidade ${cobranca.mes}/${cobranca.ano} - ${cobranca.passageiro?.nome}`,
            dueDate: cobranca.data_vencimento,
            externalId: `msg_${cobranca.id}`,
            paymentMethod: CheckoutPaymentMethod.PIX,
            customer: {
                name: cobranca.passageiro?.nome ?? "",
                document: cobranca.passageiro?.cpf_responsavel || "00000000000"
            },
            splits: [
                {
                    pix_chave: motorista.chave_pix,
                    amount: motoristaNet,
                    description: `Repasse Motorista - ${motorista.nome}`
                }
            ]
        }, PaymentProvider.WOOVI);

        if (!chargeRes.success) {
            throw new AppError(`Erro ao gerar cobrança no gateway: ${chargeRes.error}`, 500);
        }

        const { error: updateError } = await supabaseAdmin
            .from("cobrancas")
            .update({
                gateway_txid: chargeRes.providerId,
                pix_copy_paste: chargeRes.pixCopyPaste,
                pix_expiration: addDays(getNowBR(), 1).toISOString()
            })
            .eq("id", cobrancaId);

        if (updateError) {
            logger.error({ updateError, cobrancaId }, "[CobrancaPixService] Erro ao salvar dados do Pix na cobrança");
            throw new AppError("Erro ao salvar dados do Pix.", 500);
        }

        return {
            txid: chargeRes.providerId,
            pix_copy_paste: chargeRes.pixCopyPaste
        };
    },

    async gerarPixParaCobrancasVencendo() {
        logger.info("[CobrancaPixService] Iniciando geração em lote de Pix para cobranças próximas do vencimento...");

        try {
            const thresholdDays = await getConfigNumber(ConfigKey.DIAS_VENCIMENTO_COBRANCA, 5);

            const now = getNowBR();
            const thresholdDate = getNowBR();
            thresholdDate.setDate(now.getDate() + thresholdDays);

            const { data: pendentes, error } = await supabaseAdmin
                .from("cobrancas")
                .select("id")
                .eq("status", CobrancaStatus.PENDENTE)
                .is("gateway_txid", null)
                .lte("data_vencimento", toPersistenceString(thresholdDate))
                .order("data_vencimento", { ascending: true });

            if (error) {
                logger.error({ error: error.message }, "[CobrancaPixService] Erro ao buscar cobranças pendentes para gerar Pix");
                return;
            }

            if (!pendentes || pendentes.length === 0) {
                logger.info("[CobrancaPixService] Nenhuma cobrança pendente para gerar Pix no momento.");
                return;
            }

            logger.info({ count: pendentes.length }, "[CobrancaPixService] Processando lote de geração de Pix...");

            let success = 0;
            let failed = 0;

            for (const item of pendentes) {
                try {
                    await this.gerarPixParaCobranca(item.id);
                    success++;
                } catch (err: unknown) {
                    logger.error({ cobrancaId: item.id, error: (err as Error).message }, "[CobrancaPixService] Falha ao gerar Pix individual no lote");
                    failed++;
                }
            }

            logger.info({ success, failed }, "[CobrancaPixService] Geração em lote concluída.");

        } catch (error: unknown) {
            logger.error({ error: (error as Error).message }, "[CobrancaPixService] Erro crítico no loop de geração de Pix");
        }
    }
};
