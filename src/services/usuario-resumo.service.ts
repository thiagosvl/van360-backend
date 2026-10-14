import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { gastoRepository } from "../repositories/gasto.repository.js";
import { CobrancaStatus, GastoCategoria } from "../types/enums.js";
import { getNowBR, toLocalDateString, getLastDayOfMonth, getSafeDueDateString } from "../utils/date.utils.js";
import { getUsuarioData } from "./usuario.service.js";
import { isSubConta, getDonoContaId } from "../utils/user.utils.js";
import type { Tables } from "../types/database.types.js";

type DashboardCobranca = Pick<Tables<"cobrancas">, "status" | "valor" | "valor_pago" | "data_vencimento" | "passageiro_id">;
type DashboardGasto = Pick<Tables<"gastos">, "valor" | "categoria">;

interface SystemSummary {
  usuario: {
    ativo: boolean;
    flags: {
      usar_contratos: boolean;
    };
  };
  contadores: {
    passageiros: {
      total: number;
      ativos: number;
      inativos: number;
      solicitacoes_pendentes: number;
    };
    veiculos: {
      total: number;
      ativos: number;
      inativos: number;
    };
    escolas: {
      total: number;
      ativos: number;
      inativos: number;
    };
  };
  financeiro?: {
    receita: {
      realizada: number;
      prevista: number;
      pendente: number;
      taxa_recebimento: number;
    };
    saidas: {
      total: number;
      margem_operacional: number;
      detalhamento: Record<string, number>;
    };
    atrasos: {
      valor: number;
      count: number;
    };
    ticket_medio: number;
  };
}

export const usuarioResumoService = {
  getResumo: async (usuarioId: string, mes?: number, ano?: number, veiculoId?: string, canViewFinancials: boolean = true): Promise<SystemSummary> => {
    // 1. Fetch User
    const usuario = await getUsuarioData(usuarioId);
    if (!usuario) throw new Error("Usuário não encontrado");

    const isSubAccount = isSubConta(usuario);
    const dataOwnerId = getDonoContaId(usuario) || usuarioId;
    const targetVeiculoId = veiculoId || usuario.veiculo_id;

    // 2. Parallel Fetching for Counters & Status
    const [
      veiculosCount,
      escolasCount,
      passData,
      prePassageirosCount,
    ] = await Promise.all([
      veiculoRepository.getSummaryForDashboard(dataOwnerId),
      escolaRepository.getSummaryForDashboard(dataOwnerId),
      passageiroRepository.getSummaryForDashboard(dataOwnerId, targetVeiculoId),
      prePassageiroRepository.getCountForDashboard(dataOwnerId),
    ]);

    const currentYear = getNowBR().getFullYear();
    const passageirosList = passData.data || [];
    const currentYearMatriculas = passageirosList.filter(
      (p: Record<string, any>) => Number(p.ano_letivo || currentYear) === currentYear
    );
    const passTotal = currentYearMatriculas.length;
    const passAtivos = currentYearMatriculas.filter((p: Record<string, any>) => p.ativo).length;
    const passInativos = passTotal - passAtivos;

    const veicTotal = veiculosCount.data?.length || 0;
    const veicAtivos = veiculosCount.data?.filter((v: Record<string, any>) => v.ativo).length || 0;
    const veicInativos = veicTotal - veicAtivos;

    const escTotal = escolasCount.data?.length || 0;
    const escAtivos = escolasCount.data?.filter((e: Record<string, any>) => e.ativo).length || 0;
    const escInativos = escTotal - escAtivos;

    if (!canViewFinancials || isSubAccount) {
      return {
        usuario: {
          ativo: (usuario as Record<string, any>).ativo,
          flags: {
            usar_contratos: !!usuario.config_contrato?.usar_contratos,
          }
        },
        contadores: {
          passageiros: {
            total: passTotal,
            ativos: passAtivos,
            inativos: passInativos,
            solicitacoes_pendentes: prePassageirosCount.count || 0
          },
          veiculos: {
            total: veicTotal,
            ativos: veicAtivos,
            inativos: veicInativos
          },
          escolas: {
            total: escTotal,
            ativos: escAtivos,
            inativos: escInativos
          }
        },
        financeiro: undefined
      };
    }

    const now = getNowBR();
    const targetMes = mes ?? (now.getMonth() + 1);
    const targetAno = ano ?? now.getFullYear();

    const start = `${targetAno}-${String(targetMes).padStart(2, '0')}-01`;
    const lastDay = getLastDayOfMonth(Number(targetAno), Number(targetMes));
    const end = `${targetAno}-${String(targetMes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [cobrancasRes, gastosRes] = await Promise.all([
      cobrancaRepository.getForPeriodForDashboard(dataOwnerId, start, end, targetVeiculoId),
      gastoRepository.getGastosForPeriodForDashboard(dataOwnerId, start, end, targetVeiculoId)
    ]);

    const cobrancas = (cobrancasRes.data || []) as unknown as DashboardCobranca[];
    const gastos = (gastosRes.data || []) as unknown as DashboardGasto[];

    const cobrancasPagas = cobrancas.filter((c) => c.status === CobrancaStatus.PAGO);
    const receitaRealizada = cobrancasPagas.reduce((acc: number, c) => acc + Number(c.valor_pago ?? c.valor ?? 0), 0);

    const hoje = toLocalDateString(getNowBR());
    const isPastPeriod = targetAno < now.getFullYear() || (targetAno === now.getFullYear() && targetMes < (now.getMonth() + 1));
    let receitaProjetada = 0;
    let atrasosProjetadosValor = 0;
    let atrasosProjetadosCount = 0;

    if (!isPastPeriod) {
      const passageirosComCobranca = new Set(cobrancas.map((c) => c.passageiro_id));
      const driverCreatedAt = (usuario as Record<string, any>)?.created_at;

      const parseYearMonth = (dateStr?: string | null) => {
        if (!dateStr) return null;
        if (dateStr.includes("-")) {
          const parts = dateStr.split("-");
          if (parts.length >= 2) {
            const year = Number(parts[0]);
            const month = Number(parts[1]);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
              return { year, month };
            }
          }
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      };

      const candidateMatriculas = [...passageirosList]
        .filter((p: Record<string, any>) => {
          const anoMat = Number(p.ano_letivo || targetAno);
          return anoMat === targetAno || anoMat === targetAno - 1;
        })
        .sort((a, b) => Number(b.ano_letivo || 0) - Number(a.ano_letivo || 0));

      candidateMatriculas.forEach((p: Record<string, any>) => {
        if (!p.ativo || p.isento || passageirosComCobranca.has(p.id) || !p.valor_cobranca || Number(p.valor_cobranca) <= 0) {
          return;
        }

        const anoMat = Number(p.ano_letivo || targetAno);
        const inicioStr = p.data_inicio_cobranca || p.created_at || driverCreatedAt;
        const inicio = parseYearMonth(inicioStr) || { year: anoMat, month: 1 };
        if (targetAno < inicio.year || (targetAno === inicio.year && targetMes < inicio.month)) {
          return;
        }

        const fim = p.data_fim_cobranca
          ? (parseYearMonth(p.data_fim_cobranca) || { year: anoMat, month: 12 })
          : { year: anoMat, month: 12 };
        if (targetAno > fim.year || (targetAno === fim.year && targetMes > fim.month)) {
          return;
        }

        passageirosComCobranca.add(p.id);
        receitaProjetada += Number(p.valor_cobranca);

        const dataVencProj = getSafeDueDateString(p.dia_vencimento, targetMes, targetAno);

        if (dataVencProj < hoje) {
          atrasosProjetadosValor += Number(p.valor_cobranca);
          atrasosProjetadosCount += 1;
        }
      });
    }

    const cobrancasPendentes = cobrancas.filter((c) => c.status === CobrancaStatus.PENDENTE);
    const valorPendenteReais = cobrancasPendentes.reduce((acc: number, c) => acc + Number(c.valor || 0), 0);
    const saldoParcialRecebidas = cobrancasPagas.reduce((acc: number, c) => {
      const pago = Number(c.valor_pago ?? c.valor ?? 0);
      const total = Number(c.valor || 0);
      return acc + (pago < total ? total - pago : 0);
    }, 0);

    const receitaPendente = valorPendenteReais + saldoParcialRecebidas + receitaProjetada;
    const receitaPrevista = receitaRealizada + receitaPendente;
    const taxaRecebimento = receitaPrevista > 0 ? (receitaRealizada / receitaPrevista) * 100 : 0;

    const totalDespesas = gastos.reduce((acc: number, g) => acc + Number(g.valor || 0), 0);
    const detalhamentoGastos: Record<string, number> = {};
    
    gastos.forEach((g) => {
      const cat = g.categoria || GastoCategoria.OUTROS;
      detalhamentoGastos[cat] = (detalhamentoGastos[cat] || 0) + Number(g.valor || 0);
    });

    const margemOperacional = receitaRealizada > 0 ? ((receitaRealizada - totalDespesas) / receitaRealizada) * 100 : 0;

    const cobrancasAtrasadas = cobrancas.filter((c) => {
      if (c.status === CobrancaStatus.CANCELADA) return false;
      if (c.data_vencimento >= hoje) return false;
      if (c.status === CobrancaStatus.PENDENTE) return true;
      if (c.status === CobrancaStatus.PAGO) {
        const pago = Number(c.valor_pago ?? c.valor ?? 0);
        const total = Number(c.valor || 0);
        return pago < total;
      }
      return false;
    });

    const valorAtrasosReais = cobrancasAtrasadas.reduce((acc: number, c) => {
      if (c.status === CobrancaStatus.PENDENTE) return acc + Number(c.valor || 0);
      const pago = Number(c.valor_pago ?? c.valor ?? 0);
      const total = Number(c.valor || 0);
      return acc + (total - pago);
    }, 0);

    const valorAtrasos = valorAtrasosReais + atrasosProjetadosValor;
    const countAtrasos = cobrancasAtrasadas.length + atrasosProjetadosCount;

    const passageirosPagos = new Set(cobrancasPagas.map((c) => c.passageiro_id)).size;
    const ticketMedio = passageirosPagos > 0 ? receitaRealizada / passageirosPagos : 0;

    const financeiro = {
      receita: {
        realizada: receitaRealizada,
        prevista: receitaPrevista,
        pendente: receitaPendente,
        taxa_recebimento: Math.round(taxaRecebimento)
      },
      saidas: {
        total: totalDespesas,
        margem_operacional: Math.round(margemOperacional),
        detalhamento: detalhamentoGastos
      },
      atrasos: {
        valor: valorAtrasos,
        count: countAtrasos
      },
      ticket_medio: ticketMedio
    };

    return {
      usuario: {
        ativo: (usuario as Record<string, any>).ativo,
        flags: {
          usar_contratos: !!usuario.config_contrato?.usar_contratos,
        }
      },
      contadores: {
        passageiros: {
          total: passTotal,
          ativos: passAtivos,
          inativos: passInativos,
          solicitacoes_pendentes: prePassageirosCount.count || 0
        },
        veiculos: {
          total: veicTotal,
          ativos: veicAtivos,
          inativos: veicInativos
        },
        escolas: {
          total: escTotal,
          ativos: escAtivos,
          inativos: escInativos
        }
      },
      financeiro: isSubAccount ? undefined : financeiro
    };
  }
};
