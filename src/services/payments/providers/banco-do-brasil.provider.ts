function parseBBDate(dateStr?: string): Date {
  if (!dateStr || !dateStr.trim()) return new Date();
  const cleaned = dateStr.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
  }

  const slashMatch = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (slashMatch) {
    const [, day, month, year, h = "0", m = "0", s = "0"] = slashMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(s));
  }

  const dotMatch = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const fallback = new Date(cleaned);
  return !isNaN(fallback.getTime()) ? fallback : new Date();
}

import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../errors/AppError.js";
import {
  PaymentProvider,
  NormalizedPaymentEventType,
  ContractMultaTipo,
  BancoDoBrasilCanalLiquidacaoEnum,
  CobrancaTipoPagamento
} from "../../../types/enums.js";
import {
  PaymentProviderAdapter,
  CreateChargeRequest,
  ChargeResponse,
  NormalizedPaymentEvent
} from "../../../types/payment.js";
import {
  bancoDoBrasilConfigSchema,
  bancoDoBrasilWebhookBaixaSchema,
  BancoDoBrasilConfig
} from "../../../schemas/banco-do-brasil.schema.js";

interface BBTokenCache {
  token: string;
  expiresAt: number;
}

interface BBRegistroResponse {
  numero: string;
  linhaDigitavel?: string;
  codigoBarraNumerico?: string;
  qrCode?: {
    emv?: string;
  };
  urlImagemBoleto?: string;
  erros?: Array<{ codigo: string; mensagem: string; providencia?: string }>;
}

export class BancoDoBrasilProvider implements PaymentProviderAdapter {
  readonly providerName = PaymentProvider.BANCO_DO_BRASIL;

  private tokenCache: Map<string, BBTokenCache> = new Map();

  private getOAuthUrl(): string {
    const environment = (env.BB_ENV || "").toLowerCase();
    if (environment === "production") {
      return "https://oauth.bb.com.br/oauth/token";
    }
    if (environment === "homologacao" || environment === "hm") {
      return "https://oauth.hm.bb.com.br/oauth/token";
    }
    return "https://oauth.sandbox.bb.com.br/oauth/token";
  }

  private getApiBaseUrl(): string {
    const environment = (env.BB_ENV || "").toLowerCase();
    if (environment === "production") {
      return "https://api.bb.com.br/cobrancas/v2";
    }
    if (environment === "homologacao" || environment === "hm") {
      return "https://api.hm.bb.com.br/cobrancas/v2";
    }
    return "https://api.sandbox.bb.com.br/cobrancas/v2";
  }

  private formatDateToBB(isoOrDateStr: string): string {
    const raw = isoOrDateStr.includes("T") ? isoOrDateStr.split("T")[0] : isoOrDateStr;
    const parts = raw.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day.padStart(2, "0")}.${month.padStart(2, "0")}.${year}`;
    }
    return raw;
  }

  private async getAccessToken(config?: Partial<BancoDoBrasilConfig>): Promise<string> {
    const clientId = config?.clientId || env.BB_CLIENT_ID;
    const clientSecret = config?.clientSecret || env.BB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError("Credenciais do Banco do Brasil não configuradas (Client ID / Client Secret).", 500);
    }

    const cacheKey = clientId;
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now + 30000) {
      return cached.token;
    }

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const tokenUrl = this.getOAuthUrl();

    const bodyParams = new URLSearchParams();
    bodyParams.append("grant_type", "client_credentials");
    bodyParams.append("scope", "cobrancas.boletos-requisicao cobrancas.boletos-info");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, errorText }, "[BancoDoBrasilProvider] Erro ao autenticar OAuth BB");
      throw new AppError(`Falha na autenticação do Banco do Brasil (HTTP ${response.status}).`, 502);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    const expiresAt = now + (data.expires_in || 600) * 1000;

    this.tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt
    });

    return data.access_token;
  }

  async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
    const rawConfig = request.splits?.[0]?.description ? JSON.parse(request.splits[0].description) : {};
    const parsedConfig = bancoDoBrasilConfigSchema.safeParse(rawConfig);

    if (!parsedConfig.success) {
      throw new AppError("Configuração do Banco do Brasil inválida ou incompleta para a emissão.", 400);
    }

    const config = parsedConfig.data;
    const token = await this.getAccessToken(config);
    const developerKey = config.developerKey || env.BB_DEVELOPER_KEY;

    if (!developerKey) {
      throw new AppError("Developer Application Key do Banco do Brasil não configurada.", 500);
    }

    const cleanTaxId = request.customer.document.replace(/\D/g, "");
    const isCpf = cleanTaxId.length === 11;
    const isCnpj = cleanTaxId.length === 14;

    if (!isCpf && !isCnpj) {
      throw new AppError("Documento do pagador inválido para registro no Banco do Brasil.", 400);
    }

    const cleanCep = Number((request.billingAddress?.zipcode || "").replace(/\D/g, "")) || 0;
    const street = request.billingAddress?.street || "Não informado";
    const number = request.billingAddress?.number || "S/N";
    const fullAddress = `${street}, ${number}`.slice(0, 60);

    const now = new Date();
    const dataEmissao = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
    const dataVencimento = this.formatDateToBB(request.dueDate);

    const sequencial = (Date.now() % 10000000000).toString().padStart(10, "0");
    const numeroTituloCliente = `000${String(config.convenio).padStart(7, "0")}${sequencial}`;

    const payload: Record<string, unknown> = {
      numeroConvenio: Number(config.convenio),
      numeroCarteira: config.carteira,
      numeroVariacaoCarteira: config.variacaoCarteira,
      codigoModalidade: 1,
      dataEmissao,
      dataVencimento,
      valorOriginal: request.amount,
      numeroTituloCliente,
      numeroTituloBeneficiario: request.externalId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 15),
      indicadorPix: "S",
      pagador: {
        tipoInscricao: isCpf ? 1 : 2,
        numeroInscricao: cleanTaxId,
        nome: request.customer.name.slice(0, 100),
        endereco: fullAddress,
        cep: cleanCep,
        cidade: (request.billingAddress?.city || "São Paulo").slice(0, 30),
        bairro: (request.billingAddress?.neighborhood || "Centro").slice(0, 30),
        uf: (request.billingAddress?.state || "SP").slice(0, 2).toUpperCase(),
        telefone: request.customer.phone?.replace(/\D/g, "") || undefined,
        email: request.customer.email || undefined
      }
    };

    if (request.fines && request.fines.value > 0) {
      const isPercent = request.fines.tipo !== ContractMultaTipo.FIXO;
      payload.multa = {
        tipo: isPercent ? 2 : 1,
        data: dataVencimento,
        ...(isPercent ? { porcentagem: request.fines.value } : { valor: request.fines.value })
      };
    }

    if (request.interests && request.interests.value > 0) {
      const isPercent = request.interests.tipo !== ContractMultaTipo.FIXO;
      payload.jurosMora = {
        tipo: isPercent ? 2 : 1,
        ...(isPercent ? { porcentagem: request.interests.value } : { valor: request.interests.value })
      };
    }

    const apiUrl = `${this.getApiBaseUrl()}/boletos?gw-dev-app-key=${encodeURIComponent(developerKey)}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseData = (await response.json()) as BBRegistroResponse;

    if (!response.ok) {
      const firstError = responseData.erros?.[0];
      const message = firstError?.mensagem || `Erro ${response.status} ao registrar boleto no Banco do Brasil`;
      logger.error({ status: response.status, responseData }, "[BancoDoBrasilProvider] Erro ao registrar boleto");
      return {
        success: false,
        error: message,
        isUserFacing: true
      };
    }

    return {
      success: true,
      providerId: responseData.numero,
      boletoNossoNumero: responseData.numero,
      boletoLinhaDigitavel: responseData.linhaDigitavel,
      boletoCodigoBarras: responseData.codigoBarraNumerico,
      pixCopyPaste: responseData.qrCode?.emv,
      invoiceUrl: responseData.urlImagemBoleto
    };
  }

  private extractConvenio(providerId: string, options?: Record<string, unknown>): number | null {
    if (options?.numeroConvenio && Number(options.numeroConvenio) > 0) {
      return Number(options.numeroConvenio);
    }
    if (options?.convenio && Number(options.convenio) > 0) {
      return Number(options.convenio);
    }
    const digitsOnly = providerId.replace(/\D/g, "");
    if (digitsOnly.length === 20 && digitsOnly.startsWith("000")) {
      const candidate = Number(digitsOnly.slice(3, 10));
      if (candidate > 0) return candidate;
    }
    return null;
  }

  async cancelCharge(providerId: string, options?: Record<string, unknown>): Promise<boolean> {
    if (!providerId) return true;

    try {
      const token = await this.getAccessToken();
      const developerKey = env.BB_DEVELOPER_KEY;
      const convenio = this.extractConvenio(providerId, options);

      if (!convenio) {
        logger.error({ providerId }, "[BancoDoBrasilProvider] Não foi possível determinar o número do convênio para baixa de boleto");
        return false;
      }

      const apiUrl = `${this.getApiBaseUrl()}/boletos/${encodeURIComponent(providerId)}/baixar?gw-dev-app-key=${encodeURIComponent(developerKey)}`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ numeroConvenio: convenio })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.warn({ status: response.status, errorData, providerId }, "[BancoDoBrasilProvider] Resposta de falha na baixa de boleto");
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, providerId }, "[BancoDoBrasilProvider] Falha ao solicitar baixa de boleto no BB");
      return false;
    }
  }

  async getChargeStatus(providerId: string, options?: Record<string, unknown>): Promise<string> {
    if (!providerId) return "UNKNOWN";

    try {
      const token = await this.getAccessToken();
      const developerKey = env.BB_DEVELOPER_KEY;
      const convenio = this.extractConvenio(providerId, options);

      const queryParams = new URLSearchParams({
        "gw-dev-app-key": developerKey
      });

      if (convenio) {
        queryParams.set("numeroConvenio", String(convenio));
      }

      const apiUrl = `${this.getApiBaseUrl()}/boletos/${encodeURIComponent(providerId)}?${queryParams.toString()}`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) return "UNKNOWN";

      const data = (await response.json()) as {
        codigoEstadoTituloCobranca?: number;
      };

      const codigo = data.codigoEstadoTituloCobranca;
      if (codigo === 1) return "NORMAL";
      if (codigo === 6 || codigo === 11 || codigo === 12 || codigo === 16) return "PAID";
      if (codigo === 7 || codigo === 10) return "CANCELED";
      if (codigo === 80) return "PROCESSING";

      return codigo !== undefined ? `ESTADO_${codigo}` : "UNKNOWN";
    } catch (error) {
      logger.error({ error, providerId }, "[BancoDoBrasilProvider] Erro ao consultar status do boleto no BB");
      return "UNKNOWN";
    }
  }

  normalizeWebhook(rawBody: Record<string, unknown>): NormalizedPaymentEvent | null {
    const parsed = bancoDoBrasilWebhookBaixaSchema.safeParse(rawBody);
    if (!parsed.success) {
      logger.warn({ errors: parsed.error.issues, rawBody }, "[BancoDoBrasilProvider] Payload de webhook BB inválido");
      return null;
    }

    const data = parsed.data;
    const paidAt = parseBBDate(data.dataHoraLiquidacao || data.dataLiquidacao);

    const canal = Number(data.canalLiquidacao);
    const tipo = Number(data.codigoTipoLiquidacao);
    const canalPag = Number(data.codigoCanalPagamento);
    const nat = Number(data.naturezaRecebimento);

    const isPix =
      canal === BancoDoBrasilCanalLiquidacaoEnum.PIX ||
      canal === BancoDoBrasilCanalLiquidacaoEnum.PIX_MOVIMENTO ||
      tipo === BancoDoBrasilCanalLiquidacaoEnum.PIX ||
      nat === BancoDoBrasilCanalLiquidacaoEnum.PIX_MOVIMENTO ||
      canalPag === BancoDoBrasilCanalLiquidacaoEnum.PIX_MOVIMENTO ||
      (canalPag > 100 && canalPag % 100 === BancoDoBrasilCanalLiquidacaoEnum.PIX_MOVIMENTO);

    return {
      type: NormalizedPaymentEventType.PAYMENT_RECEIVED,
      internalId: data.id,
      providerRef: data.id,
      amount: data.valorPagoSacado,
      paidAt,
      paymentMethod: isPix ? CobrancaTipoPagamento.PIX : CobrancaTipoPagamento.BOLETO,
      raw: rawBody
    };
  }
}
