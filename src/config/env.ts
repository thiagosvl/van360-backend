export const env = {
  PORT: process.env.PORT || 3000,
  INTER_API_URL: process.env.INTER_API_URL!,
  INTER_CLIENT_ID: process.env.INTER_CLIENT_ID!,
  INTER_CLIENT_SECRET: process.env.INTER_CLIENT_SECRET!,
  INTER_CERT_PATH: process.env.INTER_CERT_PATH!,
  INTER_KEY_PATH: process.env.INTER_KEY_PATH!,
  INTER_PIX_KEY: process.env.INTER_PIX_KEY!, 
  INTER_MOCK_MODE: process.env.INTER_MOCK_MODE || "false",
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};