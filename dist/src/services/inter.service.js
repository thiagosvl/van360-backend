import axios from "axios";
import fs from "fs";
import https from "https";
import path from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { onlyDigits } from "../utils/utils.js";
const INTER_API_URL = env.INTER_API_URL;
const INTER_PIX_KEY = env.INTER_PIX_KEY;
const INTER_CLIENT_ID = env.INTER_CLIENT_ID;
const INTER_CLIENT_SECRET = env.INTER_CLIENT_SECRET;
const INTER_MOCK_MODE = env.INTER_MOCK_MODE === "true";
// Função para obter certificados (suporta Base64 via env ou arquivos)
function getCertificates() {
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
        }
        catch (error) {
            logger.error({ error, certPath, keyPath }, "Erro ao ler certificados do sistema de arquivos");
            throw new Error(`Erro ao ler certificados: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    throw new Error("Certificados não configurados. Configure INTER_CERT_BASE64 e INTER_KEY_BASE64 (Base64) ou INTER_CERT_PATH e INTER_KEY_PATH (caminhos de arquivo)");
}
// Criar httpsAgent de forma lazy (só quando necessário)
let httpsAgentInstance = null;
function getHttpsAgent() {
    if (!httpsAgentInstance) {
        try {
            const { cert, key } = getCertificates();
            httpsAgentInstance = new https.Agent({
                cert,
                key,
                rejectUnauthorized: true,
            });
        }
        catch (error) {
            logger.error({ error }, "Erro ao criar httpsAgent");
            throw error;
        }
    }
    return httpsAgentInstance;
}
function gerarTxid(cobrancaId) {
    const txid = cobrancaId.replace(/-/g, "");
    if (!/^[a-zA-Z0-9]{26,35}$/.test(txid)) {
        throw new Error(`ID de cobrança '${cobrancaId}' inválido para gerar txid.`);
    }
    return txid;
}
async function getValidInterToken(adminClient) {
    const { data, error } = await adminClient
        .from("configuracao_interna")
        .select("chave, valor")
        .in("chave", ["INTER_ACCESS_TOKEN", "INTER_TOKEN_EXPIRES_AT"]);
    if (error)
        throw new Error("Falha ao buscar config de token no DB.");
    const accessToken = data.find(d => d.chave === "INTER_ACCESS_TOKEN")?.valor;
    const expiresAt = parseInt(data.find(d => d.chave === "INTER_TOKEN_EXPIRES_AT")?.valor || "0");
    if (accessToken && expiresAt > Date.now() + 5 * 60 * 1000) {
        return accessToken;
    }
    const body = new URLSearchParams();
    body.append("client_id", INTER_CLIENT_ID);
    body.append("client_secret", INTER_CLIENT_SECRET);
    body.append("grant_type", "client_credentials");
    const scope = "cob.write cob.read cobv.write cobv.read lotecobv.write lotecobv.read pix.write pix.read webhook.write webhook.read payloadlocation.write payloadlocation.read boleto-cobranca.read boleto-cobranca.write extrato.read pagamento-pix.write pagamento-pix.read pagamento-boleto.read pagamento-boleto.write pagamento-darf.write pagamento-lote.write pagamento-lote.read webhook-banking.read webhook-banking.write";
    body.append("scope", scope);
    const tokenResponse = await axios.post(`${INTER_API_URL}/oauth/v2/token`, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        httpsAgent: getHttpsAgent(),
    });
    const tokenData = tokenResponse.data;
    const newAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    const newExpiresAt = Date.now() + expiresIn * 1000;
    await adminClient.from("configuracao_interna").upsert([
        { chave: "INTER_ACCESS_TOKEN", valor: newAccessToken },
        { chave: "INTER_TOKEN_EXPIRES_AT", valor: newExpiresAt.toString() },
    ], { onConflict: "chave" });
    return newAccessToken;
}
async function criarCobrancaPix(adminClient, params) {
    const txid = gerarTxid(params.cobrancaId);
    if (INTER_MOCK_MODE) {
        logger.warn("MOCK INTER ATIVO: Simulando PIX");
        return {
            qrCodePayload: "00020101021226...MOCK",
            location: "https://mock.inter/pix",
            interTransactionId: "MOCK-TXID-123",
        };
    }
    const token = await getValidInterToken(adminClient);
    const cobPayload = {
        calendario: { expiracao: 3600 },
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
        if (!locId || !pixCopiaECola)
            throw new Error("Resposta de PIX incompleta.");
        return {
            qrCodePayload: pixCopiaECola,
            location: data.loc?.location || data.location,
            interTransactionId: txid,
        };
    }
    catch (err) {
        logger.error({ err: err.response?.data || err.message, txid }, "Falha na criação de PIX");
        throw new Error("Falha ao criar cobrança PIX no Inter");
    }
}
async function consultarWebhookPix(adminClient) {
    const token = await getValidInterToken(adminClient);
    const url = `${INTER_API_URL}/pix/v2/webhook/${INTER_PIX_KEY}`;
    try {
        const { data } = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            httpsAgent: getHttpsAgent(),
        });
        return data;
    }
    catch (err) {
        if (err.response?.status === 404)
            return null;
        logger.error({ err: err.response?.data || err.message }, "Erro ao consultar webhook PIX");
        throw new Error("Falha ao consultar webhook PIX no Inter");
    }
}
async function registrarWebhookPix(adminClient, webhookUrl) {
    try {
        const existente = await consultarWebhookPix(adminClient);
        if (existente?.webhookUrl === webhookUrl) {
            await adminClient
                .from("configuracao_interna")
                .upsert([{ chave: "INTER_WEBHOOK_URL", valor: webhookUrl }], { onConflict: "chave" });
            logger.info({ webhookUrl }, "Webhook já registrado no Inter, sincronizado localmente.");
            return { status: "sincronizado", webhookUrl };
        }
        logger.info({ webhookUrl, existenteUrl: existente?.webhookUrl }, "Registrando/Atualizando webhook PIX no Inter.");
        const token = await getValidInterToken(adminClient);
        const url = `${INTER_API_URL}/pix/v2/webhook/${INTER_PIX_KEY}`;
        const payload = { webhookUrl, tipoWebhook: "PIX_RECEBIDO" };
        await axios.put(url, payload, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            httpsAgent: getHttpsAgent(),
        });
        await adminClient
            .from("configuracao_interna")
            .upsert([{ chave: "INTER_WEBHOOK_URL", valor: webhookUrl }], { onConflict: "chave" });
        logger.info({ webhookUrl }, "Webhook PIX registrado e sincronizado com sucesso.");
        return { status: "registrado", webhookUrl };
    }
    catch (err) {
        const errorDetails = err.response?.data || err.message;
        const errorContext = {
            err: errorDetails,
            axiosStatus: err.response?.status,
            webhookUrl,
        };
        let failurePoint = "Falha desconhecida no registro de webhook PIX";
        if (err.message.includes("consultar webhook")) {
            failurePoint = "Falha ao consultar webhook PIX existente no Inter";
        }
        else if (err.message.includes("token")) {
            failurePoint = "Falha ao obter token para registrar webhook PIX";
        }
        else if (err.response) {
            failurePoint = "Falha na API do Inter ao registrar webhook PIX";
        }
        else if (err.message.includes("configuracao_interna") || err.message.includes("DB")) {
            failurePoint = "Falha ao salvar webhook PIX no DB local";
        }
        logger.error(errorContext, failurePoint);
        throw new Error(`${failurePoint}. Detalhes: ${JSON.stringify(errorDetails)}`);
    }
}
export const interService = {
    criarCobrancaPix,
    registrarWebhookPix,
    consultarWebhookPix,
};
