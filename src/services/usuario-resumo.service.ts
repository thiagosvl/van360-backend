import { supabaseAdmin } from "../config/supabase.js";
import { CobrancaStatus } from "../types/enums.js";
import { getNowBR, toLocalDateString, getLastDayOfMonth } from "../utils/date.utils.js";
import { getUsuarioData } from "./usuario.service.js";

interface SystemSummary {
  usuario: {
    ativo: boolean;
    flags: {
      contrato_configurado: boolean;
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
    };
    atrasos: {
      valor: number;
      count: number;
    };
    ticket_medio: number;
  };
}

export const usuarioResumoService = {
  getResumo: async (usuarioId: string, mes?: number, ano?: number): Promise<SystemSummary> => {
    // 1. Fetch User
    const usuario = await getUsuarioData(usuarioId);
    if (!usuario) throw new Error("Usuário não encontrado");

    // 2. Parallel Fetching for Counters & Status
    const [
      veiculosCount,
      escolasCount,
      passData,
      prePassageirosCount,
    ] = await Promise.all([
      supabaseAdmin.from("veiculos").select("id, ativo").eq("usuario_id", usuarioId),
      supabaseAdmin.from("escolas").select("id, ativo").eq("usuario_id", usuarioId),
      supabaseAdmin.from("passageiros").select("id, ativo").eq("usuario_id", usuarioId),
      supabaseAdmin.from("pre_passageiros").select("id", { count: "exact", head: true }).eq("usuario_id", usuarioId),
    ]);

    // Process Counters
    const passageirosList = passData.data || [];
    const passTotal = passageirosList.length;
    const passAtivos = passageirosList.filter((p: any) => p.ativo).length;
    const passInativos = passTotal - passAtivos;

    const veicTotal = veiculosCount.data?.length || 0;
    const veicAtivos = veiculosCount.data?.filter((v: any) => v.ativo).length || 0;
    const veicInativos = veicTotal - veicAtivos;

    const escTotal = escolasCount.data?.length || 0;
    const escAtivos = escolasCount.data?.filter((e: any) => e.ativo).length || 0;
    const escInativos = escTotal - escAtivos;

    // 3. Financial Summary
    const now = getNowBR();
    const targetMes = mes ?? (now.getMonth() + 1);
    const targetAno = ano ?? now.getFullYear();

    const start = `${targetAno}-${String(targetMes).padStart(2, '0')}-01`;
    const lastDay = getLastDayOfMonth(Number(targetAno), Number(targetMes));
    const end = `${targetAno}-${String(targetMes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [cobrancasRes, gastosRes] = await Promise.all([
      supabaseAdmin.from("cobrancas").select("*").eq("usuario_id", usuarioId).gte("data_vencimento", start).lte("data_vencimento", end),
      supabaseAdmin.from("gastos").select("*").eq("usuario_id", usuarioId).gte("data", start).lte("data", end)
    ]);

    const cobrancas = cobrancasRes.data || [];
    const gastos = gastosRes.data || [];

    const cobrancasPagas = cobrancas.filter((c: any) => c.status === CobrancaStatus.PAGO);
    const receitaRealizada = cobrancasPagas.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);
    const receitaPrevista = cobrancas.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);
    const taxaRecebimento = receitaPrevista > 0 ? (receitaRealizada / receitaPrevista) * 100 : 0;

    const totalDespesas = gastos.reduce((acc: number, g: any) => acc + Number(g.valor || 0), 0);
    const margemOperacional = receitaRealizada > 0 ? ((receitaRealizada - totalDespesas) / receitaRealizada) * 100 : 0;

    const hoje = toLocalDateString(getNowBR());
    const atrasos = cobrancas.filter((c: any) => c.status === CobrancaStatus.PENDENTE && c.data_vencimento < hoje);
    const valorAtrasos = atrasos.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);

    const passageirosPagos = new Set(cobrancasPagas.map((c: any) => c.passageiro_id)).size;
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
        margem_operacional: Math.round(margemOperacional)
      },
      atrasos: {
        valor: valorAtrasos,
        count: atrasos.length
      },
      ticket_medio: ticketMedio
    };
    
    return {
      usuario: {
        ativo: (usuario as any).ativo,
        flags: {
          contrato_configurado: !!usuario.config_contrato?.configurado,
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
      financeiro
    };
  }
};
