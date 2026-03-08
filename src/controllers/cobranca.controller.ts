import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { cobrancaPagamentoService } from "../services/cobranca-pagamento.service.js";
import { cobrancaService } from "../services/cobranca.service.js";
import { historicoService } from "../services/historico.service.js";
import {
    createCobrancaSchema,
    listCobrancasFiltersSchema,
    registrarPagamentoManualSchema,
    toggleNotificacoesSchema,
    updateCobrancaSchema
} from "../types/dtos/cobranca.dto.js";
import { AtividadeEntidadeTipo } from "../types/enums.js";

export const cobrancaController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("CobrancaController.create - Starting");
    const data = createCobrancaSchema.parse(request.body);
    const cobranca = await cobrancaService.createCobranca(data);
    return reply.status(201).send(cobranca);
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ cobrancaId: id }, "CobrancaController.update - Starting");
    const { data, cobrancaOriginal } = updateCobrancaSchema.parse(request.body);
    await cobrancaService.updateCobranca(id, data, cobrancaOriginal);
    return reply.status(200).send({ success: true });
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ cobrancaId: id }, "CobrancaController.delete - Starting");
    await cobrancaService.deleteCobranca(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await cobrancaService.getCobranca(id);
    return reply.status(200).send(result);
  },

  listWithFilters: async (request: FastifyRequest, reply: FastifyReply) => {
    const filtros = listCobrancasFiltersSchema.parse(request.query);
    const cobrancas = await cobrancaService.listCobrancasWithFilters(filtros);
    return reply.status(200).send(cobrancas);
  },

  listByPassageiro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { passageiroId } = request.params as { passageiroId: string };
    const { ano } = request.query as { ano?: string };
    const cobrancas = await cobrancaService.listCobrancasByPassageiro(passageiroId, ano);
    return reply.status(200).send(cobrancas);
  },

  countByPassageiro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { passageiroId } = request.params as { passageiroId: string };
    const count = await cobrancaService.countByPassageiro(passageiroId);
    return reply.status(200).send({ count });
  },

  listAvailableYears: async (request: FastifyRequest, reply: FastifyReply) => {
    const { passageiroId } = request.params as { passageiroId: string };
    const anos = await cobrancaService.listAvailableYearsByPassageiro(passageiroId);
    return reply.status(200).send(anos);
  },

  listNotificacoes: async (request: FastifyRequest, reply: FastifyReply) => {
    const { cobrancaId } = request.params as { cobrancaId: string };
    const historico = await historicoService.listByEntidade(AtividadeEntidadeTipo.COBRANCA, cobrancaId);
    
    // Mapeia para o formato que o frontend antigo ou legados esperariam,
    // mas priorizando o conteúdo do histórico de atividades.
    const notificacoesOldFormat = historico
      .filter(h => h.acao === 'NOTIFICACAO_WHATSAPP')
      .map(h => ({
        id: h.id,
        cobranca_id: h.entidade_id,
        tipo_evento: h.meta?.tipo_evento || 'MANUAL',
        canal: h.meta?.canal || 'WHATSAPP',
        data_envio: h.created_at,
        tipo_origem: h.meta?.tipo_origem || 'manual'
      }));

    return reply.status(200).send(notificacoesOldFormat);
  },

  createNotificacao: async (request: FastifyRequest, reply: FastifyReply) => {
    const { cobrancaId } = request.params as { cobrancaId: string };
    // Opcional validar payload, mas a logica inteira de envio + log esta englobada no service
    const success = await cobrancaService.enviarNotificacaoManual(cobrancaId);
    
    if (success) {
      return reply.status(201).send({ success: true });
    } else {
      return reply.status(500).send({ success: false, error: "Failed to send notification" });
    }
  },

  toggleNotificacoes: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const { novoStatus } = toggleNotificacoesSchema.parse(request.body);
      await cobrancaService.toggleNotificacoes(id, novoStatus);
      return reply.status(200).send({ ativo: novoStatus });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message, details: err.issues });
    }
  },

  desfazerPagamentoManual: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ cobrancaId: id }, "CobrancaController.desfazerPagamentoManual - Starting");
    const cobranca = await cobrancaPagamentoService.desfazerPagamento(id);
    return reply.status(200).send(cobranca);
  },

  registrarPagamentoManual: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ cobrancaId: id }, "CobrancaController.registrarPagamentoManual - Starting");
    const data = registrarPagamentoManualSchema.parse(request.body);
    const cobranca = await cobrancaPagamentoService.registrarPagamentoManual(id, data);
    return reply.status(200).send(cobranca);
  }
};
