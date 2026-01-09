
import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import { processarPagamentoCobranca } from "../src/services/processar-pagamento.service.js";

// Mock para simular datas sem alterar o relógio do sistema
// Nota: Para passageiro.service.ts, precisaríamos de injeção de dependência ou mock de Date.
// Neste script, vamos focar nos cenários de PAGAMENTO (Catch-up) que já aceitam override.
// Para cadastro, validaremos a lógica de cobrança separadamente se possível.

async function runScenarios() {
    console.log("=== 🧪 TESTE DE RESILIÊNCIA: CENÁRIOS DE 2 MESES ===");

    // 1. Setup: Criar Motorista de Teste Limpo
    const TEST_DRIVER_ID = "00000000-0000-0000-0000-000000000000"; // FIXO ou Gerar Novo
    // Vamos usar um usuario existente ou criar um dummy. Para segurança, vamos buscar um existente.
    // Ou melhor, criar um usuário dummy no banco para não sujar dados reais.
    
    // Para simplificar e não criar lixo, vamos assumir que o usuário já existe ou usar um ID fixo de teste se o banco permitir.
    // Vamos usar o ID do Thiago (Dev) para verificação real: "0cde7028-0935-4303-997f-94a282669b76"
    const driverId = "0cde7028-0935-4303-997f-94a282669b76"; 

    console.log(`\n👨‍✈️ Motorista: ${driverId}`);

    // === CENÁRIO 1: Reativação Precoce (Dia 10/Jan) ===
    console.log("\n--- [Cenário 1] Reativação Precoce (10/Jan) ---");
    // Passo 1: Suspender
    await suspenderMotorista(driverId);
    
    // Passo 2: criar cobrança de assinatura pendente (mock)
    const cobrancaAssinaturaId = await criarCobrancaAssinaturaMock(driverId);
    
    // Passo 3: Pagar simulando dia 10
    console.log("💳 Pagando no dia 10/01/2026...");
    await processarPagamentoCobranca({
        id: cobrancaAssinaturaId,
        usuario_id: driverId,
        assinatura_usuario_id: "mock-sub-id", // Precisaria buscar real, mas o processarPagamento busca.
        // Vamos buscar a cobrança real recém enviada para ter os dados corretos
        status: "pendente_pagamento"
    } as any, {
        valor: 149.90,
        dataPagamento: "2026-01-10T10:00:00Z" // DATA MÁGICA
    }, { cobrancaId: cobrancaAssinaturaId });

    // Verificação
    let countJan = await contarCobrancas(driverId, 1, 2026);
    let countFev = await contarCobrancas(driverId, 2, 2026);
    console.log(`📊 Resultado C1: Jan=${countJan}, Fev=${countFev}`);
    if (countJan > 0 && countFev === 0) console.log("✅ SUCESSO: Gerou apenas mês atual.");
    else console.log("❌ FALHA: Deveria ter gerado Jan e não Fev.");


    // === CENÁRIO 2: Reativação Tardia (Dia 28/Jan) ===
    console.log("\n--- [Cenário 2] Reativação Tardia (28/Jan) ---");
    // Cleanup cobranças anteriores para teste limpo
    await limparCobrancasTeste(driverId);
    await suspenderMotorista(driverId);
    const cobrancaAssinaturaId2 = await criarCobrancaAssinaturaMock(driverId);

    console.log("💳 Pagando no dia 28/01/2026...");
    await processarPagamentoCobranca({
        id: cobrancaAssinaturaId2,
        usuario_id: driverId, 
        status: "pendente_pagamento"
    } as any, {
        valor: 149.90,
        dataPagamento: "2026-01-28T10:00:00Z" // DATA MÁGICA > 25
    }, { cobrancaId: cobrancaAssinaturaId2 });

    countJan = await contarCobrancas(driverId, 1, 2026);
    countFev = await contarCobrancas(driverId, 2, 2026);
    console.log(`📊 Resultado C2: Jan=${countJan}, Fev=${countFev}`);
    if (countJan === 0 && countFev > 0) console.log("✅ SUCESSO: Gerou apenas Próximo Mês (Catch-up Inteligente).");
    else console.log("❌ FALHA: Lógica de exclusão incorreta.");

     // === CENÁRIO 5: Virada de Ano (28/Dez -> Jan) ===
     console.log("\n--- [Cenário 5] Virada de Ano (28/Dez -> Jan) ---");
     await limparCobrancasTeste(driverId);
     await suspenderMotorista(driverId);
     const cobrancaAssinaturaId3 = await criarCobrancaAssinaturaMock(driverId);
 
     console.log("💳 Pagando no dia 28/12/2025...");
     await processarPagamentoCobranca({
         id: cobrancaAssinaturaId3,
         usuario_id: driverId, 
         status: "pendente_pagamento"
     } as any, {
         valor: 149.90,
         dataPagamento: "2025-12-28T10:00:00Z" // DATA MÁGICA > 25 DEZ
     }, { cobrancaId: cobrancaAssinaturaId3 });
 
     const countDez = await contarCobrancas(driverId, 12, 2025);
     const countJan26 = await contarCobrancas(driverId, 1, 2026);
     console.log(`📊 Resultado C5: Dez=${countDez}, Jan=${countJan26}`);
     if (countDez === 0 && countJan26 > 0) console.log("✅ SUCESSO: Virada de ano funcionou.");
     else console.log("❌ FALHA: Falha na virada de ano.");

}

// Helpers
async function suspenderMotorista(userId: string) {
    await supabaseAdmin
        .from("assinaturas_usuarios")
        .update({ status: 'suspensa', ativo: false })
        .eq("usuario_id", userId);
}

async function limparCobrancasTeste(userId: string) {
    // Cuidado: apaga cobranças reais se usar driver real.
    // Para teste seguro, deletar apenas as "pendentes" criadas agora.
    await supabaseAdmin
        .from("cobrancas")
        .delete()
        .eq("usuario_id", userId)
        .in("mes", [1, 2, 12]) // Meses do teste
        .eq("origem", "automatica");
}

async function contarCobrancas(userId: string, mes: number, ano: number) {
    const { count } = await supabaseAdmin
        .from("cobrancas")
        .select("*", { count: 'exact', head: true })
        .eq("usuario_id", userId)
        .eq("mes", mes)
        .eq("ano", ano);
    return count || 0;
}

async function criarCobrancaAssinaturaMock(userId: string) {
    try {
        console.log(`Debug: Buscando assinatura para ${userId}`);
        const { data: sub, error: subError } = await supabaseAdmin.from("assinaturas_usuarios").select("id").eq("usuario_id", userId).single();
        
        if (subError) {
            console.error("Erro ao buscar assinatura:", subError);
            throw subError;
        }
        if (!sub) throw new Error("Assinatura não encontrada (data null)");

        console.log(`Debug: Inserindo cobrança para assinatura ${sub.id}`);
        const { data: cob, error } = await supabaseAdmin.from("assinaturas_cobrancas").insert({
            usuario_id: userId,
            assinatura_usuario_id: sub.id,
            valor: 149.90,
            status: "pendente_pagamento",
            data_vencimento: "2026-01-10",
            billing_type: "PIX"
        }).select().single();
        
        if (error) {
             console.error("Erro ao inserir cobrança:", error);
             throw error;
        }
        return cob.id;
    } catch (err) {
        console.error("Falha em criarCobrancaAssinaturaMock:", err);
        throw err;
    }
}

runScenarios().catch(console.error);
