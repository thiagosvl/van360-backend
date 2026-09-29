import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { checkAppUpdates } from "../services/app.service.js";

export const AppController = {
  async checkUpdates(request: FastifyRequest, reply: FastifyReply) {
    const { platform, current_version, native_version } = request.query as {
      platform: string;
      current_version?: string;
      native_version?: string;
    };

    if (!platform) {
      throw new AppError("Platform query param is required.", 400);
    }

    const update = await checkAppUpdates(platform, current_version, native_version);
    return reply.status(200).send(update || null);
  }
};
