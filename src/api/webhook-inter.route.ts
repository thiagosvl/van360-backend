import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { processarPagamentoCobranca } from "../services/processar-pagamento.service.js";

const webhookInterRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/receber-pix-usuario", async (req, reply) => {
    try {
      const body = req.body as any;
      console.log("=== Webhook recebido do Inter ===");
      console.dir(body, { depth: 10 });

      // Validate payload
      let pixList: any[] = [];
      
      if (body?.pix && Array.isArray(body.pix)) {
        pixList = body.pix;
      } else if (body?.txid && body?.valor) {
        // Handle "Validar Webhook" Tool format (Flat object)
        pixList = [body];
        logger.info("Payload recebido no formato Flat (Test Tool)");
      } else {
        logger.error({ body }, "Payload PIX inválido ou formato desconhecido");
        reply.status(400).send({ received: false, error: "Payload PIX inválido" });
        return;
      }

      // Payload looks good — reply 200 immediately and process in background
      reply.status(200).send({ received: true });

      // Process asynchronously (fire-and-forget)
      (async () => {
        for (const pagamento of pixList) {
          try {
            const { txid, valor, horario } = pagamento;
            logger.info({ txid, valor, horario }, "Processando pagamento PIX");

            const { data: cobranca, error: findError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .select("id, usuario_id, assinatura_usuario_id, status, data_vencimento, billing_type")
              .eq("inter_txid", txid)
              .maybeSingle();

            if (findError) {
              logger.error({ txid, findError }, "Erro ao buscar cobrança");
              continue;
            }
            if (!cobranca) {
              logger.warn({ txid }, "Cobrança não encontrada");
              continue;
            }

            logger.info({ cobranca }, "Cobrança encontrada antes do update");

            // Processar pagamento usando serviço compartilhado
            await processarPagamentoCobranca(
              cobranca,
              {
                valor,
                dataPagamento: horario || new Date().toISOString(),
                txid,
              },
              { txid }
            );
          } catch (innerErr: any) {
            logger.error({ innerErr }, "Erro processando um pagamento PIX");
          }
        }
      })().catch((bgErr) => logger.error({ bgErr }, "Erro no processamento background do webhook"));
    } catch (err: any) {
      logger.error({ err }, "Erro geral no Webhook Inter");
      // If we haven't replied yet, send 500
      try {
        if (!reply.sent) reply.status(500).send({ received: false, error: "Erro interno" });
      } catch (e) {
        // ignore
      }
    }
  });
};


export default webhookInterRoute;
