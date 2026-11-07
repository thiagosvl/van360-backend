import { adminFinancialRepository } from "../../repositories/admin/admin-financial.repository.js";
import { SubscriptionStatus } from "../../types/enums.js";
import { getNowBR, parseLocalDate } from "../../utils/date.utils.js";
import { extrairDddTelefone, obterEstadoPorDdd } from "../../utils/ddd-estado.util.js";
import type {
  AdminDemographicsStatsResponseDTO,
  FaixaEtariaItemDTO,
  EvolucaoMensalUsuarioItemDTO,
  AdminEstadoDemographicsDTO,
  TrialPipelineItemDTO,
  TrialsPipelineResponseDTO
} from "../../types/dtos/admin-financial.dto.js";

function formatMonthYearLabel(date: Date): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const m = months[date.getMonth()];
  const y = String(date.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

function getYearMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface DemographicSubRaw {
  id: string;
  status: string;
  data_vencimento?: string | null;
  trial_ends_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface DemographicUserRaw {
  id: string;
  telefone?: string | null;
  data_nascimento?: string | null;
  created_at?: string | null;
  assinaturas?: DemographicSubRaw | DemographicSubRaw[] | null;
}

interface TrialPipelineRawRow {
  assinatura_id: string;
  usuario_id: string;
  nome: string;
  apelido: string;
  telefone: string | null;
  trial_ends_at: string;
  dias_restantes: number;
  dias_acessados: number | string;
  total_acoes: number | string;
  alunos: number | string;
  escolas: number | string;
  veiculos: number | string;
  rotas: number | string;
  contratos: number | string;
  solicitacoes: number | string;
  indicado_por: string | null;
  valor_mensal: number | string;
  valor_anual: number | string;
  status: string | null;
}

export const adminDemographicsService = {
  async getDemographicsStats(): Promise<AdminDemographicsStatsResponseDTO> {
    const { data: usuarios } = await adminFinancialRepository.getDemographicsRawData();
    const motoristas = (usuarios || []) as DemographicUserRaw[];

    const now = getNowBR();
    const currentYear = now.getFullYear();

    const ageBuckets = {
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55-64": 0,
      "65+": 0,
      "Não informado": 0
    };

    const totalCadastrados = motoristas.length;
    let trialsIniciados = 0;
    let trialsAtivos = 0;
    let convertidosPagantes = 0;
    let assinantesAtivos = 0;
    let expiradosOuCancelados = 0;

    const ultimos6MesesMap = new Map<string, EvolucaoMensalUsuarioItemDTO>();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, now.getMonth() - i, 1);
      const chave = getYearMonthKey(d);
      ultimos6MesesMap.set(chave, {
        chaveMes: chave,
        labelMes: formatMonthYearLabel(d),
        novosCadastros: 0,
        novosAssinantes: 0,
        cancelados: 0
      });
    }

    const estadosMap = new Map<string, { uf: string; nome: string; regiao: string; quantidade: number }>();

    for (const u of motoristas) {
      const ddd = extrairDddTelefone(u.telefone ?? undefined);
      const estadoInfo = obterEstadoPorDdd(ddd);
      const estadoAtual = estadosMap.get(estadoInfo.uf) || {
        uf: estadoInfo.uf,
        nome: estadoInfo.nome,
        regiao: estadoInfo.regiao,
        quantidade: 0,
      };
      estadoAtual.quantidade++;
      estadosMap.set(estadoInfo.uf, estadoAtual);

      if (u.data_nascimento) {
        const birthDate = parseLocalDate(u.data_nascimento);
        let age = currentYear - birthDate.getFullYear();
        const mDiff = now.getMonth() - birthDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < birthDate.getDate())) {
          age--;
        }

        if (age >= 18 && age <= 24) ageBuckets["18-24"]++;
        else if (age >= 25 && age <= 34) ageBuckets["25-34"]++;
        else if (age >= 35 && age <= 44) ageBuckets["35-44"]++;
        else if (age >= 45 && age <= 54) ageBuckets["45-54"]++;
        else if (age >= 55 && age <= 64) ageBuckets["55-64"]++;
        else if (age >= 65) ageBuckets["65+"]++;
        else ageBuckets["Não informado"]++;
      } else {
        ageBuckets["Não informado"]++;
      }

      if (u.created_at) {
        const cDate = parseLocalDate(u.created_at);
        const ym = getYearMonthKey(cDate);
        if (ultimos6MesesMap.has(ym)) {
          ultimos6MesesMap.get(ym)!.novosCadastros++;
        }
      }

      const assinaturas = Array.isArray(u.assinaturas)
        ? u.assinaturas
        : u.assinaturas
        ? [u.assinaturas]
        : [];

      if (assinaturas.length > 0) {
        trialsIniciados++;
        const sub = assinaturas[0];
        const isPagante = sub.status === SubscriptionStatus.ACTIVE && Boolean(sub.data_vencimento);

        if (sub.status === SubscriptionStatus.TRIAL) {
          trialsAtivos++;
        }

        if (isPagante) {
          convertidosPagantes++;
          assinantesAtivos++;
          if (sub.created_at) {
            const ym = getYearMonthKey(parseLocalDate(sub.created_at));
            if (ultimos6MesesMap.has(ym)) {
              ultimos6MesesMap.get(ym)!.novosAssinantes++;
            }
          }
        } else if (sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.CANCELED) {
          expiradosOuCancelados++;
          const dataEvento =
            sub.status === SubscriptionStatus.EXPIRED
              ? sub.trial_ends_at || sub.updated_at || sub.created_at
              : sub.updated_at || sub.created_at;

          if (dataEvento) {
            const ym = getYearMonthKey(parseLocalDate(dataEvento));
            if (ultimos6MesesMap.has(ym)) {
              ultimos6MesesMap.get(ym)!.cancelados++;
            }
          }
        }
      }
    }

    const faixasEtarias: FaixaEtariaItemDTO[] = Object.entries(ageBuckets).map(([faixa, quantidade]) => ({
      faixa,
      quantidade,
      porcentagem: totalCadastrados > 0 ? Math.round((quantidade / totalCadastrados) * 1000) / 10 : 0
    }));

    const distribuicaoEstados: AdminEstadoDemographicsDTO[] = Array.from(estadosMap.values())
      .map((item) => ({
        uf: item.uf,
        nome: item.nome,
        regiao: item.regiao,
        quantidade: item.quantidade,
        porcentagem: totalCadastrados > 0 ? Math.round((item.quantidade / totalCadastrados) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const taxaConversaoTrial =
      trialsIniciados > 0 ? Math.round((convertidosPagantes / trialsIniciados) * 1000) / 10 : 0;
    const taxaRetencaoAtiva =
      convertidosPagantes > 0 ? Math.round((assinantesAtivos / convertidosPagantes) * 1000) / 10 : 0;

    return {
      faixasEtarias,
      funil: {
        cadastrados: totalCadastrados,
        trialsIniciados,
        trialsAtivos,
        convertidosPagantes,
        assinantesAtivos,
        expiradosOuCancelados,
        taxaConversaoTrial,
        taxaRetencaoAtiva
      },
      evolucaoMensal: Array.from(ultimos6MesesMap.values()),
      distribuicaoEstados,
    };
  },

  async getTrialsPipeline(): Promise<TrialsPipelineResponseDTO> {
    const { data, error } = await adminFinancialRepository.getTrialsPipeline();

    if (error) {
      throw error;
    }

    const trialsRaw = (data || []) as TrialPipelineRawRow[];

    const trials: TrialPipelineItemDTO[] = trialsRaw.map((item) => ({
      assinaturaId: item.assinatura_id,
      usuarioId: item.usuario_id,
      nome: item.nome,
      apelido: item.apelido?.trim() ? item.apelido.trim() : null,
      telefone: item.telefone?.trim() ? item.telefone.trim() : null,
      trialEndsAt: item.trial_ends_at,
      diasRestantes: Number(item.dias_restantes),
      diasAcessados: Number(item.dias_acessados || 0),
      totalAcoes: Number(item.total_acoes || 0),
      alunos: Number(item.alunos || 0),
      escolas: Number(item.escolas || 0),
      veiculos: Number(item.veiculos || 0),
      rotas: Number(item.rotas || 0),
      contratos: Number(item.contratos || 0),
      solicitacoes: Number(item.solicitacoes || 0),
      indicadoPor: item.indicado_por || null,
      valorMensal: Number(item.valor_mensal || 39.9),
      valorAnual: Number(item.valor_anual || 399),
      status: item.status || null
    }));

    return {
      trials,
      total: trials.length
    };
  }
};
