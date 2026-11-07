import { adminInvoiceRepository } from "../../repositories/admin/admin-invoice.repository.js";
import { FINANCEIRO_CONFIG } from "../../config/constants.js";
import { ListAdminInvoicesQuery } from "../../schemas/admin-invoice.schema.js";
import {
  AdminInvoiceItemDTO,
  AdminInvoiceStatsResponseDTO,
  AdminInvoiceTipo,
  AdminInvoicesListResponseDTO,
} from "../../types/dtos/admin-invoice.dto.js";
import { CheckoutPaymentMethod, SubscriptionInvoiceStatus } from "../../types/enums.js";
import {
  getNowBR,
  getEndOfDayBR,
  addDays,
  parseLocalDate,
  toPersistenceString,
  calcularDataLiquidacaoCartao,
} from "../../utils/date.utils.js";

const DAYS_CARD_SETTLEMENT = FINANCEIRO_CONFIG.DIAS_RETENCAO_CARTAO;

export const adminInvoiceService = {
  async listInvoices(query: ListAdminInvoicesQuery): Promise<AdminInvoicesListResponseDTO> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const now = getNowBR();
    const todayIso = toPersistenceString(now);
    const next7DaysIso = toPersistenceString(addDays(now, 7));

    const result = await adminInvoiceRepository.listInvoices({
      from,
      to,
      search: query.search,
      status: query.status,
      user_status: query.user_status,
      metodo: query.metodo,
      tipo: query.tipo,
      vencimento_de: query.vencimento_de,
      vencimento_ate: query.vencimento_ate,
      todayIso,
      next7DaysIso,
    });

    const items: AdminInvoiceItemDTO[] = (result.data as Array<Record<string, unknown>>).map((row) => {
      const u = (row.usuarios || {}) as Record<string, unknown>;
      const p = (row.planos || null) as Record<string, unknown> | null;
      const sub = (row.assinaturas || null) as Record<string, unknown> | null;

      const subStatus = String(sub?.status || "").toLowerCase();
      const trialEndsAt = sub?.trial_ends_at ? String(sub.trial_ends_at) : null;
      const createdAt = row.created_at ? String(row.created_at) : null;

      let tipoFatura: AdminInvoiceTipo = "renovacao";
      if (
        subStatus === "trial" ||
        (trialEndsAt && createdAt && new Date(createdAt).getTime() <= new Date(trialEndsAt).getTime())
      ) {
        tipoFatura = "conversao_trial";
      }

      const statusFatura = (row.status as SubscriptionInvoiceStatus) || SubscriptionInvoiceStatus.PENDING;
      const metodoPagamento = String(row.metodo_pagamento || CheckoutPaymentMethod.PIX);
      const dataVencimento = String(row.data_vencimento || "");
      const dataPagamento = row.data_pagamento ? String(row.data_pagamento) : null;
      const isCartao = metodoPagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const baseRefDate = dataPagamento || dataVencimento || createdAt;
      const isElegivelLiquidacao =
        statusFatura === SubscriptionInvoiceStatus.PAID || statusFatura === SubscriptionInvoiceStatus.PENDING;

      let dataLiquidacaoPrevista: string | null = null;
      if (baseRefDate && isElegivelLiquidacao) {
        const dtLiq = isCartao
          ? calcularDataLiquidacaoCartao(baseRefDate, DAYS_CARD_SETTLEMENT)
          : parseLocalDate(baseRefDate);
        dataLiquidacaoPrevista = dtLiq.toISOString();
      }

      return {
        id: String(row.id),
        usuario_id: String(row.usuario_id),
        assinatura_id: String(row.assinatura_id),
        plano_id: row.plano_id ? String(row.plano_id) : null,
        status: statusFatura,
        valor: Number(row.valor || 0),
        metodo_pagamento: metodoPagamento,
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento,
        data_liquidacao_prevista: dataLiquidacaoPrevista,
        pix_copy_paste: row.pix_copy_paste ? String(row.pix_copy_paste) : null,
        gateway_txid: row.gateway_txid ? String(row.gateway_txid) : null,
        created_at: createdAt,
        updated_at: row.updated_at ? String(row.updated_at) : null,
        tipo_fatura: tipoFatura,
        usuario: {
          id: String(u.id || row.usuario_id),
          nome: String(u.nome || "Motorista"),
          apelido: u.apelido ? String(u.apelido) : null,
          logo_url: u.logo_url ? String(u.logo_url) : null,
          telefone: u.telefone ? String(u.telefone) : null,
          email: String(u.email || ""),
        },
        plano: p
          ? {
              id: String(p.id),
              nome: String(p.nome || ""),
              identificador: String(p.identificador || ""),
            }
          : null,
        assinatura: sub
          ? {
              id: String(sub.id || row.assinatura_id),
              status: String(sub.status || ""),
              data_vencimento: sub.data_vencimento ? String(sub.data_vencimento) : null,
              trial_ends_at: trialEndsAt,
            }
          : null,
      };
    });

    const filteredItems = query.tipo
      ? items.filter((item) => item.tipo_fatura === query.tipo)
      : items;

    const isAbertoQuery =
      !query.status || ["open", "hoje", "vencidas", "proximos7dias"].includes(query.status.toLowerCase());
    if (isAbertoQuery) {
      filteredItems.sort((a, b) => {
        const dateA = a.assinatura?.data_vencimento || a.assinatura?.trial_ends_at || a.data_vencimento || "";
        const dateB = b.assinatura?.data_vencimento || b.assinatura?.trial_ends_at || b.data_vencimento || "";
        return dateA.localeCompare(dateB);
      });
    }

    const total = query.tipo ? filteredItems.length : result.total;
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: filteredItems,
      total,
      page,
      limit,
      totalPages,
    };
  },

  async getInvoiceStats(): Promise<AdminInvoiceStatsResponseDTO> {
    const now = getNowBR();
    const todayIso = toPersistenceString(now);
    const next7DaysIso = toPersistenceString(addDays(now, 7));
    const currentYearMonth = todayIso.slice(0, 7);
    const endOfDayNow = getEndOfDayBR(now);

    const janelaInicioDate = addDays(now, -65);
    const janelaHistoricaIso = `${toPersistenceString(janelaInicioDate)}T00:00:00-03:00`;

    const [abertasRes, pagasRes] = await adminInvoiceRepository.getInvoiceStatsRaw(janelaHistoricaIso);

    const abertas = abertasRes.data || [];
    const pagas = pagasRes.data || [];

    let totalAbertoValor = 0;
    let totalAbertoQtd = 0;
    let totalVencidasValor = 0;
    let totalVencidasQtd = 0;
    let vencemHojeValor = 0;
    let vencemHojeQtd = 0;
    let proximos7DiasValor = 0;
    let proximos7DiasQtd = 0;

    for (const f of abertas) {
      const v = Number(f.valor || 0);
      totalAbertoValor += v;
      totalAbertoQtd += 1;

      const sub = (f as Record<string, unknown>).assinaturas as
        | { data_vencimento?: string | null; trial_ends_at?: string | null }
        | null;
      const refDateRaw = sub?.data_vencimento || sub?.trial_ends_at || f.data_vencimento;
      const vencimento = refDateRaw ? String(refDateRaw).slice(0, 10) : "";

      if (vencimento < todayIso) {
        totalVencidasValor += v;
        totalVencidasQtd += 1;
      } else if (vencimento === todayIso) {
        vencemHojeValor += v;
        vencemHojeQtd += 1;
      }

      if (vencimento >= todayIso && vencimento <= next7DaysIso) {
        proximos7DiasValor += v;
        proximos7DiasQtd += 1;
      }
    }

    let pagoMesValor = 0;
    let pagoMesQtd = 0;
    let aguardandoRepasseValor = 0;
    let aguardandoRepasseQtd = 0;

    for (const f of pagas) {
      const dataRef = f.data_pagamento || f.created_at;
      if (!dataRef) continue;

      const v = Number(f.valor || 0);
      const dtPagamento = parseLocalDate(dataRef);
      const isCartao = f.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const dtLiquidacao = isCartao
        ? calcularDataLiquidacaoCartao(dtPagamento, DAYS_CARD_SETTLEMENT)
        : dtPagamento;

      const ymLiquidacao = toPersistenceString(dtLiquidacao).slice(0, 7);

      if (ymLiquidacao === currentYearMonth && dtLiquidacao.getTime() <= endOfDayNow.getTime()) {
        pagoMesValor += v;
        pagoMesQtd += 1;
      } else if (isCartao && dtLiquidacao.getTime() > endOfDayNow.getTime()) {
        aguardandoRepasseValor += v;
        aguardandoRepasseQtd += 1;
      }
    }

    return {
      totalAbertoValor: Number(totalAbertoValor.toFixed(2)),
      totalAbertoQtd,
      totalVencidasValor: Number(totalVencidasValor.toFixed(2)),
      totalVencidasQtd,
      vencemHojeValor: Number(vencemHojeValor.toFixed(2)),
      vencemHojeQtd,
      proximos7DiasValor: Number(proximos7DiasValor.toFixed(2)),
      proximos7DiasQtd,
      pagoMesValor: Number(pagoMesValor.toFixed(2)),
      pagoMesQtd,
      aguardandoRepasseValor: Number(aguardandoRepasseValor.toFixed(2)),
      aguardandoRepasseQtd,
      diasRetencaoCartao: DAYS_CARD_SETTLEMENT,
    };
  },
};
