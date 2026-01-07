
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { cobrancaService } from "../cobranca.service.js";

export const webhookCobrancaHandler = {
  async handle(pagamento: any): Promise<boolean> {
    const { txid, valor, horario } = pagamento;

    // 1. Buscar na tabela de cobranças (Pais)
    const { data: cobrancaPai, error: findPaiError } = await supabaseAdmin
        .from("cobrancas")
        .select("id, status")
        .eq("txid_pix", txid)
        .maybeSingle();

    if (findPaiError) {
        logger.error({ txid, findPaiError }, "Erro ao buscar cobrança de pai no banco");
        return false;
    }

    if (!cobrancaPai) {
        return false; // Não encontrada neste contexto
    }

    // 2. Processar Pagamento e Repasse
    logger.info({ cobrancaId: cobrancaPai.id, context: "COBRANCA_PAI" }, "Cobrança de Pai encontrada. Iniciando fluxo de repasse.");

    try {
        // a) Atualizar status para PAGO e calcular taxas
        await cobrancaService.atualizarStatusPagamento(txid, valor, pagamento);
        
        // b) Iniciar Repasse (Fire & Forget seguro com catch individual)
        cobrancaService.iniciarRepasse(cobrancaPai.id)
            .then(res => logger.info({ res, cobrancaId: cobrancaPai.id }, "Repasse AUTOMÁTICO iniciado com sucesso"))
            .catch(err => logger.error({ err, cobrancaId: cobrancaPai.id }, "Falha ao iniciar repasse automático (tentar via painel depois)"));

        return true;
        
    } catch (err) {
        logger.error({ err, cobrancaId: cobrancaPai.id }, "Erro crítico ao processar pagamento de pai");
        throw err;
    }
  }
};
