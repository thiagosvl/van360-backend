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
      ativo?: boolean | null;
      conta_pai_id?: string | null;
      veiculo_id?: string | null;
      config_contrato?: { usar_contratos?: boolean } | null;
      created_at?: string | null;
      nome?: string;
      email?: string;
      data_owner_id?: string;
      [key: string]: unknown;
    };
    data_owner_id?: string;
    assigned_veiculo_id?: string | null;
    usuario_id?: string;
    requestContext?: {
      get<T = unknown>(key: string): T | undefined;
      set<T = unknown>(key: string, value: T): void;
    };
  }
}
