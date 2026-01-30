import axios from "axios";
import fs from "fs";
import https from "https";
import { Redis } from "ioredis";
import path from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisConfig } from "../config/redis.js";
import { supabaseAdmin } from "../config/supabase.js";

const redis = new Redis(redisConfig as any);
const C6_SCHEDULE_URL = `${env.C6_API_URL}/v1/schedule_payments`;

function getC6Certificates() {
  if (env.C6_CERT_BASE64 && env.C6_KEY_BASE64) {
    return {
      cert: Buffer.from(env.C6_CERT_BASE64, "base64").toString("utf-8"),
      key: Buffer.from(env.C6_KEY_BASE64, "base64").toString("utf-8"),
    };
  }

  if (env.C6_CERT_PATH && env.C6_KEY_PATH) {
    try {
      return {
        cert: fs.readFileSync(path.resolve(env.C6_CERT_PATH)),
        key: fs.readFileSync(path.resolve(env.C6_KEY_PATH)),
      };
    } catch (err) {
      logger.error({ err }, "C6: Erro ao ler certificados");
    }
  }

  throw new Error("C6: Certificados não configurados.");
}

function getHttpsAgent() {
  const { cert, key } = getC6Certificates();
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

export const c6Service = {
  async getAccessToken(): Promise<string> {
    const cached = await redis.get("c6:token");
    if (cached) return cached;

    const url = `${env.C6_API_URL}/v1/auth/`;
    const body = new URLSearchParams();
    body.append("client_id", env.C6_CLIENT_ID);
    body.append("client_secret", env.C6_CLIENT_SECRET);
    body.append("grant_type", "client_credentials");
    
    try {
      const { data } = await axios.post(url, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        httpsAgent: getHttpsAgent()
      });

      const token = data.access_token;
      const expiresIn = data.expires_in || 3600;

      await redis.set("c6:token", token, "EX", expiresIn - 300);
      return token;
    } catch (error: any) {
      logger.error({ 
        msg: "Erro ao autenticar C6", 
        data: error.response?.data, 
        err: error.message 
      });
      throw error;
    }
  },

  async criarCobrancaImediata(txid: string, valor: number, devedor?: { cpf: string; nome: string }) {
    const token = await this.getAccessToken();
    const payload: any = {
      calendario: { expiracao: 3600 },
      valor: { original: valor.toFixed(2) },
      chave: env.C6_PIX_KEY,
      solicitacaoPagador: "Cobranca Van360"
    };

    if (devedor) {
      payload.devedor = {
        cpf: devedor.cpf.replace(/\D/g, ""),
        nome: devedor.nome
      };
    }

    const { data } = await axios.put(`${env.C6_API_URL}/v2/pix/cob/${txid}`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent()
    });

    return {
      txid: data.txid,
      pixCopiaECola: data.pixCopiaECola,
      location: data.loc?.location,
      interTransactionId: data.txid
    };
  },

  async consultarPix(txid: string) {
    const token = await this.getAccessToken();
    const { data } = await axios.get(`${env.C6_API_URL}/v2/pix/cob/${txid}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent()
    });
    return data;
  },

  async cancelarCobranca(txid: string) {
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agent = getHttpsAgent();

    try {
      await axios.patch(`${env.C6_API_URL}/v2/pix/cob/${txid}`, 
        { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
        { headers, httpsAgent: agent }
      );
      return true;
    } catch (error: any) {
      try {
        await axios.patch(`${env.C6_API_URL}/v2/pix/cobv/${txid}`, 
          { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
          { headers, httpsAgent: agent }
        );
        return true;
      } catch (err) {
        return false;
      }
    }
  },

  async listarPixRecebidos(inicio: string, fim: string) {
    const token = await this.getAccessToken();
    const { data } = await axios.get(`${env.C6_API_URL}/v2/pix`, {
      params: { inicio, fim },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent()
    });
    
    // Normalização para o formato esperado pelo Job/Provider
    const pixList = data.pix || [];
    return pixList.map((pix: any) => ({
      txid: pix.txid,
      pix: [pix]
    }));
  },

  async configurarWebhook(webhookUrl: string) {
    const chave = env.C6_PIX_KEY;
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agent = getHttpsAgent();

    try {
      const { data: existente } = await axios.get(`${env.C6_API_URL}/v2/pix/webhook/${chave}`, {
        headers, httpsAgent: agent
      }).catch(() => ({ data: null }));

      if (existente?.webhookUrl === webhookUrl) {
        await this.syncWebhookDb(webhookUrl);
        return { status: "sincronizado", webhookUrl };
      }

      await axios.put(`${env.C6_API_URL}/v2/pix/webhook/${chave}`, { webhookUrl }, {
        headers, httpsAgent: agent
      });

      await this.syncWebhookDb(webhookUrl);
      return { status: "registrado", webhookUrl };
    } catch (error: any) {
      logger.error({ msg: "Erro configurar Webhook C6", err: error.message });
      throw error;
    }
  },

  async realizarPagamentoPix(params: { valor: number; chaveDestino: string; descricao?: string; xIdIdempotente?: string; transaction_date?: string }): Promise<any> {
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, "x-id-idempotente": params.xIdIdempotente };
    const agent = getHttpsAgent();

    try {
      // 1. Enviar para consulta inicial (decode)
      const payload = {
        items: [{
          amount: params.valor, // Deve ser number conforme a doc
          transaction_date: params.transaction_date || new Date().toISOString().split("T")[0],
          description: params.descricao || "Repasse Van360",
          content: params.chaveDestino // Chave Pix ou Código de Barras
        }]
      };

      const { data: group } = await axios.post(`${C6_SCHEDULE_URL}/decode`, payload, { 
        headers: {
          ...headers,
          "partner-software-name": "Van360",
          "partner-software-version": "1.0.0"
        }, 
        httpsAgent: agent 
      });
      const groupId = group.group_id;

      // 2. Submeter para aprovação (conforme imagem 5 da doc)
      await axios.post(`${C6_SCHEDULE_URL}/submit`, {
        group_id: groupId,
        uploader_name: "Van360 System"
      }, { headers, httpsAgent: agent });

      return {
        endToEndId: groupId,
        status: "WAITING_APPROVAL",
        msg: "Pagamento agendado. Requer aprovação manual no Web Banking C6."
      };
    } catch (error: any) {
      logger.error({ msg: "Erro realizarPagamentoPix C6", err: error.response?.data || error.message });
      throw error;
    }
  },

  async consultarPagamentoPix(id: string): Promise<any> {
    const token = await this.getAccessToken();
    const agent = getHttpsAgent();

    try {
      const { data } = await axios.get(`${C6_SCHEDULE_URL}/${id}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "partner-software-name": "Van360",
          "partner-software-version": "1.0.0"
        },
        httpsAgent: agent
      });

      // Mapeamento de status do C6 para o padrão do sistema
      let statusFinal = "WAITING_APPROVAL";
      if (data.status === "EXECUTED" || data.status === "SETTLED") {
        statusFinal = "PAGO";
      } else if (data.status === "REJECTED" || data.status === "CANCELED" || data.status === "DECODE_ERROR") {
        statusFinal = "FALHOU";
      }

      return {
        ...data,
        status: statusFinal,
        rawStatus: data.status,
        endToEndId: data.group_id || id
      };
    } catch (error: any) {
      logger.error({ err: error.response?.data || error.message, id }, "Erro ao consultar pagamento C6");
      throw error;
    }
  },

  /**
   * Validação de Chave via Pré-processamento (Zero-Cost Disclosure)
   * Cria o lote, captura os dados do DICT e deleta o lote em seguida.
   */
  async validarChavePix(chave: string): Promise<{ nome: string; cpfCnpj: string }> {
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agent = getHttpsAgent();

    try {
      // 1. Cria lote temporário via /decode
      const payload = {
        items: [{
          amount: 0.01,
          transaction_date: new Date().toISOString().split("T")[0],
          description: "Validacao de Chave",
          content: chave
        }]
      };

      const { data: group } = await axios.post(`${C6_SCHEDULE_URL}/decode`, payload, { 
        headers: {
          ...headers,
          "partner-software-name": "Van360",
          "partner-software-version": "1.0.0"
        }, 
        httpsAgent: agent 
      });
      const groupId = group.group_id;

      // 2. Busca detalhes do item para obter Nome/CPF (DICT)
      const { data: itemsResponse } = await axios.get(`${C6_SCHEDULE_URL}/${groupId}/items`, { headers, httpsAgent: agent });
      
      const item = itemsResponse.items?.[0] || itemsResponse?.[0];
      
      if (item?.status === "DECODE_ERROR") {
        throw new Error(`Erro C6 Decode: ${item.error_message || "Dados inválidos"}`);
      }

      const nome = item?.beneficiary_name || item?.receiver_name;
      const cpfCnpj = item?.receiver_tax_id || item?.content;

      // 3. Deleta o lote imediatamente
      await axios.delete(`${C6_SCHEDULE_URL}/${groupId}/items`, { 
        headers, 
        httpsAgent: agent,
        data: { id: item?.id || groupId }
      }).catch(() => {});

      if (!nome) throw new Error("Não foi possível validar os dados desta chave PIX no C6.");

      return { nome, cpfCnpj };
    } catch (error: any) {
      logger.error({ msg: "Erro validarChavePix C6", err: error.response?.data || error.message });
      throw error;
    }
  },

  async syncWebhookDb(url: string) {
    await supabaseAdmin
      .from("configuracao_interna")
      .upsert([{ chave: "C6_WEBHOOK_URL", valor: url }], { onConflict: "chave" });
  },

  async criarCobrancaVencimento(txid: string, valor: number, vencimento: string, devedor: any) {
    const token = await this.getAccessToken();
    const payload = {
      calendario: { dataDeVencimento: vencimento, validadeAposVencimento: 30 },
      devedor: { cpf: devedor.cpf.replace(/\D/g, ""), nome: devedor.nome },
      valor: { original: valor.toFixed(2) },
      chave: env.C6_PIX_KEY,
      solicitacaoPagador: "Cobranca Van360 (Vencimento)"
    };

    const { data } = await axios.put(`${env.C6_API_URL}/v2/pix/cobv/${txid}`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent()
    });

    return {
      txid: data.txid, pixCopiaECola: data.pixCopiaECola,
      location: data.loc?.location, interTransactionId: data.txid
    };
  }
};
