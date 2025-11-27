import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prePassageiroService } from "../services/pre-passageiro.service";

const prePassageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {

  app.get("/usuario/:usuarioId", async (request: any, reply) => {
    const usuarioId = request.params.usuarioId as string;
    const { search } = request.query;

    try {
      const prePassageiros = await prePassageiroService.listPrePassageiros(usuarioId, search);
      return reply.status(200).send(prePassageiros);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/", async (request: any, reply) => {
    const data = request.body;
    try {
      const prePassageiro = await prePassageiroService.createPrePassageiro(data);
      return reply.status(201).send(prePassageiro);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/:id", async (request: any, reply) => {
    const prePassageiroId = request.params.id as string;
    try {
      await prePassageiroService.deletePrePassageiro(prePassageiroId);
      return reply.status(200).send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

};

export default prePassageiroRoute;
