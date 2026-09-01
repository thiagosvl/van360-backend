import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { gastoRepository } from "../repositories/gasto.repository.js";
import { CobrancaStatus, GastoCategoria } from "../types/enums.js";
import { getNowBR, toLocalDateString, getLastDayOfMonth, getSafeDueDateString } from "../utils/date.utils.js";
import { getUsuarioData } from "./usuario.service.js";

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
  getResumo: async (usuarioId: string, mes?: number, ano?: number, veiculoId?: string): Promise<SystemSummary> => {
    // 1. Fetch User
    const usuario = await getUsuarioData(usuarioId);
    if (!usuario) throw new Error("Usuário não encontrado");

    const isSubAccount = Boolean(usuario.conta_pai_id);
    const dataOwnerId = usuario.conta_pai_id || usuarioId;
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

    // Process Counters
    const passageirosList = passData.data || [];
    const passTotal = passageirosList.length;
    const passAtivos = passageirosList.filter((p: Record<string, any>) => p.ativo).length;
    const passInativos = passTotal - passAtivos;

    const veicTotal = veiculosCount.data?.length || 0;
    const veicAtivos = veiculosCount.data?.filter((v: Record<string, any>) => v.ativo).length || 0;
    const veicInativos = veicTotal - veicAtivos;

    const escTotal = escolasCount.data?.length || 0;
    const escAtivos = escolasCount.data?.filter((e: Record<string, any>) => e.ativo).length || 0;
    const escInativos = escTotal - escAtivos;

    // 3. Financial Summary
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

    const cobrancas = cobrancasRes.data || [];
    const gastos = gastosRes.data || [];

    const cobrancasPagas = cobrancas.filter((c: Record<string, any>) => c.status === CobrancaStatus.PAGO);
    const receitaRealizada = cobrancasPagas.reduce((acc: number, c: Record<string, any>) => acc + Number(c.valor || 0), 0);

    const hoje = toLocalDateString(getNowBR());
    const isPastPeriod = targetAno < now.getFullYear() || (targetAno === now.getFullYear() && targetMes < (now.getMonth() + 1));
    let receitaProjetada = 0;
    let atrasosProjetadosValor = 0;
    let atrasosProjetadosCount = 0;

    if (!isPastPeriod) {
      const passageirosComCobranca = new Set(cobrancas.map((c: Record<string, any>) => c.passageiro_id));
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

      passageirosList.forEach((p: Record<string, any>) => {
        if (!p.ativo || p.isento || passageirosComCobranca.has(p.id) || !p.valor_cobranca || Number(p.valor_cobranca) <= 0) {
          return;
        }

        const inicioStr = p.data_inicio_cobranca || p.created_at || driverCreatedAt;
        const inicio = parseYearMonth(inicioStr);
        if (inicio) {
          if (targetAno < inicio.year || (targetAno === inicio.year && targetMes < inicio.month)) {
            return;
          }
        }

        if (p.data_fim_cobranca) {
          const fim = parseYearMonth(p.data_fim_cobranca);
          if (fim) {
            if (targetAno > fim.year || (targetAno === fim.year && targetMes > fim.month)) {
              return;
            }
          }
        }

        receitaProjetada += Number(p.valor_cobranca);

        const dataVencProj = getSafeDueDateString(p.dia_vencimento, targetMes, targetAno);

        if (dataVencProj < hoje) {
          atrasosProjetadosValor += Number(p.valor_cobranca);
          atrasosProjetadosCount += 1;
        }
      });
    }

    const cobrancasAtivas = cobrancas.filter((c: Record<string, any>) => c.status !== CobrancaStatus.CANCELADA);
    const receitaPrevista = cobrancasAtivas.reduce((acc: number, c: Record<string, any>) => acc + Number(c.valor || 0), 0) + receitaProjetada;
    const taxaRecebimento = receitaPrevista > 0 ? (receitaRealizada / receitaPrevista) * 100 : 0;

    const totalDespesas = gastos.reduce((acc: number, g: Record<string, any>) => acc + Number(g.valor || 0), 0);
    const detalhamentoGastos: Record<string, number> = {};
    
    gastos.forEach((g: Record<string, any>) => {
      const cat = g.categoria || GastoCategoria.OUTROS;
      detalhamentoGastos[cat] = (detalhamentoGastos[cat] || 0) + Number(g.valor || 0);
    });

    const margemOperacional = receitaRealizada > 0 ? ((receitaRealizada - totalDespesas) / receitaRealizada) * 100 : 0;

    const atrasosReais = cobrancas.filter((c: Record<string, any>) => c.status === CobrancaStatus.PENDENTE && c.data_vencimento < hoje);
    const valorAtrasosReais = atrasosReais.reduce((acc: number, c: Record<string, any>) => acc + Number(c.valor || 0), 0);

    const valorAtrasos = valorAtrasosReais + atrasosProjetadosValor;
    const countAtrasos = atrasosReais.length + atrasosProjetadosCount;

    const passageirosPagos = new Set(cobrancasPagas.map((c: Record<string, any>) => c.passageiro_id)).size;
    const ticketMedio = passageirosPagos > 0 ? receitaRealizada / passageirosPagos : 0;

    const financeiro = {
      receita: {
        realizada: receitaRealizada,
        prevista: receitaPrevista,
        pendente: receitaPrevista - receitaRealizada,
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
