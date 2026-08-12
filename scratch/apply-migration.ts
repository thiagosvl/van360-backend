import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import fs from "fs";
import path from "path";

async function runMigration() {
    console.log("🚀 Aplicando migração no Supabase...");
    const sqlPath = path.resolve(process.cwd(), "supabase/migrations/20260810_create_fila_notificacoes.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    const { error: insertError } = await supabaseAdmin.from("fila_notificacoes").select("id").limit(1);
    if (insertError) {
        console.error("❌ Erro ao consultar tabela fila_notificacoes:", insertError.message);
        console.log("\n======================================================");
        console.log("📜 POR FAVOR, EXECUTE O SQL ABAIXO NO PAINEL DO SUPABASE (SQL EDITOR):");
        console.log("======================================================");
        console.log(sql);
        console.log("======================================================\n");
    } else {
        console.log("✅ Tabela `fila_notificacoes` já existe e está funcional!");
    }
}

runMigration();
