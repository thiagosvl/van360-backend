import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import { chargeGeneratorJob } from "../src/services/jobs/charge-generator.job.js";
import { dailyChargeMonitorJob } from "../src/services/jobs/daily-charge-monitor.job.ts";
import { dailySubscriptionMonitorJob } from "../src/services/jobs/daily-subscription-monitor.job.ts";
import { processarPagamentoCobranca } from "../src/services/processar-pagamento.service.ts";

async function testResilience() {
    console.log("=== TESTE DE RESILIÊNCIA E AUTOMAÇÃO ===");

    // 1. Setup Data for Test Driver
    // Reutilizar um motorista de teste ou criar um
    const testDriverId = "0cde7028-0935-4303-997f-94a282669b76"; // Thiago SVL (Profissional)

    console.log("\n--- Cenário 2: Motorista Suspenso não gera mensalidade no dia 25 ---");
    // Forçar suspensão
    await supabaseAdmin.from("assinaturas_usuarios").update({ status: 'suspensa', ativo: false }).eq("usuario_id", testDriverId);
    
    const genResult = await chargeGeneratorJob.run({ force: true });
    console.log("Geração Mensal concluidâ. Criados:", genResult.createdCharges);
    // Verificar se não criou para os passageiros desse motorista (precisaria de uma query manual aqui para garantir)
    
    console.log("\n--- Cenário 3: Catch-up na Reativação ---");
    // Pegar uma cobrança de assinatura pendente do motorista
    const { data: signatureCobranca } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("*")
        .eq("usuario_id", testDriverId)
        .eq("status", "pendente_pagamento")
        .limit(1)
        .single();
    
    if (signatureCobranca) {
        console.log("Simulando pagamento da assinatura...");
        await processarPagamentoCobranca(signatureCobranca as any, {
            valor: signatureCobranca.valor,
            dataPagamento: new Date().toISOString()
        }, { cobrancaId: signatureCobranca.id });
        console.log("Processamento concluído. Verifique logs para catch-up e notificação.");
    } else {
        console.log("Nenhuma cobrança de assinatura pendente encontrada para o teste.");
    }

    console.log("\n--- Cenário 4: Embargo de 24h ---");
    // Rodar monitor diário. Como ativamos AGORA (< 24h), não deve enviar nada.
    const monitorResult = await dailyChargeMonitorJob.run();
    console.log("Monitor Diário concluído. Enviados:", monitorResult.sent);
    if (monitorResult.sent === 0) {
        console.log("✅ Sucesso: Nenhuma notificação enviada devido ao embargo.");
    }

    console.log("\n--- Cenário 5: Cleanup de Contas Abandonadas ---");
    // Mockar conta morta
    await supabaseAdmin.from("assinaturas_usuarios").update({ 
        status: 'suspensa', 
        ativo: false, 
        vigencia_fim: "2023-01-01" 
    }).eq("usuario_id", testDriverId);

    const cleanupResult = await dailySubscriptionMonitorJob.run();
    console.log("Cleanup concluído. Verifique se o log mostrou inativação.");
    
    const { data: updatedSub } = await supabaseAdmin.from("assinaturas_usuarios").select("status, ativo").eq("usuario_id", testDriverId).single();
    console.log("Status Final da Assinatura:", updatedSub?.status, "Ativo:", updatedSub?.ativo);
    
    if (updatedSub?.status === 'cancelada' && updatedSub?.ativo === false) {
        console.log("✅ Sucesso: Conta abandonada inativada.");
    }
}

testResilience().catch(console.error);
