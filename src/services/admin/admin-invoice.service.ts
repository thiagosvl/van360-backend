import { adminInvoiceRepository } from "../../repositories/admin/admin-invoice.repository.js";
import { ListAdminInvoicesQuery } from "../../schemas/admin-invoice.schema.js";
import {
  AdminInvoiceItemDTO,
  AdminInvoiceStatsResponseDTO,
  AdminInvoiceTipo,
  AdminInvoicesListResponseDTO,
} from "../../types/dtos/admin-invoice.dto.js";
import { SubscriptionInvoiceStatus } from "../../types/enums.js";
import { getNowBR, addDays } from "../../utils/date.utils.js";

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export const adminInvoiceService = {
  async listInvoices(query: ListAdminInvoicesQuery): Promise<AdminInvoicesListResponseDTO> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const now = getNowBR();
    const todayIso = formatDateYMD(now);
    const next7DaysIso = formatDateYMD(addDays(now, 7));

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

      return {
        id: String(row.id),
        usuario_id: String(row.usuario_id),
        assinatura_id: String(row.assinatura_id),
        plano_id: row.plano_id ? String(row.plano_id) : null,
        status: (row.status as SubscriptionInvoiceStatus) || SubscriptionInvoiceStatus.PENDING,
        valor: Number(row.valor || 0),
        metodo_pagamento: String(row.metodo_pagamento || "pix"),
        data_vencimento: String(row.data_vencimento || ""),
        data_pagamento: row.data_pagamento ? String(row.data_pagamento) : null,
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
    const todayIso = formatDateYMD(now);
    const next7DaysIso = formatDateYMD(addDays(now, 7));

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const primeiroDiaMesIso = `${y}-${m}-01T00:00:00-03:00`;

    const [abertasRes, pagasMesRes] = await adminInvoiceRepository.getInvoiceStatsRaw(primeiroDiaMesIso);

    const abertas = abertasRes.data || [];
    const pagas = pagasMesRes.data || [];

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

      const vencimento = String(f.data_vencimento || "").slice(0, 10);
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

    for (const f of pagas) {
      pagoMesValor += Number(f.valor || 0);
      pagoMesQtd += 1;
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
    };
  },
};
