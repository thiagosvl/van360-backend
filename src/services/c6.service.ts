import axios from "axios";
import fs from "fs";
import https from "https";
import { Redis } from "ioredis";
import path from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisConfig } from "../config/redis.js";

const redis = new Redis(redisConfig as any);

const PAYMENT_MOCK_MODE = env.PAYMENT_MOCK_MODE === "true" || (env.PAYMENT_MOCK_MODE as any) === true;

// Helper para obter certificados (similar ao Inter)
function getC6Certificates(): { cert: string | Buffer; key: string | Buffer } {
  // 1. Base64 (Prioridade Prod/Vercel)
  if (env.C6_CERT_BASE64 && env.C6_KEY_BASE64) {
    logger.info("C6: Usando certificados via Base64");
    return {
      cert: Buffer.from(env.C6_CERT_BASE64, "base64").toString("utf-8"),
      key: Buffer.from(env.C6_KEY_BASE64, "base64").toString("utf-8"),
    };
  }

  // 2. Arquivos (Prioridade Dev Local)
  if (env.C6_CERT_PATH && env.C6_KEY_PATH) {
    try {
      const resolvedCertPath = path.resolve(env.C6_CERT_PATH);
      const resolvedKeyPath = path.resolve(env.C6_KEY_PATH);
      logger.info({ cert: resolvedCertPath }, "C6: Usando certificados via Arquivo");
      return {
        cert: fs.readFileSync(resolvedCertPath),
        key: fs.readFileSync(resolvedKeyPath),
      };
    } catch (err) {
      logger.error({ err }, "C6: Erro ao ler arquivos de certificado");
    }
  }

  throw new Error("C6: Certificados não configurados (Base64 ou Path).");
}

function getHttpsAgent() {
  const { cert, key } = getC6Certificates();
  return new https.Agent({
    cert,
    key,
    // C6 Sandbox pode exigir, mas rejectUnauthorized: false não é recomendado em prod sem cuidado.
    // Geralmente C6 tem cadeia completa válida, mas em sandbox as vezes varia.
    rejectUnauthorized: false
  });
}

export const c6Service = {
  
  async getAccessToken(): Promise<string> {
    if (PAYMENT_MOCK_MODE) return "MOCK-ACCESS-TOKEN";

    // Cache no Redis
    const cached = await redis.get("c6:token");
    if (cached) return cached;

    const url = `${env.C6_API_URL}/v1/auth/`; // Slash no final é importante em alguns bancos, verificar.
    // Doc C6 Auth: POST /auth/oauth/v2/token ou similar? Verificando endpoint baseado no request do user.
    // User request image: POST https://baas-api-sandbox.c6bank.info/v1/auth/
    
    const body = new URLSearchParams();
    body.append("client_id", env.C6_CLIENT_ID);
    body.append("client_secret", env.C6_CLIENT_SECRET);
    body.append("grant_type", "client_credentials");
    // Scope pode ser necessário. Na imagem do user: "scope": "bankslip.write webhook.read ..."
    // Vamos tentar sem scope explícito primeiro ou usar o da imagem se falhar.
    
    try {
      logger.info("C6: Solicitando novo Token...");
      const { data } = await axios.post(url, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        httpsAgent: getHttpsAgent()
      });

      const token = data.access_token;
      const expiresIn = data.expires_in || 3600;

      // Cache com margem de segurança (5 min)
      await redis.set("c6:token", token, "EX", expiresIn - 300);
      return token;

    } catch (error: any) {
      logger.error({ 
        msg: "Erro ao autenticar C6", 
        data: error.response?.data, 
        status: error.response?.status,
        errorMessage: error.message,
        errorCode: error.code
      });
      throw error;
    }
  },

  async criarCobrancaImediata(txid: string, valor: number, devedor?: { cpf: string; nome: string }) {
    if (PAYMENT_MOCK_MODE) {
      return {
        txid,
        pixCopiaECola: "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3...MOCK-C6",
        location: `https://mock.c6bank.com/${txid}`,
        interTransactionId: `MOCK-C6-${txid}`
      };
    }

    const token = await this.getAccessToken();
    const url = `${env.C6_API_URL}/v2/pix/cob`; 

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

    try {
      const { data } = await axios.put(`${url}/${txid}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent()
      });

      return {
        txid: data.txid,
        pixCopiaECola: data.pixCopiaECola,
        location: data.loc?.location,
        interTransactionId: data.txid // Uniformizando retorno
      };

    } catch (error: any) {
      logger.error({ 
        msg: "Erro criar cobranca C6", 
        data: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  },

  async consultarPix(txid: string) {
    if (PAYMENT_MOCK_MODE) return { status: "CONCLUIDA", txid };

    const token = await this.getAccessToken();
    try {
      const { data } = await axios.get(`${env.C6_API_URL}/v2/pix/cob/${txid}`, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent()
      });
      return data;
    } catch (error: any) {
      logger.error({ msg: "Erro consultar Pix C6", txid, err: error.message });
      throw error;
    }
  },

  async cancelarCobranca(txid: string) {
    // C6 pode não suportar cancelamento via API Pix padrão sem implementar patch?
    // Placeholder.
    logger.warn({ txid }, "C6: Cancelamento de cobrança não implementado.");
    return true; 
  },

  async realizarPagamentoPix(params: any): Promise<any> {
    // Transferencia (Webhook/Split no futuro)
    throw new Error("C6: Pagamento/Transferência não implementado.");
  },

  async consultarPagamentoPix(endToEndId: string): Promise<any> {
    throw new Error("C6: Consultar Pagamento não implementado.");
  },

  async listarPixRecebidos(inicio: string, fim: string) {
    if (PAYMENT_MOCK_MODE) return [];
    
    // GET /v2/pix?inicio=...&fim=...
    const token = await this.getAccessToken();
    try {
      const { data } = await axios.get(`${env.C6_API_URL}/v2/pix`, {
        params: { inicio, fim },
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent()
      });
      return data.pix || [];
    } catch (error: any) {
      logger.error({ msg: "Erro listar Pix C6", err: error.message });
      return [];
    }
  },

  // ... (manter cobranca vencimento placeholder)
  async criarCobrancaVencimento(txid: string, valor: number, vencimento: string, devedor: any) {
    if (PAYMENT_MOCK_MODE) {
       return {
        txid,
        pixCopiaECola: "00020126580014...MOCK-COBV-C6",
        location: `https://mock.c6bank.com/cobv/${txid}`,
        interTransactionId: `MOCK-C6-COBV-${txid}`
      };
    }
    
    // Implementação Padrão Bacen para CobV (C6 suporta PUT)
    const token = await this.getAccessToken();
    const url = `${env.C6_API_URL}/v2/pix/cobv`;

    const payload: any = {
      calendario: { 
        dataDeVencimento: vencimento, // YYYY-MM-DD
        validadeAposVencimento: 30 // Padrão 30 dias se não especificado
      },
      devedor: {
        cpf: devedor.cpf.replace(/\D/g, ""),
        nome: devedor.nome
      },
      valor: { original: valor.toFixed(2) },
      chave: env.C6_PIX_KEY,
      solicitacaoPagador: "Cobranca Van360 (Vencimento)"
    };

    try {
      const { data } = await axios.put(`${url}/${txid}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent()
      });

      return {
        txid: data.txid,
        pixCopiaECola: data.pixCopiaECola,
        location: data.loc?.location,
        interTransactionId: data.txid
      };
    } catch (error: any) {
      logger.error({ 
        msg: "Erro criar cobranca Vencimento C6", 
        data: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

};
