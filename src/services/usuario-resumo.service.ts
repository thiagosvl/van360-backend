import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { passageiroRepository, isMatriculaCoveringMonthYear } from "../repositories/passageiro.repository.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { gastoRepository } from "../repositories/gasto.repository.js";
import { fretamentoService } from "./fretamento.service.js";
import { CobrancaStatus, GastoCategoria } from "../types/enums.js";
import { getNowBR, toLocalDateString, getLastDayOfMonth, getSafeDueDateString } from "../utils/date.utils.js";
import { getUsuarioData } from "./usuario.service.js";
import { isSubConta, getDonoContaId } from "../utils/user.utils.js";
import { authCacheService, type AuthProfileData } from "./auth-cache.service.js";
import type { Tables } from "../types/database.types.js";

type DashboardCobranca = Pick<Tables<"cobrancas">, "status" | "valor" | "valor_pago" | "data_vencimento" | "passageiro_id">;
type DashboardGasto = Pick<Tables<"gastos">, "valor" | "categoria" | "fretamento_id">;

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
      sem_valor_cobranca: number;
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
      despesas_escolares?: number;
      margem_operacional: number;
      detalhamento: Record<string, number>;
    };
    atrasos: {
      valor: number;
      count: number;
    };
    ticket_medio: number;
    custo_por_passageiro?: number;
    viagens?: {
      fretamentos_realizado: number;
      fretamentos_previsto: number;
      fretamentos_pendente: number;
      passeios_realizado: number;
      passeios_previsto: number;
      passeios_pendente: number;
      total_realizado: number;
      total_previsto: number;
      total_pendente: number;
    };
  };
}

export const usuarioResumoService = {
  getResumo: async (
    usuarioId: string,
    mes?: number,
    ano?: number,
    veiculoId?: string,
    canViewFinancials: boolean = true,
    cachedProfile?: AuthProfileData
  ): Promise<SystemSummary> => {
    const now = getNowBR();
    const targetMes = mes ?? (now.getMonth() + 1);
    const targetAno = ano ?? now.getFullYear();

    const initialOwnerId = cachedProfile ? (getDonoContaId(cachedProfile) || usuarioId) : usuarioId;
    const initialVeiculoId = veiculoId || cachedProfile?.veiculo_id || undefined;
    const cacheSubKey = `${targetMes}:${targetAno}:${initialVeiculoId || "all"}:${canViewFinancials ? "fin" : "nofin"}`;

    const cachedResumo = await authCacheService.getCachedResumo<SystemSummary>(initialOwnerId, cacheSubKey);
    if (cachedResumo) {
      return cachedResumo;
    }

    return authCacheService.resolveResumoSingleflight(initialOwnerId, cacheSubKey, async () => {
      const recheck = await authCacheService.getCachedResumo<SystemSummary>(initialOwnerId, cacheSubKey);
      if (recheck) {
        return recheck;
      }

      const usuario =
        cachedProfile && cachedProfile.id === usuarioId && cachedProfile.created_at !== undefined
          ? cachedProfile
          : await getUsuarioData(usuarioId);
      if (!usuario) throw new Error("Usuário não encontrado");

      const isSubAccount = isSubConta(usuario);
      const dataOwnerId = getDonoContaId(usuario) || usuarioId;
      const targetVeiculoId = veiculoId || (usuario.veiculo_id as string | undefined);

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

      const currentYear = now.getFullYear();
      const passageirosList = passData.data || [];
      const uniquePassageiroIds = new Set<string>();
      const activePassageiroIds = new Set<string>();
      const semValorPassageiroIds = new Set<string>();

      for (const p of passageirosList) {
        uniquePassageiroIds.add(p.id);
        if (p.ativo && Number(p.ano_letivo || currentYear) >= currentYear) {
          activePassageiroIds.add(p.id);
        }
        if (
          p.ativo &&
          Number(p.ano_letivo || currentYear) === Number(targetAno) &&
          !p.isento &&
          (!p.valor_cobranca || Number(p.valor_cobranca) <= 0)
        ) {
          semValorPassageiroIds.add(p.id);
        }
      }

      const passTotal = uniquePassageiroIds.size;
      const passAtivos = activePassageiroIds.size;
      const passInativos = passTotal - passAtivos;
      const passSemValor = semValorPassageiroIds.size;

      const veicTotal = veiculosCount.data?.length || 0;
      const veicAtivos = veiculosCount.data?.filter((v: { ativo: boolean | null }) => v.ativo).length || 0;
      const veicInativos = veicTotal - veicAtivos;

      const escTotal = escolasCount.data?.length || 0;
      const escAtivos = escolasCount.data?.filter((e: { ativo: boolean | null }) => e.ativo).length || 0;
      const escInativos = escTotal - escAtivos;

      const configContrato = (usuario as { config_contrato?: { usar_contratos?: boolean } | null }).config_contrato;

      if (!canViewFinancials || isSubAccount) {
        const partialSummary: SystemSummary = {
          usuario: {
            ativo: Boolean((usuario as Record<string, unknown>).ativo),
            flags: {
              usar_contratos: Boolean(configContrato?.usar_contratos),
            }
          },
          contadores: {
            passageiros: {
              total: passTotal,
              ativos: passAtivos,
              inativos: passInativos,
              solicitacoes_pendentes: prePassageirosCount.count || 0,
              sem_valor_cobranca: passSemValor
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

        await authCacheService.setCachedResumo(dataOwnerId, cacheSubKey, partialSummary);
        return partialSummary;
      }

      const start = `${targetAno}-${String(targetMes).padStart(2, '0')}-01`;
      const lastDay = getLastDayOfMonth(Number(targetAno), Number(targetMes));
      const end = `${targetAno}-${String(targetMes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [cobrancasRes, gastosRes, resumoViagens] = await Promise.all([
      cobrancaRepository.getForPeriodForDashboard(dataOwnerId, start, end, targetVeiculoId),
      gastoRepository.getGastosForPeriodForDashboard(dataOwnerId, start, end, targetVeiculoId),
      fretamentoService.obterResumoFinanceiro(dataOwnerId, Number(targetMes), Number(targetAno), targetVeiculoId)
    ]);

    const cobrancas = (cobrancasRes.data || []) as unknown as DashboardCobranca[];
    const gastos = (gastosRes.data || []) as unknown as DashboardGasto[];

    const cobrancasPagas = cobrancas.filter((c) => c.status === CobrancaStatus.PAGO);
    const receitaRealizadaCobrancas = cobrancasPagas.reduce((acc: number, c) => acc + Number(c.valor_pago ?? c.valor ?? 0), 0);
    const receitaViagensRealizada = resumoViagens?.total_recebido || 0;
    const receitaRealizada = receitaRealizadaCobrancas + receitaViagensRealizada;

    const hoje = toLocalDateString(getNowBR());
    const isPastPeriod = targetAno < now.getFullYear() || (targetAno === now.getFullYear() && targetMes < (now.getMonth() + 1));
    let receitaProjetada = 0;
    let atrasosProjetadosValor = 0;
    let atrasosProjetadosCount = 0;

    if (!isPastPeriod) {
      const passageirosComCobranca = new Set(cobrancas.map((c) => c.passageiro_id));
      const driverCreatedAt = (usuario as Record<string, unknown>)?.created_at as string | null | undefined;

      const candidateMatriculas = [...passageirosList]
        .filter((p: Record<string, unknown>) => {
          const anoMat = Number(p.ano_letivo || targetAno);
          return anoMat >= targetAno - 1 && anoMat <= targetAno + 1;
        })
        .sort((a, b) => {
          const aIsTarget = Number(a.ano_letivo || 0) === Number(targetAno) ? 1 : 0;
          const bIsTarget = Number(b.ano_letivo || 0) === Number(targetAno) ? 1 : 0;
          if (aIsTarget !== bIsTarget) return bIsTarget - aIsTarget;
          return Number(a.ano_letivo || 0) - Number(b.ano_letivo || 0);
        });

      candidateMatriculas.forEach((p: Record<string, unknown>) => {
        const passageiroId = String(p.id || "");
        if (
          !passageiroId ||
          !p.ativo ||
          p.isento ||
          passageirosComCobranca.has(passageiroId) ||
          !p.valor_cobranca ||
          Number(p.valor_cobranca) <= 0
        ) {
          return;
        }

        if (!isMatriculaCoveringMonthYear(p, Number(targetMes), Number(targetAno), driverCreatedAt)) {
          return;
        }

        passageirosComCobranca.add(passageiroId);
        receitaProjetada += Number(p.valor_cobranca);

        const dataVencProj = getSafeDueDateString(p.dia_vencimento as number | null | undefined, Number(targetMes), Number(targetAno));

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

    const receitaViagensPendente = resumoViagens?.total_a_receber || 0;
    const receitaPendente = valorPendenteReais + saldoParcialRecebidas + receitaProjetada + receitaViagensPendente;
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
    const ticketMedio = passageirosPagos > 0 ? receitaRealizadaCobrancas / passageirosPagos : 0;

    const despesasEscolares = gastos
      .filter((g) => !g.fretamento_id)
      .reduce((acc: number, g) => acc + Number(g.valor || 0), 0);
    const custoPorPassageiro = passAtivos > 0 ? despesasEscolares / passAtivos : 0;

    const financeiro = {
      receita: {
        realizada: receitaRealizada,
        prevista: receitaPrevista,
        pendente: receitaPendente,
        taxa_recebimento: Math.round(taxaRecebimento)
      },
      saidas: {
        total: totalDespesas,
        despesas_escolares: despesasEscolares,
        margem_operacional: Math.round(margemOperacional),
        detalhamento: detalhamentoGastos
      },
      atrasos: {
        valor: valorAtrasos,
        count: countAtrasos
      },
      ticket_medio: ticketMedio,
      custo_por_passageiro: custoPorPassageiro,
      viagens: {
        fretamentos_realizado: resumoViagens?.fretamentos_realizado || 0,
        fretamentos_previsto: resumoViagens?.fretamentos_previsto || 0,
        fretamentos_pendente: resumoViagens?.fretamentos_pendente || 0,
        passeios_realizado: resumoViagens?.passeios_realizado || 0,
        passeios_previsto: resumoViagens?.passeios_previsto || 0,
        passeios_pendente: resumoViagens?.passeios_pendente || 0,
        total_realizado: resumoViagens?.total_recebido || 0,
        total_previsto: resumoViagens?.total_faturado_previsto || 0,
        total_pendente: resumoViagens?.total_a_receber || 0
      }
    };

      const fullSummary: SystemSummary = {
        usuario: {
          ativo: Boolean((usuario as Record<string, unknown>).ativo),
          flags: {
            usar_contratos: Boolean(configContrato?.usar_contratos),
          }
        },
        contadores: {
          passageiros: {
            total: passTotal,
            ativos: passAtivos,
            inativos: passInativos,
            solicitacoes_pendentes: prePassageirosCount.count || 0,
            sem_valor_cobranca: passSemValor
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

      await authCacheService.setCachedResumo(dataOwnerId, cacheSubKey, fullSummary);
      return fullSummary;
    });
  }
};
