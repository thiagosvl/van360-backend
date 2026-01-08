import { STATUS_TRANSACAO_ERRO, STATUS_TRANSACAO_PROCESSANDO, STATUS_TRANSACAO_SUCESSO } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { interService } from "../inter.service.js";
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
            .eq("status", STATUS_TRANSACAO_PROCESSANDO)
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

                // 2. Consultar Status no Inter
                const pixInfo = await interService.consultarPix(supabaseAdmin, item.end_to_end_id);
                const statusInter = pixInfo.status; // EX: REALIZADO, REJEITADO, PAGO?

                // Mapeamento de status Inter -> SUCESSO/ERRO
                // Depende da API do Inter. Geralmente: "REALIZADO" = Sucesso.
                // "REJEITADO", "DEVOLVIDO", "CANCELADO" = Falha.
                
                let novoStatus = STATUS_TRANSACAO_PROCESSANDO; // Mantém se ainda estiver processando

                if (statusInter === "REALIZADO" || statusInter === "PAGO") {
                    novoStatus = STATUS_TRANSACAO_SUCESSO;
                } else if (["REJEITADO", "CANCELADO", "DEVOLVIDO", "FALHA"].includes(statusInter)) {
                    novoStatus = STATUS_TRANSACAO_ERRO;
                }

                if (novoStatus !== STATUS_TRANSACAO_PROCESSANDO) {
                    // Atualizar DB
                    await supabaseAdmin
                        .from("pix_validacao_pendente")
                        .update({ 
                            status: novoStatus, 
                            motivo_falha: novoStatus === STATUS_TRANSACAO_ERRO ? (pixInfo.motivo || statusInter) : null
                        })
                        .eq("id", item.id);

                    if (novoStatus === STATUS_TRANSACAO_SUCESSO) {
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
