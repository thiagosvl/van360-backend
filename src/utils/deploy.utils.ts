import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export const triggerDeployWebhook = async (): Promise<void> => {
  const webhookUrl = env.PORTAL_DEPLOY_WEBHOOK || env.BLOG_DEPLOY_WEBHOOK || process.env.PORTAL_DEPLOY_WEBHOOK || process.env.BLOG_DEPLOY_WEBHOOK;

  if (!webhookUrl) {
    logger.warn("[DeployUtils] Webhook de deploy não configurado (PORTAL_DEPLOY_WEBHOOK / BLOG_DEPLOY_WEBHOOK ausente).");
    return;
  }

  try {
    const response = await fetch(webhookUrl, { method: "POST" });
    if (!response.ok) {
      logger.error({ status: response.status, statusText: response.statusText }, "[DeployUtils] Resposta não-ok do webhook de deploy.");
      return;
    }
    logger.info("[DeployUtils] Webhook de deploy disparado com sucesso.");
  } catch (err) {
    logger.error({ err }, "[DeployUtils] Falha ao disparar webhook de deploy.");
  }
};
