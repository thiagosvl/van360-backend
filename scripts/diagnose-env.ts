import "dotenv/config";
import { env } from "../src/config/env.js";
import { supabaseAdmin } from "../src/config/supabase.js";

async function diagnose() {
    console.log("=== DIAGNÓSTICO ENV ===");
    console.log(`URL: ${env.SUPABASE_URL}`);
    console.log(`KEY (Length): ${env.SUPABASE_SERVICE_ROLE_KEY?.length}`);
    console.log(`KEY (Start): ${env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)}...`);
    
    console.log("\nTentando consulta simples ao Supabase...");
    try {
        const { data, error } = await supabaseAdmin.from("configuracao_interna").select("count").limit(1);
        if (error) {
            console.error("❌ Erro Supabase:", error.message);
        } else {
            console.log("✅ Supabase OK. Data:", data);
        }
    } catch (e: any) {
        console.error("❌ Exception Supabase:", e.message);
    }
}

diagnose();
