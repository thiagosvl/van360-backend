import "dotenv/config";
import { getEfipayConfig } from "../src/config/efipay.js";
import { env } from "../src/config/env.js";
import EfiPayModule from "gn-api-sdk-typescript";

const EfiPay = (EfiPayModule as any).default || EfiPayModule;

async function register() {
  const webhookUrl = process.argv[2];

  if (!webhookUrl) {
    console.error("❌ Erro: Forneça a URL do Ngrok como argumento.");
    console.error("Exemplo: npx tsx register-webhook.ts https://abcd-123.ngrok-free.app/api/webhooks/efi");
    process.exit(1);
  }

  if (!env.EFI_PIX_KEY) {
    console.error("❌ Erro: EFI_PIX_KEY faltando no arquivo .env.");
    process.exit(1);
  }

  const config = getEfipayConfig();
  const efipay = new EfiPay({
    sandbox: config.sandbox,
    client_id: config.client_id,
    client_secret: config.client_secret,
    certificate: config.certificate,
  });

  try {
    console.log(`📡 Registrando Webhook na Efí Pay...`);
    console.log(`URL ALVO: ${webhookUrl}`);
    console.log(`CHAVE PIX: ${env.EFI_PIX_KEY}`);

    const params = { chave: env.EFI_PIX_KEY };
    const body = { webhookUrl };

    // 1. Registrar Pix (Obrigatório vincular à chave na Efí)
    const pixRes = await efipay.pixConfigWebhook(params, body);
    console.log("✅ Webhook PIX configurado!", pixRes);

    console.log("\n🚀 INFO: O Webhook para Cartão/Boleto (v1) não exige registro global.");
    console.log("   A URL é enviada em cada transação através do campo 'notification_url'.");
    console.log("   Verifique o EfipayProvider.ts.");
  } catch (error: any) {
    console.error("❌ Erro ao configurar webhook da Efí:");
    console.error(error.message || error);
    if (error.response) {
      console.error(error.response.data);
    }
  }
}

register();
