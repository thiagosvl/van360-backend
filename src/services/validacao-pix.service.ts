import { STATUS_CHAVE_PIX_VALIDADA, STATUS_TRANSACAO_ERRO, STATUS_TRANSACAO_PENDENTE, STATUS_TRANSACAO_PROCESSANDO, STATUS_TRANSACAO_SUCESSO } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { interService } from "./inter.service.js";
// import { notificationService } from "./notifications/notification.service.js"; // Futuro: Notificar sucesso/erro

export interface SolicitacaoValidacao {
    usuarioId: string;
    chavePix: string;
    tipoChave: string; // CPF, EMAIL, TELEFONE, ALEATORIA, CNPJ
}

export const validacaoPixService = {

    /**
     * Inicia o processo de validação de chave PIX enviando 1 centavo.
     */
    async iniciarValidacao(params: SolicitacaoValidacao) {
        const { usuarioId, chavePix, tipoChave } = params;

        logger.info({ usuarioId, chavePix }, "Iniciando validação de Chave PIX");

        // Gerar ID Idempotente Único
        const xIdIdempotente = `VAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 1. Criar registro de tentativa
        const { data: tentativa, error: createError } = await supabaseAdmin
            .from("pix_validacao_pendente")
            .insert({
                usuario_id: usuarioId,
                chave_pix_enviada: chavePix,
                x_id_idempotente: xIdIdempotente,
                // Colunas que pedirei para adicionar:
                status: STATUS_TRANSACAO_PENDENTE 
            })
            .select()
            .single();

        if (createError) {
             logger.error({ error: createError }, "Erro ao criar registro de validação PIX");
             throw new Error("Erro interno ao iniciar validação.");
        }

        try {
            // 2. Tentar realizar pagamento de 1 centavo
            const resultado = await interService.realizarPagamentoPix(supabaseAdmin, {
                valor: 0.01,
                chaveDestino: chavePix,
                descricao: "Validacao Van360",
                xIdIdempotente
            });

            // 3. Atualizar registro com resultado inicial
            const novoStatus = resultado.status === "PAGO" || resultado.status === "REALIZADO" ? STATUS_TRANSACAO_SUCESSO : STATUS_TRANSACAO_PROCESSANDO;
            
            await supabaseAdmin
                .from("pix_validacao_pendente")
                .update({
                    status: novoStatus,
                    end_to_end_id: resultado.endToEndId,
                    // updated_at não existe na tabela do usuário, considerar adicionar ou ignorar
                })
                .eq("id", tentativa.id);

            // Se SUCESSO imediato, atualizar usuário
            if (novoStatus === STATUS_TRANSACAO_SUCESSO) {
                await this.confirmarChaveUsuario(usuarioId, chavePix, tipoChave);
                return { status: STATUS_CHAVE_PIX_VALIDADA, message: "Chave validada com sucesso!" };
            }

            return { status: STATUS_TRANSACAO_PROCESSANDO, message: "Validação em processamento. Aguarde." };

        } catch (err: any) {
            // Registrar falha
            await supabaseAdmin
                .from("pix_validacao_pendente")
                .update({
                    status: STATUS_TRANSACAO_ERRO,
                    motivo_falha: err.message || "Erro ao comunicar com Inter"
                })
                .eq("id", tentativa.id);
            
            logger.error({ err, usuarioId }, "Falha na transação de validação PIX");
            throw new Error("Não foi possível validar a chave neste momento. Verifique se a chave está correta.");
        }
    },

    /**
     * Atualiza o cadastro do usuário com a chave validada.
     */
    async confirmarChaveUsuario(usuarioId: string, chave: string, tipo: string) {
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({
                chave_pix: chave,
                tipo_chave_pix: tipo,
                chave_pix_validada: true, // Flag importante para liberar repasses
                data_validacao_pix: new Date().toISOString()
            })
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Erro ao salvar chave pix validada no usuário");
            throw error;
        }
    },
    
    /**
     * Rejeita a validação (usado pelo Job)
     */
     async rejeitarValidacao(usuarioId: string, motivo: string) {
        // Opcional: Notificar usuário que falhou
        // await notificationService.notifyDriver(..., "Sua chave pix falhou...");
        logger.warn({ usuarioId, motivo }, "Validação de PIX falhou definitivamente.");
     }
};
