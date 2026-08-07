import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserType } from "../src/types/enums.js";
import { hasPermission, ROLE_PERMISSIONS } from "../src/config/permissions.js";

// Mock Supabase para testes de integridade sem depender do BD real
vi.mock("../src/config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock("../src/services/providers/auth.provider.js", () => ({
  authProvider: {
    getUser: vi.fn(),
  },
}));

describe("Suíte de Testes RBAC & Controle de Acesso Multi-Usuário", () => {
  describe("1. Matriz de Permissões (ROLE_PERMISSIONS)", () => {
    it("Motorista Frotista (Gestor) deve possuir acesso total", () => {
      expect(hasPermission(UserType.MOTORISTA, "cobrancas.gerenciar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA, "contratos.gerenciar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA, "veiculos.gerenciar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA, "equipe.gerenciar_todos")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA, "gastos.visualizar")).toBe(true);
    });

    it("Motorista Auxiliar deve possuir acesso operacional, mas bloqueio financeiro/frota/equipe", () => {
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "rotas.visualizar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "rotas.criar_editar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "gastos.visualizar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "gastos.criar")).toBe(true);

      // Bloqueios de Segurança
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "equipe.gerenciar_monitores")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "escolas.visualizar")).toBe(true);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "escolas.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "cobrancas.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "contratos.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "veiculos.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "equipe.gerenciar_todos")).toBe(false);
      expect(hasPermission(UserType.MOTORISTA_AUXILIAR, "assinatura.gerenciar")).toBe(false);
    });

    it("Monitor deve possuir acesso restrito à prancheta e rotas", () => {
      expect(hasPermission(UserType.MONITOR, "rotas.visualizar")).toBe(true);
      expect(hasPermission(UserType.MONITOR, "rotas.executar_paradas")).toBe(true);

      expect(hasPermission(UserType.MONITOR, "passageiros.visualizar")).toBe(true);
      expect(hasPermission(UserType.MONITOR, "passageiros.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "escolas.visualizar")).toBe(true);
      expect(hasPermission(UserType.MONITOR, "escolas.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "gastos.visualizar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "gastos.criar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "cobrancas.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "contratos.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "veiculos.gerenciar")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "equipe.gerenciar_monitores")).toBe(false);
      expect(hasPermission(UserType.MONITOR, "equipe.gerenciar_todos")).toBe(false);
    });
  });

  describe("2. Regra de Negócio: Transparência Frotista vs Sub-Conta", () => {
    it("Frotista com 1 van ou mais NÃO pode ter filtro forçado de assigned_veiculo_id", () => {
      const profileFrotista = {
        id: "gestor-uuid-1",
        tipo: UserType.MOTORISTA,
        conta_pai_id: null,
        veiculo_id: "van-do-gestor-1",
      };

      const isSubAccount = !!profileFrotista.conta_pai_id || profileFrotista.tipo === UserType.MOTORISTA_AUXILIAR || profileFrotista.tipo === UserType.MONITOR;
      const data_owner_id = profileFrotista.conta_pai_id || profileFrotista.id;
      const assigned_veiculo_id = isSubAccount ? (profileFrotista.veiculo_id || null) : null;

      expect(isSubAccount).toBe(false);
      expect(data_owner_id).toBe("gestor-uuid-1");
      expect(assigned_veiculo_id).toBeNull(); // Transparência total mantida!
    });

    it("Sub-conta deve herdar o data_owner_id do Gestor e ter o assigned_veiculo_id restrito", () => {
      const profileAuxiliar = {
        id: "auxiliar-uuid-1",
        tipo: UserType.MOTORISTA_AUXILIAR,
        conta_pai_id: "gestor-uuid-1",
        veiculo_id: "van-designada-2",
      };

      const isSubAccount = !!profileAuxiliar.conta_pai_id || profileAuxiliar.tipo === UserType.MOTORISTA_AUXILIAR || profileAuxiliar.tipo === UserType.MONITOR;
      const data_owner_id = profileAuxiliar.conta_pai_id || profileAuxiliar.id;
      const assigned_veiculo_id = isSubAccount ? (profileAuxiliar.veiculo_id || null) : null;

      expect(isSubAccount).toBe(true);
      expect(data_owner_id).toBe("gestor-uuid-1");
      expect(assigned_veiculo_id).toBe("van-designada-2");
    });
  });
});
