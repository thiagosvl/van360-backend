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

export const ALL_PERMISSIONS: PermissionKey[] = [
  "financeiro.visualizar",
  "cobrancas.gerenciar",
  "contratos.gerenciar",
  "relatorios.visualizar",
  "assinatura.gerenciar",
  "veiculos.gerenciar",
  "equipe.gerenciar_todos",
  "equipe.gerenciar_monitores",
  "passageiros.visualizar",
  "passageiros.gerenciar",
  "passageiros.cobranca_visualizar",
  "passageiros.presenca_marcar",
  "gastos.visualizar",
  "gastos.criar",
  "rotas.visualizar",
  "rotas.criar_editar",
  "rotas.excluir",
  "rotas.iniciar_encerrar",
  "rotas.executar_paradas",
  "escolas.visualizar",
  "escolas.gerenciar",
  "aniversarios.visualizar",
];

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
