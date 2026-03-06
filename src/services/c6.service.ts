import axios from "axios";
import fs from "fs";
import https from "https";
import { Redis } from "ioredis";
import path from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisConfig } from "../config/redis.js";
import { supabaseAdmin } from "../config/supabase.js";
import { C6TransferStatus, ProviderTransferStatus } from "../types/enums.js";
import { toLocalDateString } from "../utils/date.utils.js";

const redis = new Redis(redisConfig as any);
const C6_SCHEDULE_URL = `${env.C6_API_URL}/v1/schedule_payments`;
const C6_STATUS_READ_DATA = "READ_DATA";
const C6_STATUS_DECODE_ERROR = "DECODE_ERROR";
const TXID_REGEX = /^[a-zA-Z0-9]{26,35}$/;

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

    const url = `${env.C6_API_URL}/v1/auth`;
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

  gerarTxid(cobrancaId: string): string {
    const txid = cobrancaId.replace(/-/g, "");
    if (!TXID_REGEX.test(txid)) {
      throw new Error(`ID de cobrança '${cobrancaId}' inválido para gerar txid.`);
    }
    return txid;
  },

  async criarCobrancaImediata(cobrancaId: string, valor: number, devedor?: { cpf: string; nome: string }) {
    const token = await this.getAccessToken();
    const txid = this.gerarTxid(cobrancaId);

    const payload: any = {
      calendario: { expiracao: 3600 },
      valor: { original: valor.toFixed(2) },
      chave: env.C6_PIX_KEY,
      solicitacaoPagador: "Cobranca Van360"
    };

    if (devedor) {
      const doc = devedor.cpf.replace(/\D/g, "");
      payload.devedor = {
        [doc.length === 14 ? "cnpj" : "cpf"]: doc,
        nome: devedor.nome
      };
    }

    try {
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
    } catch (error: any) {
      logger.error({ 
        msg: "C6: Erro ao criar cobrança imediata", 
        txid, 
        payload, 
        response: error.response?.data, 
        status: error.response?.status 
      });
      throw error;
    }
  },

  async consultarPix(txid: string) {
    const token = await this.getAccessToken();
    const { data } = await axios.get(`${env.C6_API_URL}/v2/pix/cob/${txid}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent()
    });
    return data;
  },

  /**
   * Consulta boletos em aberto no DDA vinculados ao CNPJ/CPF da conta.
   * Passo 8.1 da Homologação.
   */
  async consultarDDA() {
    const token = await this.getAccessToken();
    const url = `${C6_SCHEDULE_URL}query`;
    const headers = { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
    };
    
    logger.debug({ url, headers }, "C6: Iniciando consultarDDA");
    const { data } = await axios.get(url, { headers, httpsAgent: getHttpsAgent() });
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
      const today = new Date();
      // Garante a data correta no fuso de Brasília (onde o C6 opera) via utilitário padrão
      const todayStr = toLocalDateString(today);

      // 1. Enviar para consulta inicial (decode)
      const payload = {
        items: [{
          amount: params.valor, // Deve ser number conforme a doc
          transaction_date: params.transaction_date || todayStr,
          description: params.descricao || "Repasse Van360",
          content: params.chaveDestino, // Chave Pix ou Código de Barras
          beneficiary_name: "Motorista Beneficiario", // Sugerido pelo script de ref
          payer_name: "Van360 Empresa" // Sugerido pelo script de ref
        }]
      };

      const url = `${C6_SCHEDULE_URL}/decode`;
      logger.debug({ url, payload }, "C6: Enviando para decode");
      
      const response = await axios.post(url, payload, { 
        headers: {
          ...headers,
          "partner-software-name": "Van360",
          "partner-software-version": "1.0.0"
        }, 
        httpsAgent: agent 
      });

      const group = response.data;
      const groupId = group.group_id;

      // Importante: O C6 leva alguns segundos para "decodificar" os itens (verificar DICT/CIP).
      // Se submeter imediatamente, retorna 422 "itens em processo de decodificação".
      // Removemos o setTimeout de 15s bloqueante daqui! O submission passará a ocorrer 
      // de forma assíncrona pelo nosso Job de RepasseMonitor, caso o item já tenha sido decodificado (READ_DATA -> PROCESSING).
      logger.debug({ groupId }, "C6: Payload de decode recebido. Aguardando processamento assíncrono.");

      return {
        endToEndId: groupId,
        status: ProviderTransferStatus.WAITING_APPROVAL, // Nosso "Aguardando Banco (Decode / Submit)"
        msg: "Pagamento em decodificação. Será submetido pelo Worker."
      };
    } catch (error: any) {
      logger.error({ msg: "Erro realizarPagamentoPix C6", err: error.response?.data || error.message });
      throw error;
    }
  },

  async consultarPagamentoPix(groupId: string): Promise<any> {
    try {
      const data = await this.listarItensGrupo(groupId);
      const items = data.items || [];

      if (items.length === 0) {
        return {
          status: ProviderTransferStatus.WAITING_APPROVAL, // Em Sandbox o C6 às vezes retorna [] enquanto não processa
          rawStatus: "EMPTY_ITEMS",
          endToEndId: groupId
        };
      }

      const itemInfo = items[0];

      // Mapeamento de status do C6 para o padrão do sistema
      let statusFinal: ProviderTransferStatus = ProviderTransferStatus.WAITING_APPROVAL;
      if (itemInfo.status === C6TransferStatus.PROCESSED) {
        statusFinal = ProviderTransferStatus.PAGO;
      } else if (itemInfo.status === C6TransferStatus.PROCESSING || itemInfo.status === C6TransferStatus.SCHEDULED) {
        statusFinal = ProviderTransferStatus.PROCESSING_BANK;
      } else if (itemInfo.status === C6TransferStatus.ERROR || itemInfo.status === C6TransferStatus.DECODE_ERROR) {
        statusFinal = ProviderTransferStatus.FALHA;
      } else if (itemInfo.status === C6TransferStatus.SCHEDULING_CANCELLED || itemInfo.status === C6TransferStatus.CANCELED) {
        statusFinal = ProviderTransferStatus.CANCELADO;
      }

      return {
        ...itemInfo,
        status: statusFinal,
        rawStatus: itemInfo.status,
        endToEndId: groupId
      };
    } catch (error: any) {
      // Se for 422, é porque o C6 ainda está decodificando o lote.
      // Não tratamos como erro fatal, mas sim como "ainda processando no banco".
      if (error.response?.status === 422) {
        return {
          status: ProviderTransferStatus.WAITING_APPROVAL,
          rawStatus: "DECODING", // Status interno nosso para indicar que o C6 ainda está trabalhando
          endToEndId: groupId
        };
      }

      logger.error({ err: error.response?.data || error.message, id: groupId }, "Erro ao consultar pagamento C6 (Items)");
      throw error;
    }
  },

  /**
   * Obtém todos os itens de um grupo de pagamentos.
   * Passo 8.3 da Homologação.
   */
  async listarItensGrupo(groupId: string) {
    const token = await this.getAccessToken();
    const { data } = await axios.get(`${C6_SCHEDULE_URL}/${groupId}/items`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
      },
      httpsAgent: getHttpsAgent()
    });
    return data;
  },

  async removerItemAgendamento(groupId: string, itemId: string) {
    const token = await this.getAccessToken();
    await axios.delete(`${C6_SCHEDULE_URL}/${groupId}/items/${itemId}`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
      },
      httpsAgent: getHttpsAgent()
    });
    return true;
  },

  /**
   * Submete o grupo de agendamento para aprovação após a decodificação (READ_DATA).
   * Sem este passo, o PIX fica travado no C6 e não aparece no App para aprovação.
   */
  async submeterGrupo(groupId: string) {
    const token = await this.getAccessToken();
    const url = `${C6_SCHEDULE_URL}/submit`; // Correção: API Docs indicam /submit no root path
    logger.debug({ groupId, url }, "C6: Submetendo grupo para aprovação");
    
    const response = await axios.post(url, {
      group_id: groupId,
      uploader_name: "Van360 Repasse Automático"
    }, {
      headers: { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
      },
      httpsAgent: getHttpsAgent()
    });

    return true;
  },

  /**
   * Remove uma lista de itens de um grupo de agendamento.
   * Passo 8.4 da Homologação.
   */
  async removerItensAgendamento(groupId: string, itemIds: string[]) {
    const token = await this.getAccessToken();
    const payload = itemIds.map(id => ({ id }));
    await axios.delete(`${C6_SCHEDULE_URL}/${groupId}/items`, {
      data: payload,
      headers: { 
        Authorization: `Bearer ${token}`,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
      },
      httpsAgent: getHttpsAgent()
    });
    return true;
  },

  /**
   * Validação de Chave via Pré-processamento (Zero-Cost Disclosure)
   * Cria o lote, captura os dados do DICT e deleta o lote em seguida.
   */
  isSandbox(): boolean {
    return env.C6_API_URL.toLowerCase().includes("sandbox");
  },

  async validarChavePix(chave: string): Promise<{ nome: string; cpfCnpj: string }> {
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agent = getHttpsAgent();

    try {
      // 1. Cria lote temporário via /decode
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = toLocalDateString(tomorrow);

      const payload = {
        items: [{
          amount: 0.01,
          transaction_date: tomorrowStr, // Alguns bancos exigem agendamento p/ T+1
          description: "Validacao de Chave - Van360",
          content: chave,
          payer_name: "Van360 Administracao", // Identidade do pagador pode ajudar
          beneficiary_name: "VALIDACAO_PIX"   // Placeholder p/ incentivar o overwrite pelo banco
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

      // 2. Busca detalhes do item para obter Nome/CPF (DICT) - Polling para aguardar decodificação
      let item: any;
      const partnerHeaders = {
        ...headers,
        "partner-software-name": "Van360",
        "partner-software-version": "1.0.0"
      };

      for (let attempt = 1; attempt <= 15; attempt++) {
        try {
          const { data: itemsResponse } = await axios.get(`${C6_SCHEDULE_URL}/${groupId}/items`, { 
            headers: partnerHeaders, 
            httpsAgent: agent 
          });
          
          item = itemsResponse.items?.[0] || itemsResponse?.[0];
          
          // Debug: Se estiver travado no READ_DATA mas sem nome, logamos o item inteiro
          if (item?.status === "READ_DATA" && !item?.beneficiary_name) {
             logger.debug({ attempt, item: JSON.parse(JSON.stringify(item)) }, "C6: Item em READ_DATA mas sem beneficiary_name ainda.");
          }

          if (item?.status === C6_STATUS_READ_DATA) {
             logger.info({ attempt, status: item.status }, "C6: Chave validada como existente (READ_DATA)");
             break;
          }

          if (item?.status === C6_STATUS_DECODE_ERROR) {
             // Mapeamento de erro amigável para o usuário
             const c6Msg = item.error_message?.toLowerCase() || "";
             let msg = "Chave PIX não encontrada ou inexistente.";
             
             if (c6Msg.includes("limit") || c6Msg.includes("tente novamente")) {
                msg = "O Banco Central está processando muitas requisições. Tente novamente em alguns instantes.";
             }
             
             logger.error({ item }, `C6 Decode Error: ${msg}`);
             throw new Error(msg);
          }

          logger.info({ attempt, status: item?.status }, "C6: Aguardando decodificação (DICT)...");
        } catch (e: any) {
          if (e.response?.status !== 422) {
             logger.warn({ attempt, msg: e.message }, "C6: Erro inesperado no polling");
             if (attempt > 3) throw e;
          } else {
             logger.info({ attempt }, "C6: Item ainda em processamento (422)...");
             if (attempt >= 15) {
                logger.warn("C6: Timeout limite atingido esperando o DICT validar os dados desta chave PIX.");
                break; // Sai do for para lançar erro elegantemente embaixo.
             }
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      let nome = item?.beneficiary_name && item.beneficiary_name !== "VALIDACAO_PIX" ? item.beneficiary_name : null;
      const cpfCnpj = item?.receiver_tax_id || item?.content;

      // Se chegamos no status READ_DATA mas o banco omitiu o nome, consideramos válida (visto que o C6 mascara dados sensíveis)
      if (!nome && item?.status === C6_STATUS_READ_DATA) {
         nome = "TITULAR VALIDADO (C6)";
      }

      // 3. Deleta o lote imediatamente (formato array conforme YAML)
      if (item?.id) {
        await axios.delete(`${C6_SCHEDULE_URL}/${groupId}/items`, { 
          headers: partnerHeaders, 
          httpsAgent: agent,
          data: [{ id: item.id }]
        }).catch((err) => logger.warn({ err: err.message }, "C6: Erro ao limpar agendamento temporário"));
      }

      if (!nome) {
         if (item?.status === 'READ_DATA') {
           logger.warn("C6: DICT retornou Ok, mas nome omitido pelo banco. Aprovando genericamente.");
           nome = "TITULAR VALIDADO (C6)";
           return { nome, cpfCnpj: item?.receiver_tax_id || item?.content || chave };
         }
         throw new Error("Timeout: O banco demorou muito para validar sua chave. Tente novamente mais tarde.");
      }

      return { nome, cpfCnpj };
    } catch (error: any) {
      let errorMsg = error.message;

      // Captura erro de formato do C6 (400 Bad Request)
      if (error.response?.status === 400) {
        errorMsg = "Formato de chave Pix inválido para o tipo selecionado.";
      }

      // SANDBOX BYPASS: Se estivermos em sandbox, permitimos o erro de validação (DICT é limitado)
      if (this.isSandbox()) {
        logger.warn({ 
          chave, 
          originalError: error.response?.data || error.message,
          status: error.response?.status
        }, "C6 Sandbox: Bypassing validation failure for testing purposes.");

        return { 
          nome: "TITULAR VALIDADO (SANDBOX)", 
          cpfCnpj: chave.length <= 14 ? chave : "DOCUMENTO VALIDADO" 
        };
      }

      // FALLBACK: Se der 403 (Falta de permissão de Agendamento/Decode), tentamos criar uma cobrança de 0.01
      if (error.response?.status === 403) {
        logger.info({ chave }, "C6: Tentando validação via cobrança (fallback 403)");
        try {
          const testTxid = this.gerarTxid("VAL" + crypto.randomUUID().replace(/-/g, "").substring(0, 25));
          const testPayload = {
            calendario: { expiracao: 3600 },
            valor: { original: "0.01" },
            chave,
            solicitacaoPagador: "Validacao de Conta Van360"
          };
          
          const token = await this.getAccessToken();
          const agent = getHttpsAgent();
          const headers = { Authorization: `Bearer ${token}` };

          await axios.put(`${env.C6_API_URL}/v2/pix/cob/${testTxid}`, testPayload, {
            headers,
            httpsAgent: agent
          });

          // Se chegou aqui, a chave é válida! Vamos cancelar logo em seguida.
          axios.patch(`${env.C6_API_URL}/v2/pix/cob/${testTxid}`, 
            { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
            { headers, httpsAgent: agent }
          ).catch(() => {});

          return { 
            nome: "TITULAR VALIDADO (C6)", 
            cpfCnpj: chave.length <= 14 ? chave : "DOCUMENTO VALIDADO" 
          };
        } catch (fallbackError: any) {
          logger.error({ msg: "Erro no fallback de validação C6", err: fallbackError.response?.data || fallbackError.message });
          throw new Error("O banco rejeitou esta chave PIX ou ela não pertence a esta conta.");
        }
      }

      logger.error({ 
        msg: "Erro validarChavePix C6", 
        err: error.response?.data || error.message,
        status: error.response?.status,
        errorMsg
      });
      throw new Error(errorMsg);
    }
  },

  async syncWebhookDb(url: string) {
    await supabaseAdmin
      .from("configuracao_interna")
      .upsert([{ chave: "C6_WEBHOOK_URL", valor: url }], { onConflict: "chave" });
  },

  async criarCobrancaVencimento(cobrancaId: string, valor: number, vencimento: string, devedor: any) {
    const token = await this.getAccessToken();
    const txid = this.gerarTxid(cobrancaId);
    const doc = devedor.cpf.replace(/\D/g, "");

    const payload = {
      calendario: { dataDeVencimento: vencimento, validadeAposVencimento: 30 },
      devedor: { 
        [doc.length === 14 ? "cnpj" : "cpf"]: doc, 
        nome: devedor.nome 
      },
      valor: { original: valor.toFixed(2) },
      chave: env.C6_PIX_KEY,
      solicitacaoPagador: "Cobranca Van360 (Vencimento)"
    };

    try {
      const { data } = await axios.put(`${env.C6_API_URL}/v2/pix/cobv/${txid}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getHttpsAgent()
      });

      return {
        txid: data.txid, pixCopiaECola: data.pixCopiaECola,
        location: data.loc?.location, interTransactionId: data.txid
      };
    } catch (error: any) {
      logger.error({ 
        msg: "C6: Erro ao criar cobrança com vencimento", 
        txid, 
        payload, 
        response: error.response?.data, 
        status: error.response?.status 
      });
      throw error;
    }
  }
};
