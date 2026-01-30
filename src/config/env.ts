export const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "http://localhost:8080",

  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || "http://localhost:8081",
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY!,
  CRON_SECRET: process.env.CRON_SECRET || "super_secret_cron_key",
  BACKEND_URL: process.env.BACKEND_URL || "http://host.docker.internal:3000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:8080",
  FRONT_URL_RESPONSAVEL: process.env.FRONT_URL_RESPONSAVEL || "http://localhost:8080",
  
  // Observability

  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1",
  SENTRY_PROFILES_SAMPLE_RATE: process.env.SENTRY_PROFILES_SAMPLE_RATE || "0.1",
  LOGTAIL_TOKEN: process.env.LOGTAIL_TOKEN,
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  INTER_API_URL: process.env.INTER_API_URL!,
  INTER_CLIENT_ID: process.env.INTER_CLIENT_ID!,
  INTER_CLIENT_SECRET: process.env.INTER_CLIENT_SECRET!,
  INTER_CERT_PATH: process.env.INTER_CERT_PATH!,
  INTER_KEY_PATH: process.env.INTER_KEY_PATH!,
  INTER_PIX_KEY: process.env.INTER_PIX_KEY!, 

  // C6 Bank
  C6_CLIENT_ID: process.env.C6_CLIENT_ID!,
  C6_CLIENT_SECRET: process.env.C6_CLIENT_SECRET!,
  C6_PIX_KEY: process.env.C6_PIX_KEY!,
  C6_API_URL: process.env.C6_API_URL || "https://baas-api-sandbox.c6bank.info",
  C6_CERT_PATH: process.env.C6_CERT_PATH!,
  C6_KEY_PATH: process.env.C6_KEY_PATH!,
  C6_CERT_BASE64: process.env.C6_CERT_BASE64,
  C6_KEY_BASE64: process.env.C6_KEY_BASE64,
};