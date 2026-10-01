import { adminPassageiroRepository } from "../../repositories/admin/admin-passageiro.repository.js";
import { getNowBR } from "../../utils/date.utils.js";
import { TipoResponsavel, CobrancaStatus } from "../../types/enums.js";

export const adminPassageiroService = {
  async getPassageirosByUserId(userId: string) {
    const now = getNowBR();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();

    const [passageiros, cobrancas] = await Promise.all([
      adminPassageiroRepository.listPassageirosByUserId(userId),
      adminPassageiroRepository.listCobrancasDoMesByUserId(userId, mesAtual, anoAtual),
    ]);

    type CobrancaMesItem = {
      id: string;
      passageiro_id: string;
      usuario_id: string | null;
      mes: number;
      ano: number;
      valor: number;
      status: string;
      data_vencimento: string;
      data_envio_ultima_notificacao: string | null;
      desativar_lembretes: boolean;
    };

    const cobrancasMap = new Map<string, CobrancaMesItem>();
    for (const c of cobrancas) {
      if (c.passageiro_id) {
        cobrancasMap.set(c.passageiro_id, c as CobrancaMesItem);
      }
    }

    return passageiros.map((p: Record<string, unknown>) => {
      const links = (p.responsaveis as Array<Record<string, unknown>>) || [];
      const principalLink = links.find((l) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
      const rawResp = principalLink?.responsavel;
      const resp = (Array.isArray(rawResp) ? rawResp[0] : rawResp) as Record<string, unknown> | undefined;

      const responsavelPrincipal = principalLink && resp ? {
        id: resp.id as string,
        nome: (resp.nome as string) || null,
        telefone: (resp.telefone as string) || null,
        cpf: (resp.cpf as string) || null,
        email: (resp.email as string) || null,
        parentesco: (principalLink.parentesco as string) || null,
      } : null;

      const cobranca = cobrancasMap.get(p.id as string) || null;
      const valor = Number(p.valor_cobranca ?? 0);
      const diaVencimento = p.dia_vencimento ? Number(p.dia_vencimento) : 0;

      const motivos: string[] = [];

      if (!p.ativo) {
        motivos.push("Aluno inativo");
      }
      if (p.enviar_notificacoes === false) {
        motivos.push("Notificações desativadas para o aluno");
      }
      if (!responsavelPrincipal) {
        motivos.push("Sem responsável cadastrado");
      } else if (!responsavelPrincipal.telefone && !responsavelPrincipal.email) {
        motivos.push("Responsável sem contato cadastrado");
      }
      if (valor <= 0) {
        motivos.push("Valor da mensalidade não informado");
      }
      if (diaVencimento <= 0) {
        motivos.push("Dia de vencimento não informado");
      }
      if (!cobranca) {
        motivos.push("Parcela do mês atual não gerada");
      } else if (cobranca.status === CobrancaStatus.PAGO) {
        motivos.push("Parcela do mês já foi paga");
      } else if (cobranca.status === CobrancaStatus.CANCELADA) {
        motivos.push("Parcela do mês cancelada");
      }

      const podeCobrar = motivos.length === 0;
      const motivoBloqueio = motivos.length > 0 ? motivos.join(" • ") : null;

      const { responsaveis: _ignored, ...cleanPassageiro } = p;

      return {
        ...cleanPassageiro,
        responsavel_principal: responsavelPrincipal,
        cobranca_mes_atual: cobranca,
        pode_cobrar: podeCobrar,
        motivo_bloqueio: motivoBloqueio,
      };
    });
  },

  async getPrePassageirosByUserId(userId: string) {
    return adminPassageiroRepository.listPrePassageirosByUserId(userId);
  },
};

