import { SubscriptionInvoiceStatus, SubscriptionStatus } from "../enums.js";

export type AdminInvoiceTipo = "conversao_trial" | "renovacao";

export interface AdminInvoiceUserDTO {
  id: string;
  nome: string;
  apelido: string | null;
  logo_url: string | null;
  telefone: string | null;
  email: string;
}

export interface AdminInvoicePlanDTO {
  id: string;
  nome: string;
  identificador: string;
}

export interface AdminInvoiceSubscriptionDTO {
  id: string;
  status: SubscriptionStatus | string;
  data_vencimento: string | null;
  trial_ends_at: string | null;
}

export interface AdminInvoiceItemDTO {
  id: string;
  usuario_id: string;
  assinatura_id: string;
  plano_id: string | null;
  status: SubscriptionInvoiceStatus;
  valor: number;
  metodo_pagamento: string;
  data_vencimento: string;
  data_pagamento: string | null;
  pix_copy_paste: string | null;
  gateway_txid: string | null;
  created_at: string | null;
  updated_at: string | null;
  tipo_fatura: AdminInvoiceTipo;
  usuario: AdminInvoiceUserDTO;
  plano: AdminInvoicePlanDTO | null;
  assinatura: AdminInvoiceSubscriptionDTO | null;
}

export interface AdminInvoicesListResponseDTO {
  data: AdminInvoiceItemDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminInvoiceStatsResponseDTO {
  totalAbertoValor: number;
  totalAbertoQtd: number;
  totalVencidasValor: number;
  totalVencidasQtd: number;
  vencemHojeValor: number;
  vencemHojeQtd: number;
  proximos7DiasValor: number;
  proximos7DiasQtd: number;
  pagoMesValor: number;
  pagoMesQtd: number;
}
