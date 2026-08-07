import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { gastoCategoriaService } from "../services/gasto-categoria.service.js";
import { createGastoCategoriaSchema, updateGastoCategoriaSchema } from "../types/dtos/gasto-categoria.dto.js";

export const gastoCategoriaController = {
    async list(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = request.data_owner_id || request.usuario_id;
        if (!usuarioId) {
            return reply.status(401).send({ error: "Usuário não autenticado." });
        }
        const categorias = await gastoCategoriaService.listCategorias(usuarioId);
        return reply.status(200).send(categorias);
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = request.data_owner_id || request.usuario_id;
        if (!usuarioId) {
            return reply.status(401).send({ error: "Usuário não autenticado." });
        }
        const body = createGastoCategoriaSchema.parse(request.body);
        const result = await gastoCategoriaService.createCategoria(usuarioId, body);
        return reply.status(201).send(result);
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = request.data_owner_id || request.usuario_id;
        if (!usuarioId) {
            return reply.status(401).send({ error: "Usuário não autenticado." });
        }
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const body = updateGastoCategoriaSchema.parse(request.body);
        const result = await gastoCategoriaService.updateCategoria(id, usuarioId, body);
        return reply.status(200).send(result);
    },

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = request.data_owner_id || request.usuario_id;
        if (!usuarioId) {
            return reply.status(401).send({ error: "Usuário não autenticado." });
        }
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const result = await gastoCategoriaService.deleteCategoria(id, usuarioId);
        return reply.status(200).send(result);
    }
};
