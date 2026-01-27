import { SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";
import https from "https";
import { Redis } from "ioredis";
import path from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisConfig } from "../config/redis.js";
import { CobrancaStatus, ConfigKey } from "../types/enums.js";
import { onlyDigits } from "../utils/string.utils.js";
import { getConfigNumber } from "./configuracao.service.js";

const redis = new Redis(redisConfig as any);

const INTER_API_URL = env.INTER_API_URL!;
const INTER_PIX_KEY = env.INTER_PIX_KEY!;
const INTER_CLIENT_ID = env.INTER_CLIENT_ID!;
const INTER_CLIENT_SECRET = env.INTER_CLIENT_SECRET!;
const INTER_MOCK_MODE = env.INTER_MOCK_MODE === "true";

// Função para obter certificados (suporta Base64 via env ou arquivos)
function getCertificates(): { cert: string | Buffer; key: string | Buffer } {
  // Prioridade 1: Variáveis de ambiente com Base64 (Vercel/Produção)
  const certBase64 = process.env.INTER_CERT_BASE64;
  const keyBase64 = process.env.INTER_KEY_BASE64;

  if (certBase64 && keyBase64) {
    logger.info("Usando certificados via variáveis de ambiente (Base64)");
    return {
      cert: Buffer.from(certBase64, "base64").toString("utf-8"),
      key: Buffer.from(keyBase64, "base64").toString("utf-8"),
    };
  }

  // Prioridade 2: Caminhos de arquivo (Desenvolvimento local)
  const certPath = env.INTER_CERT_PATH;
  const keyPath = env.INTER_KEY_PATH;

  if (certPath && keyPath) {
    try {
      const resolvedCertPath = path.resolve(certPath);
      const resolvedKeyPath = path.resolve(keyPath);
      
      logger.info({ certPath: resolvedCertPath, keyPath: resolvedKeyPath }, "Usando certificados via arquivos");
      
      return {
        cert: fs.readFileSync(resolvedCertPath),
        key: fs.readFileSync(resolvedKeyPath),
      };
    } catch (error) {
      logger.error({ error, certPath, keyPath }, "Erro ao ler certificados do sistema de arquivos");
      throw new Error(`Erro ao ler certificados: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(
    "Certificados não configurados. Configure INTER_CERT_BASE64 e INTER_KEY_BASE64 (Base64) ou INTER_CERT_PATH e INTER_KEY_PATH (caminhos de arquivo)"
  );
}

// Criar httpsAgent de forma lazy (só quando necessário)
let httpsAgentInstance: https.Agent | null = null;

function getHttpsAgent(): https.Agent {
  if (!httpsAgentInstance) {
    try {
      const { cert, key } = getCertificates();
      httpsAgentInstance = new https.Agent({
        cert,
        key,
        rejectUnauthorized: true,
      });
    } catch (error) {
      logger.error({ error }, "Erro ao criar httpsAgent");
      throw error;
    }
  }
  return httpsAgentInstance;
}

function gerarTxid(cobrancaId: string): string {
  const txid = cobrancaId.replace(/-/g, "");
  if (!/^[a-zA-Z0-9]{26,35}$/.test(txid)) {
    throw new Error(`ID de cobrança '${cobrancaId}' inválido para gerar txid.`);
  }
  return txid;
}

async function getValidInterToken(adminClient: SupabaseClient): Promise<string> {
  const cachedToken = await redis.get("inter:token");
  if (cachedToken) {
    return cachedToken;
  }

  // Fallback para o Banco de Dados (Legacy ou Cold Start)
  const { data, error } = await adminClient
    .from("configuracao_interna")
    .select("chave, valor")
    .in("chave", ["INTER_ACCESS_TOKEN", "INTER_TOKEN_EXPIRES_AT"]);

  if (!error && data) {
      const accessToken = data.find(d => d.chave === "INTER_ACCESS_TOKEN")?.valor;
      const expiresAt = parseInt(data.find(d => d.chave === "INTER_TOKEN_EXPIRES_AT")?.valor || "0");

      if (accessToken && expiresAt > Date.now() + 5 * 60 * 1000) {
        // Cachear no Redis para a próxima (TTL = tempo restante - margem)
        const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000) - 300; 
        if (ttlSeconds > 0) {
            await redis.set("inter:token", accessToken, "EX", ttlSeconds);
        }
        return accessToken;
      }
  }

  const body = new URLSearchParams();
  body.append("client_id", INTER_CLIENT_ID);
  body.append("client_secret", INTER_CLIENT_SECRET);
  body.append("grant_type", "client_credentials");

  const scope =
    "cob.write cob.read cobv.write cobv.read lotecobv.write lotecobv.read pix.write pix.read webhook.write webhook.read payloadlocation.write payloadlocation.read boleto-cobranca.read boleto-cobranca.write extrato.read pagamento-pix.write pagamento-pix.read pagamento-boleto.read pagamento-boleto.write pagamento-darf.write pagamento-lote.write pagamento-lote.read webhook-banking.read webhook-banking.write";
  body.append("scope", scope);

  const tokenResponse = await axios.post(`${INTER_API_URL}/oauth/v2/token`, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    httpsAgent: getHttpsAgent(),
  });

  const tokenData = tokenResponse.data;
  const newAccessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in;

  const newExpiresAt = Date.now() + expiresIn * 1000;

  // Persistir no Redis (TTL = expiração - 5 min de margem de segurança)
  const safeTtl = Math.max(expiresIn - 300, 60); 
  await redis.set("inter:token", newAccessToken, "EX", safeTtl);

  // Persistir no Banco (Backup)
  await adminClient.from("configuracao_interna").upsert(
    [
      { chave: "INTER_ACCESS_TOKEN", valor: newAccessToken },
      { chave: "INTER_TOKEN_EXPIRES_AT", valor: newExpiresAt.toString() },
    ],
    { onConflict: "chave" }
  );

  return newAccessToken;
}

async function criarCobrancaPix(
  adminClient: SupabaseClient,
  params: { cobrancaId: string; valor: number; cpf: string; nome: string }
): Promise<{ qrCodePayload: string; location: string; interTransactionId: string }> {
  const txid = gerarTxid(params.cobrancaId);

  if (INTER_MOCK_MODE) {
    logger.warn("MOCK INTER ATIVO: Simulando PIX");
    return {
      qrCodePayload: "00020101021226...MOCK",
      location: "https://mock.inter/pix",
      interTransactionId: `MOCK-TXID-${Date.now()}`,
    };
  }

  const token = await getValidInterToken(adminClient);
  const expirationSeconds = await getConfigNumber(ConfigKey.PIX_EXPIRACAO_SEGUNDOS, 3600);

  const cobPayload = {
    calendario: { expiracao: expirationSeconds },
    devedor: { cpf: onlyDigits(params.cpf), nome: params.nome },
    valor: { original: params.valor.toFixed(2) },
    chave: INTER_PIX_KEY,
    solicitacaoPagador: "Pagamento Assinatura Van360",
    infoAdicionais: [{ nome: "cobrancaId", valor: params.cobrancaId }],
  };

  try {
    const createUrl = `${INTER_API_URL}/pix/v2/cob/${txid}`;
    logger.info({ url: createUrl, txid }, "Criando cobrança PIX");

    const { data } = await axios.put(createUrl, cobPayload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      httpsAgent: getHttpsAgent(),
    });

    const locId = data?.loc?.id;
    const pixCopiaECola = data?.pixCopiaECola;
    if (!locId || !pixCopiaECola) throw new Error("Resposta de PIX incompleta.");

    return {
      qrCodePayload: pixCopiaECola,
      location: data.loc?.location || data.location,
      interTransactionId: txid,
    };
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message, txid }, "Falha na criação de PIX");
    throw new Error("Falha ao criar cobrança PIX no Inter");
  }

}

interface CriarCobrancaComVencimentoParams {
  cobrancaId: string;
  valor: number;
  cpf: string;
  nome: string;
  dataVencimento: string; // YYYY-MM-DD
  validadeAposVencimentoDias?: number;
}

async function criarCobrancaComVencimentoPix(
  adminClient: SupabaseClient,
  params: CriarCobrancaComVencimentoParams
): Promise<{ qrCodePayload: string; location: string; interTransactionId: string }> {
  const txid = gerarTxid(params.cobrancaId);

  if (INTER_MOCK_MODE) {
    logger.warn("MOCK INTER ATIVO: Simulando PIX (COBV)");
    return {
      qrCodePayload: "00020101021226...MOCK-COBV",
      location: "https://mock.inter/pix-cobv",
      interTransactionId: `MOCK-TXID-COBV-${Date.now()}`,
    };
  }

  const token = await getValidInterToken(adminClient);
  
  const validadePadrao = await getConfigNumber(ConfigKey.PIX_VALIDADE_APOS_VENCIMENTO, 30);

  const cobvPayload = {
    calendario: { 
        dataDeVencimento: params.dataVencimento,
        validadeAposVencimento: params.validadeAposVencimentoDias || validadePadrao
    },
    devedor: { cpf: onlyDigits(params.cpf), nome: params.nome },
    valor: { original: params.valor.toFixed(2) },
    chave: INTER_PIX_KEY,
    solicitacaoPagador: "Assinatura Van360 (Vencimento)",
    infoAdicionais: [{ nome: "cobrancaId", valor: params.cobrancaId }],
  };

  try {
    const createUrl = `${INTER_API_URL}/pix/v2/cobv/${txid}`;
    logger.info({ url: createUrl, txid, vencimento: params.dataVencimento }, "Criando cobrança PIX com Vencimento (cobv)");

    const { data } = await axios.put(createUrl, cobvPayload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      httpsAgent: getHttpsAgent(),
    });

    const locId = data?.loc?.id;
    const pixCopiaECola = data?.pixCopiaECola;
    if (!locId || !pixCopiaECola) throw new Error("Resposta de PIX (cobv) incompleta.");

    return {
      qrCodePayload: pixCopiaECola,
      location: data.loc?.location || data.location,
      interTransactionId: txid,
    };
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message, txid }, "Falha na criação de PIX com Vencimento");
    throw new Error("Falha ao criar cobrança PIX (cobv) no Inter");
  }
}

async function consultarWebhookPix(adminClient: SupabaseClient) {
  const token = await getValidInterToken(adminClient);
  const url = `${INTER_API_URL}/pix/v2/webhook/${INTER_PIX_KEY}`;

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent(),
    });
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    logger.error({ err: err.response?.data || err.message }, "Erro ao consultar webhook PIX");
    throw new Error("Falha ao consultar webhook PIX no Inter");
  }
}

async function registrarWebhookPix(adminClient: SupabaseClient, webhookUrl: string) {
  try {
    const existente = await consultarWebhookPix(adminClient);

    if (existente?.webhookUrl === webhookUrl) {
      await adminClient
        .from("configuracao_interna")
        .upsert(
          [{ chave: "INTER_WEBHOOK_URL", valor: webhookUrl }],
          { onConflict: "chave" }
        );
      logger.info({ webhookUrl }, "Webhook já registrado no Inter, sincronizado localmente.");
      return { status: "sincronizado", webhookUrl };
    }

    logger.info(
      { webhookUrl, existenteUrl: existente?.webhookUrl },
      "Registrando/Atualizando webhook PIX no Inter."
    );

    const token = await getValidInterToken(adminClient);
    const url = `${INTER_API_URL}/pix/v2/webhook/${INTER_PIX_KEY}`;
    const payload = { webhookUrl, tipoWebhook: "PIX_RECEBIDO" };

    await axios.put(url, payload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      httpsAgent: getHttpsAgent(),
    });

    await adminClient
      .from("configuracao_interna")
      .upsert(
        [{ chave: "INTER_WEBHOOK_URL", valor: webhookUrl }],
        { onConflict: "chave" }
      );

    logger.info({ webhookUrl }, "Webhook PIX registrado e sincronizado com sucesso.");
    return { status: "registrado", webhookUrl };
  } catch (err: any) {
    const errorDetails = err.response?.data || err.message;
    const errorContext = {
      err: errorDetails,
      axiosStatus: err.response?.status,
      webhookUrl,
    };

    let failurePoint = "Falha desconhecida no registro de webhook PIX";

    if (err.message.includes("consultar webhook")) {
      failurePoint = "Falha ao consultar webhook PIX existente no Inter";
    } else if (err.message.includes("token")) {
      failurePoint = "Falha ao obter token para registrar webhook PIX";
    } else if (err.response) {
      failurePoint = "Falha na API do Inter ao registrar webhook PIX";
    } else if (err.message.includes("configuracao_interna") || err.message.includes("DB")) {
      failurePoint = "Falha ao salvar webhook PIX no DB local";
    }

    logger.error(errorContext, failurePoint);

    throw new Error(`${failurePoint}. Detalhes: ${JSON.stringify(errorDetails)}`);
  }
}

async function consultarCallbacks(adminClient: SupabaseClient, dataInicio: string, dataFim: string) {
  const token = await getValidInterToken(adminClient);
  const url = `${INTER_API_URL}/pix/v2/webhook/callbacks`;

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent(),
      params: { dataInicio, dataFim },
    });
    return data;
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message }, "Erro ao consultar callbacks PIX");
    throw new Error("Falha ao consultar histórico de callbacks no Inter");
  }
}

async function listarPixRecebidos(adminClient: SupabaseClient, dataInicio: string, dataFim: string) {
  const token = await getValidInterToken(adminClient);
  const url = `${INTER_API_URL}/pix/v2/pix`;

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent(),
      params: { 
          inicio: dataInicio, 
          fim: dataFim,
          status: "CONCLUIDA" // Retorna apenas os pagos
      },
    });
    // A API retorna { parametros: {...}, cobrancas: [...] }
    return data.cobrancas || [];
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message }, "Erro ao listar PIX recebidos");
    throw new Error("Falha ao consultar extrato de PIX recebidos no Inter");
  }
}



async function consultarPix(adminClient: SupabaseClient, e2eId: string) {
  if (INTER_MOCK_MODE) {
    return {
      endToEndId: e2eId,
      valor: "0.01",
      recebedor: {
        nome: "MOCK USER",
        cpfCnpj: "00000000000"
      }
    };
  }

  const token = await getValidInterToken(adminClient);
  const url = `${INTER_API_URL}/pix/v2/pix/${e2eId}`;

  try {
    // Escopo necessário: pix.read
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent(),
    });
    return data;
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message, e2eId }, "Erro ao consultar PIX individual");
    throw new Error("Falha ao consultar detalhes do PIX no Inter");
  }
}

interface PagamentoPixParams {
  valor: number;
  chaveDestino: string;
  descricao?: string;
  xIdIdempotente: string;
}

/**
 * Realiza um PIX (Transferência) para uma chave específica via Banking API.
 * Usado para validação de chave (micro-transação).
 */
async function realizarPagamentoPix(
  adminClient: SupabaseClient,
  params: PagamentoPixParams
): Promise<{ endToEndId: string; status: string; nomeBeneficiario?: string; cpfCnpjBeneficiario?: string }> {
  if (INTER_MOCK_MODE) {
    logger.warn({ params }, "MOCK INTER ATIVO: Simulando Pagamento PIX");
    return {
      endToEndId: `MOCK-E2E-${Date.now()}`,
      status: CobrancaStatus.PAGO
    };
  }

  const token = await getValidInterToken(adminClient);
  
  // Endpoint de Banking para realizar pagamento PIX
  // NOTA: Certifique-se que o escopo 'pagamento-pix.write' está ativo
  const url = `${INTER_API_URL}/banking/v2/pix`;

  // LogContext para identificar se é Micro-pagamento de validação
  const isValidation = (params.valor === 0.01 && params.descricao?.includes("Validacao"));
  if (isValidation) {
      logger.info({ 
          step: "micro_transaction_start", 
          chaveDestino: params.chaveDestino,
          usuarioDesc: params.descricao
      }, "Iniciando micro-transação de validação de chave PIX");
  }

  const payload = {
    valor: params.valor,
    destinatario: {
      chave: params.chaveDestino,
      tipo: "CHAVE" // Inter infere o tipo, mas 'CHAVE' é o padrão para endereçamento
    },
    descricao: params.descricao || "Validacao Chave PIX"
  };

  try {
    const { data } = await axios.post(url, payload, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json",
        "x-id-idempotente": params.xIdIdempotente // Fundamental para segurança
      },
      httpsAgent: getHttpsAgent(),
    });

    logger.info({ 
      msg: "Resposta do Inter ao realizar PIX",
      status: data.status,
      endToEndId: data.endToEndId,
      fullData: data 
    }, "Inter API Response (PIX)");

    // Mapeamento de Status da API Banking v2 (Pagamento)
    // Se tipoRetorno for APROVACAO, consideramos que a chave é válida e o pagamento foi aceito.
    let statusFinal = data.status || "PROCESSAMENTO";
    if (data.tipoRetorno === "APROVACAO" || data.tipoRetorno === "PROCESSADO") {
        statusFinal = "PAGO"; // Tratamos como Pago para fins de validação da chave
    } else if (data.tipoRetorno === "AGENDADO") {
        statusFinal = "AGENDADO";
    }

    return {
      endToEndId: data.endToEndId || data.codigoSolicitacao, // CodigoSolicitacao é o ID do pagamento na v2
      status: statusFinal,
      nomeBeneficiario: data.beneficiario?.nome,
      cpfCnpjBeneficiario: data.beneficiario?.cpfCnpj
    };

  } catch (err: any) {
    logger.error({ 
      err: err.response?.data || err.message, 
      payload, 
      url 
    }, "Falha ao realizar pagamento PIX");
    throw new Error("Falha ao processar pagamento PIX no Inter");
  }
}


/**
 * Wrapper específico para Repasse a Motoristas (Banking API)
 */
async function realizarPixRepasse(
  adminClient: SupabaseClient,
  params: PagamentoPixParams
): Promise<{ endToEndId: string; status: string }> {
  logger.info({ params }, "Iniciando Repasse PIX para Motorista");
  // Reutiliza a função de pagamento bancário, mas com log contextual
  try {
      return await realizarPagamentoPix(adminClient, params);
  } catch (error) {
      throw error;
  }
}

/**
 * Cancela uma cobrança PIX imediata (cob) ou com vencimento (cobv).
 * Endpoint: PATCH /pix/v2/cob/{txid} ou /pix/v2/cobv/{txid}
 * Status: REMOVIDA_PELO_USUARIO_RECEBEDOR
 */
async function cancelarCobrancaPix(
  adminClient: SupabaseClient,
  txid: string,
  tipo: "cob" | "cobv" = "cobv"
): Promise<boolean> {
  const token = await getValidInterToken(adminClient);
  // Endpoint depende do tipo (imediatas ou com vencimento)
  const url = `${INTER_API_URL}/pix/v2/${tipo}/${txid}`;

  const payload = {
    status: "REMOVIDA_PELO_USUARIO_RECEBEDOR"
  };

  try {
    logger.info({ txid, tipo }, "Solicitando cancelamento de PIX no Inter");
    
    await axios.patch(url, payload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      httpsAgent: getHttpsAgent(),
    });

    logger.info({ txid }, "PIX Cancelado com sucesso no Inter");
    return true;

  } catch (err: any) {
    // Se der 404, já não existe, então "sucesso" no cancelamento reativo
    if (err.response?.status === 404) {
        logger.warn({ txid }, "Tentativa de cancelar PIX inexistente ou já removido (404)");
        return true; 
    }
    
    // Se já estiver concluída ou removida, pode dar 409 ou erro específico
    logger.error({ err: err.response?.data || err.message, txid }, "Erro ao cancelar PIX");
    return false;
  }
}

/**
 * Consulta o status de um pagamento PIX enviado (Banking API).
 * Endpoint: GET /banking/v2/pix/{codigoSolicitacao}
 */
async function consultarPagamentoPix(
  adminClient: SupabaseClient,
  codigoSolicitacao: string
) {
  const token = await getValidInterToken(adminClient);
  const url = `${INTER_API_URL}/banking/v2/pix/${codigoSolicitacao}`;

  try {
    logger.info({ codigoSolicitacao }, "Consultando status de pagamento PIX (Banking)...");
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: getHttpsAgent(),
    });
    return data;
  } catch (err: any) {
    logger.error({ err: err.response?.data || err.message, codigoSolicitacao }, "Erro ao consultar pagamento PIX");
    throw err;
  }
}

export const interService = {
  getValidInterToken,
  criarCobrancaPix,
  criarCobrancaComVencimentoPix,
  consultarWebhookPix,
  registrarWebhookPix,
  consultarCallbacks,
  listarPixRecebidos,
  consultarPix,
  realizarPagamentoPix,
  consultarPagamentoPix, // Exportando nova função
  realizarPixRepasse,
  cancelarCobrancaPix
};
