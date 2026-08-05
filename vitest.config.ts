import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      SUPABASE_URL: "https://dummy-test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key",
      SUPABASE_ANON_KEY: "dummy-anon-key",
      JWT_SECRET: "dummy-jwt-secret",
      PORT: "3000",
      NODE_ENV: "test",
    },
  },
});
