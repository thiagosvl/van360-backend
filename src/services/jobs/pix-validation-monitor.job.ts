import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { TransactionStatus } from "../../types/enums.js";
import { paymentService } from "../payment.service.js";
import { validacaoPixService } from "../validacao-pix.service.js";

export const pixValidationMonitorJob = {
    async run() {
        logger.info("Iniciando Monitoramento de Validações PIX Pendentes");

        // 1. Buscar validações em processamento (apenas recentes, ex: últimas 24h)
        // Evitar buscar coisas muito antigas que já falharam
        const ontem = new Date();
        ontem.setHours(ontem.getHours() - 24);

        const { data: pendentes, error } = await supabaseAdmin
            .from("pix_validacao_pendente")
            .select("*")
            .eq("status", TransactionStatus.PROCESSAMENTO)
            .gte("created_at", ontem.toISOString());

        if (error) {
            logger.error({ error }, "Erro ao buscar validações pendentes");
            return;
        }

        if (!pendentes || pendentes.length === 0) {
            logger.info("Nenhuma validação PIX pendente encontrada.");
            return;
        }

        logger.info({ count: pendentes.length }, "Verificando status de validações...");

        for (const item of pendentes) {
            try {
                if (!item.end_to_end_id) {
                    logger.warn({ id: item.id }, "Item em processamento sem endToEndId. Ignorando/Marcando erro.");
                    continue;
                }

                // 2. Consultar Status no Provedor
                const provider = paymentService.getProvider();
                const pixInfo = await provider.consultarCobranca(item.end_to_end_id);
                const statusInter = pixInfo.status; // EX: REALIZADO, REJEITADO, PAGO?
                
                logger.info({ 
                    step: "monitor_check", 
                    id: item.id, 
                    e2eId: item.end_to_end_id, 
                    statusInter,
                    motivo: pixInfo.motivo 
                }, "Status retornado pelo Provedor");

                // Mapeamento de status Provedor -> SUCESSO/ERRO
                // Depende da API do Provedor. Geralmente: "REALIZADO" = Sucesso.
                // "REJEITADO", "DEVOLVIDO", "CANCELADO" = Falha.
                
                let novoStatus = TransactionStatus.PROCESSAMENTO; // Mantém se ainda estiver processando

                if (statusInter === "REALIZADO" || statusInter === "PAGO") {
                    novoStatus = TransactionStatus.SUCESSO;
                } else if (["REJEITADO", "CANCELADO", "DEVOLVIDO", "FALHA"].includes(statusInter)) {
                    novoStatus = TransactionStatus.ERRO;
                }

                if (novoStatus !== TransactionStatus.PROCESSAMENTO) {
                    // Atualizar DB
                    await supabaseAdmin
                        .from("pix_validacao_pendente")
                        .update({ 
                            status: novoStatus, 
                            motivo_falha: novoStatus === TransactionStatus.ERRO ? (pixInfo.motivo || statusInter) : null
                        })
                        .eq("id", item.id);

                    if (novoStatus === TransactionStatus.SUCESSO) {
                        logger.info({ id: item.id, usuarioId: item.usuario_id }, "Validação PIX confirmada com sucesso!");
                        // Nota: Se 'tipo_chave' não existir na tabela, teremos que inferir ou deixar NULL
                        // Estou assumindo que adicionaremos 'tipo_chave'
                        await validacaoPixService.confirmarChaveUsuario(item.usuario_id, item.chave_pix_enviada, item.tipo_chave || "DESCONHECIDO");
                    } else {
                        logger.warn({ id: item.id, statusInter }, "Validação PIX falhou.");
                        await validacaoPixService.rejeitarValidacao(item.usuario_id, `Validação falhou: ${statusInter}`);
                    }
                }

            } catch (err: any) {
                logger.error({ error: err.message, id: item.id }, "Erro ao verificar status de validação PIX");
            }
        }
    }
};
