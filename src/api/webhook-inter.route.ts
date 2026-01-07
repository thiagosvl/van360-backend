import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { processarPagamentoCobranca } from "../services/processar-pagamento.service.js";
import { processarRetornoValidacaoPix } from "../services/usuario.service.js";

const webhookInterRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/receber-pix-usuario", async (req, reply) => {
    try {
      const body = req.body as any;
      console.log("=== Webhook recebido do Inter (V3 - Retry Deploy) ===");
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

      // Process inside the request lifecycle for Vercel stability
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
            logger.error({ txid, findError }, "Erro ao buscar cobrança no banco");
            continue;
          }
          
          if (!cobranca) {
            // Se não é cobrança, pode ser o retorno de uma VALIDACAO DE PIX (micro-transacao enviada)
            // Webhook de pagamento enviado (saída) geralmente tem endToEndId e valor.
            // Para validação, o valor é 0.01.
            // Se tiver 'endToEndId' e valor '0.01', tentamos processar como validação.
            
            // O payload do Inter para PIX Enviado/Pago pode variar, mas geralmente tem endToEndId.
            // O loop usa 'pagamento' que desestruturamos { txid, valor, horario }.
            // Se for PIX Enviado, pode não ter 'txid' mas tem 'endToEndId'.
            const e2eId = pagamento.endToEndId || pagamento.endToEndId; // Garantir campo
            
            // Verificação Flexível: Se valor for 0.01 OU se tiver e2eId, verificar na tabela de validação
            if (e2eId) {
                logger.info({ e2eId, valor }, "Txid não encontrado em cobranças. Verificando se é Validação PIX...");
                
                const resultado = await processarRetornoValidacaoPix({ e2eId });
                if (resultado.success) {
                    logger.info({ e2eId }, "Webhook processado como Validação PIX.");
                    continue;
                } else if (resultado.reason !== "nao_encontrado") {
                    // Se encontrou mas deu erro, já logou. Se não encontrou, segue o erro original.
                    logger.warn({ e2eId, reason: resultado.reason }, "Tentativa de processar validação falhou ou não era validação.");
                }
            }

            logger.warn({ txid: pagamento.txid, e2eId }, "Cobrança não encontrada no banco (e não é validação conhecida)");
            continue;
          }

          logger.info({ cobrancaId: cobranca.id, statusAtual: cobranca.status }, "Cobrança encontrada, iniciando processamento");

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
          
          logger.info({ txid }, "Pagamento PIX processado com sucesso");
        } catch (innerErr: any) {
          logger.error({ innerErr, txid: pagamento?.txid }, "Erro processando um pagamento PIX específico");
        }
      }

      // Final response only after all processing is done
      reply.status(200).send({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Erro geral no Webhook Inter");
      if (!reply.sent) reply.status(500).send({ received: false, error: "Erro interno" });
    }
  });
};


export default webhookInterRoute;
