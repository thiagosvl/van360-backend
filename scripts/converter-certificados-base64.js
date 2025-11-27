// Script para converter certificados para Base64
// Uso: node scripts/converter-certificados-base64.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certPath = path.join(__dirname, "..", "certificates", "inter-client.crt");
const keyPath = path.join(__dirname, "..", "certificates", "inter-private.key");

try {
  console.log("🔐 Convertendo certificados para Base64...\n");

  // Ler e converter certificado
  const cert = fs.readFileSync(certPath);
  const certBase64 = cert.toString("base64");

  // Ler e converter chave privada
  const key = fs.readFileSync(keyPath);
  const keyBase64 = key.toString("base64");

  console.log("✅ Certificado convertido!");
  console.log("\n📋 INTER_CERT_BASE64:");
  console.log(certBase64);
  console.log("\n📋 INTER_KEY_BASE64:");
  console.log(keyBase64);
  console.log("\n💡 Copie os valores acima e adicione nas variáveis de ambiente da Vercel");
  console.log("   Settings → Environment Variables → Add New");
} catch (error) {
  console.error("❌ Erro ao converter certificados:", error.message);
  console.error("\nCertifique-se de que os arquivos existem em:");
  console.error(`  - ${certPath}`);
  console.error(`  - ${keyPath}`);
  process.exit(1);
}

