import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import type { Database } from "../types/database.types.js";
import { customSupabaseFetch } from "../utils/supabase-fetch.js";

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas");
}

export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
    global: {
      fetch: customSupabaseFetch,
    },
  }
);

