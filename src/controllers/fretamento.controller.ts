import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { fretamentoService } from "../services/fretamento.service.js";
import { AppError } from "../errors/AppError.js";
import {
  criarFretamentoSchema,
  atualizarFretamentoSchema,
  registrarPagamentoSchema,
  adicionarParticipanteSchema,
  atualizarStatusParticipanteSchema,
  listarFretamentosQuerySchema,
} from "../schemas/fretamento.schema.js";

const getOwnerId = (request: FastifyRequest): string => {
  const ownerId = request.data_owner_id || request.user?.id;
  if (!ownerId) throw new AppError("Não autorizado", 401);
  return ownerId;
};

export const fretamentoController = {
  async listar(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const query = listarFretamentosQuerySchema.parse(request.query);
    const resultado = await fretamentoService.listar(
      ownerId,
      query.mes,
      query.ano,
      query.tipo,
      query.status
    );
    return reply.status(200).send(resultado);
  },

  async resumoFinanceiro(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const query = z
      .object({
        mes: z.coerce.number().int().min(1).max(12),
        ano: z.coerce.number().int().min(2020).max(2050),
      })
      .parse(request.query);
    const resumo = await fretamentoService.obterResumoFinanceiro(ownerId, query.mes, query.ano);
    return reply.status(200).send(resumo);
  },

  async obterPorId(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const registro = await fretamentoService.obterPorId(ownerId, id);
    return reply.status(200).send(registro);
  },

  async obterPublicoPorSlug(request: FastifyRequest, reply: FastifyReply) {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
    const passeio = await fretamentoService.obterPublicoPorSlug(slug);
    return reply.status(200).send(passeio);
  },

  async criar(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const dados = criarFretamentoSchema.parse(request.body);
    const novo = await fretamentoService.criar(ownerId, dados);
    return reply.status(201).send(novo);
  },

  async atualizar(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const dados = atualizarFretamentoSchema.parse(request.body);
    const atualizado = await fretamentoService.atualizar(ownerId, id, dados);
    return reply.status(200).send(atualizado);
  },

  async deletar(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const res = await fretamentoService.deletar(ownerId, id);
    return reply.status(200).send(res);
  },

  async registrarPagamento(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const dados = registrarPagamentoSchema.parse(request.body);
    const atualizado = await fretamentoService.registrarPagamento(ownerId, id, dados);
    return reply.status(201).send(atualizado);
  },

  async deletarPagamento(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id, pagamentoId } = z
      .object({
        id: z.string().uuid(),
        pagamentoId: z.string().uuid(),
      })
      .parse(request.params);
    const atualizado = await fretamentoService.deletarPagamento(ownerId, id, pagamentoId);
    return reply.status(200).send(atualizado);
  },

  async adicionarParticipante(request: FastifyRequest, reply: FastifyReply) {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const dados = adicionarParticipanteSchema.parse(request.body);
    const participante = await fretamentoService.adicionarParticipante(id, dados, false);
    return reply.status(201).send(participante);
  },

  async adicionarParticipantePublico(request: FastifyRequest, reply: FastifyReply) {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
    const passeio = await fretamentoService.obterPublicoPorSlug(slug);
    const dados = adicionarParticipanteSchema.parse(request.body);
    const participante = await fretamentoService.adicionarParticipante(passeio.id, dados, true);
    return reply.status(201).send(participante);
  },

  async atualizarStatusParticipante(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id, participanteId } = z
      .object({
        id: z.string().uuid(),
        participanteId: z.string().uuid(),
      })
      .parse(request.params);
    const dados = atualizarStatusParticipanteSchema.parse(request.body);
    const atualizado = await fretamentoService.atualizarStatusParticipante(
      ownerId,
      id,
      participanteId,
      dados
    );
    return reply.status(200).send(atualizado);
  },

  async removerParticipante(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = getOwnerId(request);
    const { id, participanteId } = z
      .object({
        id: z.string().uuid(),
        participanteId: z.string().uuid(),
      })
      .parse(request.params);
    const atualizado = await fretamentoService.removerParticipante(ownerId, id, participanteId);
    return reply.status(200).send(atualizado);
  },
};
