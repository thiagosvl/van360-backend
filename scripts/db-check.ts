import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";

async function check() {
    const { data: user } = await supabaseAdmin.from("usuarios").select("id, nome").ilike("nome", "%Thiago Barros%").single();
    if (!user) {
        console.log("Usuário não encontrado.");
        return;
    }
    console.log("Usuário:", user.nome, "(", user.id, ")");

    const { data: cobrancas } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("id, status, data_vencimento, qr_code_payload, inter_txid, created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

    console.log("JSON_START");
    console.log(JSON.stringify(cobrancas, null, 2));
    console.log("JSON_END");
}

check().catch(console.error);
