import { UserType } from "./enums.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
      app_metadata?: {
        role?: UserType | string;
        [key: string]: unknown;
      };
      user_metadata?: Record<string, unknown>;
      [key: string]: unknown;
    };
    profile?: {
      id: string;
      tipo?: UserType;
      nome?: string;
      email?: string;
      data_owner_id?: string;
      [key: string]: unknown;
    };
    data_owner_id?: string;
    usuario_id?: string;
    requestContext?: {
      get<T = unknown>(key: string): T | undefined;
      set<T = unknown>(key: string, value: T): void;
    };
  }
}
