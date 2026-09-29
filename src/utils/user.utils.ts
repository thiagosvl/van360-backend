import { UserType } from "../types/enums.js";

export interface UserLike {
  id?: string;
  tipo?: UserType | string | null;
  conta_pai_id?: string | null;
}

export function isMotoristaTitular(user?: UserLike | null): boolean {
  return user?.tipo === UserType.MOTORISTA && !user?.conta_pai_id;
}

export function isSubConta(user?: UserLike | null): boolean {
  return Boolean(user?.conta_pai_id) || user?.tipo === UserType.MOTORISTA_AUXILIAR || user?.tipo === UserType.MONITOR;
}

export function isMotoristaAuxiliar(user?: UserLike | null): boolean {
  return user?.tipo === UserType.MOTORISTA_AUXILIAR;
}

export function isMonitor(user?: UserLike | null): boolean {
  return user?.tipo === UserType.MONITOR;
}

export function isResponsavel(user?: UserLike | null): boolean {
  return user?.tipo === UserType.RESPONSAVEL;
}

export function getDonoContaId(user?: UserLike | null): string | undefined {
  return user?.conta_pai_id || user?.id;
}
