import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas");
}
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false,
    },
});
