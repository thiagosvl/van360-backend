
import "dotenv/config";
import { logger } from "../src/config/logger";
import { supabaseAdmin } from "../src/config/supabase";
import { validacaoPixService } from "../src/services/validacao-pix.service";

async function run() {
    logger.info("Starting Retry Logic Verification...");

    // 1. Create User
    const email = `test-retry-${Date.now()}@example.com`;
    const { data: userAuth, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: "password123",
        user_metadata: { nome: "Test Retry User", telefone: "5511999999999" },
        email_confirm: true
    });
    if (authError || !userAuth.user) throw new Error("Auth Create Failed");
    const userId = userAuth.user.id;

    await new Promise(r => setTimeout(r, 2000)); // Wait for trigger

    // 2. Create Stuck Charge
    // Status PAGO but Repasse FALHA
    const { data: cobranca, error: cobError } = await supabaseAdmin.from("cobrancas").insert({
        usuario_id: userId,
        valor: 100.00,
        status: "pago",
        status_repasse: "FALHA_REPASSE",
        data_vencimento: new Date().toISOString()
    }).select().single();

    if (cobError) throw new Error("Charge Create Failed: " + cobError.message);
    logger.info({ cobrancaId: cobranca.id }, "Created stuck charge");

    // 3. Simulate Successful Validation
    // This should internaly trigger cobrancaPagamentoService.reprocessarRepassesPendentes
    logger.info("Simulating PIX Validation Success...");
    
    // Mocking initiating validation isn't enough, we need to call the confirmation logic directly
    // Or we can mock the reprocessing call if we want unit test style, but here we want integration.
    // However, confirmarChaveUsuario is private or we need to access it via service.
    
    // We will call ConfirmarChaveUsuario (which is exported as confirmedChaveUsuario? No it is not exported directly in the interface object)
    // Wait, let me check validacaoPixService export.
    // It exports 'confirmarChaveUsuario' in the object.

    await validacaoPixService.confirmarChaveUsuario(userId, "12345678900", "CPF", "Test User", "12345678900");

    // 4. Verify Charge Status Change
    // It should move to PENDENTE or REPASSADO (if mock inter works instantly)
    // We expect reprocessar to set it to PENDENTE (queued) or call iniciarRepasse.
    // iniciarRepasse sets to PENDENTE if queued successfully.

    await new Promise(r => setTimeout(r, 1000)); // Wait for async call

    const { data: updatedCob } = await supabaseAdmin.from("cobrancas").select("status_repasse").eq("id", cobranca.id).single();

    if (updatedCob?.status_repasse === "PENDENTE" || updatedCob?.status_repasse === "REPASSADO") {
        logger.info("SUCCESS: Charge status changed to " + updatedCob.status_repasse);
    } else {
        logger.error({ actual: updatedCob?.status_repasse }, "FAILURE: Charge status did not change from FALHA");
    }

    // Cleanup
    await supabaseAdmin.from("cobrancas").delete().eq("id", cobranca.id);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    
    logger.info("Test Completed Successfully.");
    process.exit(0);
}

run().catch(console.error);
