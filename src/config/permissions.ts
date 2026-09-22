import { UserType } from "../types/enums.js";

export type PermissionKey =
  // Financeiro & SaaS
  | "financeiro.visualizar"
  | "cobrancas.gerenciar"
  | "contratos.gerenciar"
  | "relatorios.visualizar"
  | "assinatura.gerenciar"

  // Frota & Equipe
  | "veiculos.gerenciar"
  | "equipe.gerenciar_todos"
  | "equipe.gerenciar_monitores"

  // Passageiros
  | "passageiros.visualizar"
  | "passageiros.gerenciar"
  | "passageiros.cobranca_visualizar"
  | "passageiros.presenca_marcar"

  // Gastos
  | "gastos.visualizar"
  | "gastos.criar"

  // Rotas
  | "rotas.visualizar"
  | "rotas.criar_editar"
  | "rotas.excluir"
  | "rotas.iniciar_encerrar"
  | "rotas.executar_paradas"

  // Escolas & Aniversários
  | "escolas.visualizar"
  | "escolas.gerenciar"
  | "aniversarios.visualizar";

export const PERMISSIONS = {
  FINANCEIRO_VISUALIZAR: "financeiro.visualizar",
  COBRANCAS_GERENCIAR: "cobrancas.gerenciar",
  CONTRATOS_GERENCIAR: "contratos.gerenciar",
  RELATORIOS_VISUALIZAR: "relatorios.visualizar",
  ASSINATURA_GERENCIAR: "assinatura.gerenciar",
  VEICULOS_GERENCIAR: "veiculos.gerenciar",
  EQUIPE_GERENCIAR_TODOS: "equipe.gerenciar_todos",
  EQUIPE_GERENCIAR_MONITORES: "equipe.gerenciar_monitores",
  PASSAGEIROS_VISUALIZAR: "passageiros.visualizar",
  PASSAGEIROS_GERENCIAR: "passageiros.gerenciar",
  PASSAGEIROS_COBRANCA_VISUALIZAR: "passageiros.cobranca_visualizar",
  PASSAGEIROS_PRESENCA_MARCAR: "passageiros.presenca_marcar",
  GASTOS_VISUALIZAR: "gastos.visualizar",
  GASTOS_CRIAR: "gastos.criar",
  ROTAS_VISUALIZAR: "rotas.visualizar",
  ROTAS_CRIAR_EDITAR: "rotas.criar_editar",
  ROTAS_EXCLUIR: "rotas.excluir",
  ROTAS_INICIAR_ENCERRAR: "rotas.iniciar_encerrar",
  ROTAS_EXECUTAR_PARADAS: "rotas.executar_paradas",
  ESCOLAS_VISUALIZAR: "escolas.visualizar",
  ESCOLAS_GERENCIAR: "escolas.gerenciar",
  ANIVERSARIOS_VISUALIZAR: "aniversarios.visualizar",
} as const satisfies Record<string, PermissionKey>;

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<UserType, PermissionKey[]> = {
  [UserType.ADMIN]: ALL_PERMISSIONS,

  [UserType.MOTORISTA]: ALL_PERMISSIONS,

  [UserType.MOTORISTA_AUXILIAR]: [
    "passageiros.visualizar",
    "passageiros.presenca_marcar",
    "rotas.visualizar",
    "rotas.criar_editar",
    "rotas.excluir",
    "rotas.iniciar_encerrar",
    "rotas.executar_paradas",
    "aniversarios.visualizar",
  ],

  [UserType.MONITOR]: [
    "passageiros.visualizar",
    "passageiros.presenca_marcar",
    "rotas.visualizar",
    "rotas.iniciar_encerrar",
    "rotas.executar_paradas",
    "aniversarios.visualizar",
  ],

  [UserType.RESPONSAVEL]: [
    "passageiros.visualizar",
  ],
};

export function hasPermission(userType: UserType | string | undefined, permission: PermissionKey): boolean {
  if (!userType) return false;
  const roleEnum = userType as UserType;
  const permissions = ROLE_PERMISSIONS[roleEnum] || [];
  return permissions.includes(permission);
}
