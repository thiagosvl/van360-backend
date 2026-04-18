import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { env } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Utilitário para gerenciar o certificado da Efí Pay.
 * Se o certificado estiver em Base64 nas variáveis de ambiente, 
 * ele é salvo temporariamente em arquivo para a SDK.
 */
export function getEfipayConfig() {
  const certBase64 = env.EFI_CERT_BASE64;
  const isSandbox = env.EFI_SANDBOX;

  let certPath = "";

  if (certBase64) {
    // Para a SDK da Efí, o certificado deve ser um arquivo físico .p12
    const certBuffer = Buffer.from(certBase64, "base64");
    
    // Criamos uma pasta temp para o certificado se não existir
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    certPath = path.join(tempDir, "efipay-cert.p12");
    fs.writeFileSync(certPath, certBuffer);
  }

  return {
    sandbox: isSandbox,
    client_id: env.EFI_CLIENT_ID,
    client_secret: env.EFI_CLIENT_SECRET,
    certificate: certPath,
  };
}
