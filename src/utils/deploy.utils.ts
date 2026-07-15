import { logger } from "../config/logger.js";

export const triggerDeployWebhook = async (): Promise<void> => {
  const webhookUrl = process.env.PORTAL_DEPLOY_WEBHOOK || process.env.BLOG_DEPLOY_WEBHOOK;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, { method: "POST" });
    } catch (err) {
      logger.error({ err }, "[DeployUtils] Falha ao disparar webhook de deploy.");
    }
  }
};
