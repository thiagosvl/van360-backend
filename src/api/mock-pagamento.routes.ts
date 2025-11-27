import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { processarPagamentoCobranca } from "../services/processar-pagamento.service.js";

const mockPagamentoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/mock-pagamento", async (request, reply) => {
    const cobrancaId = (request.query as any)?.id;

    if (!cobrancaId) {
      return reply.status(400).send({ error: "Parâmetro 'id' (Cobranca ID) ausente." });
    }

    try {
      logger.info({ cobrancaId }, "Iniciando mock de pagamento");

      // Buscar cobrança com todos os campos necessários
      const { data: cobranca, error: findError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("id, usuario_id, assinatura_usuario_id, status, valor, inter_txid, data_vencimento, billing_type")
        .eq("id", cobrancaId)
        .maybeSingle();

      if (findError) {
        logger.error({ cobrancaId, findError }, "Erro ao buscar cobrança");
        return reply.status(500).send({ error: "Erro ao buscar cobrança no banco de dados." });
      }

      if (!cobranca) {
        logger.warn({ cobrancaId }, "Cobrança não encontrada");
        return reply.status(404).send({ error: "Cobrança não encontrada." });
      }

      logger.info({ cobranca }, "Cobrança encontrada antes do update");

      // Simular dados do pagamento (como se viessem do webhook)
      const horario = new Date().toISOString();
      const valor = Number(cobranca.valor);
      const txid = cobranca.inter_txid || `MOCK-${cobranca.id}-${Date.now()}`;

      // Processar pagamento usando serviço compartilhado
      await processarPagamentoCobranca(
        cobranca,
        {
          valor,
          dataPagamento: horario,
          txid,
        },
        { cobrancaId, txid }
      );

      // Buscar vigencia_fim para retornar na resposta
      const { data: assinaturaAtivada } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .select("vigencia_fim")
        .eq("id", cobranca.assinatura_usuario_id)
        .single();

      const vigenciaFim = assinaturaAtivada?.vigencia_fim || null;

      return reply.status(200).send({
        success: true,
        message: `Pagamento mockado e conta ativada para Cobranca ID: ${cobrancaId}`,
        cobrancaId: cobranca.id,
        txid,
        valor,
        vigenciaFim: vigenciaFim || null,
      });

    } catch (err: any) {
      logger.error({ error: err.message, cobrancaId, stack: err.stack }, "Falha no Mock Pagamento.");
      return reply.status(500).send({ error: err.message || "Falha interna no mock." });
    }
  });
};

export default mockPagamentoRoute;
