
import "dotenv/config";
import { logger } from "../src/config/logger";
import { supabaseAdmin } from "../src/config/supabase";
import { validacaoPixService } from "../src/services/validacao-pix.service";

async function run() {
    logger.info("Starting PIX Failure Logic Verification...");

    // 1. Create Temporary User
    const email = `test-pix-${Date.now()}@example.com`;
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: "password123",
        user_metadata: { nome: "Test User PIX", telefone: "5511999999999" },
        email_confirm: true
    });

    if (error || !user.user) {
        logger.error({ error }, "Failed to create test user");
        process.exit(1);
    }
    const userId = user.user.id;
    logger.info({ userId }, "Test user created (Auth)");

    // Wait for trigger to populate public.usuarios
    await new Promise(r => setTimeout(r, 2000));

    // Ensure user exists in public.usuarios
    const { data: publicUser } = await supabaseAdmin.from("usuarios").select("id").eq("id", userId).single();
    if (!publicUser) {
        logger.warn("User not found in public.usuarios. Inserting manually...");
        await supabaseAdmin.from("usuarios").insert({ 
            id: userId, 
            nome: "Test User PIX", 
            email: email,
            status_chave_pix: "NAO_CADASTRADA" // Default
        });
    }

    logger.info("Test user confirmed in public.usuarios");

    // 2. Set Status to PENDENTE_VALIDACAO
    await supabaseAdmin
        .from("usuarios")
        .update({ status_chave_pix: "PENDENTE_VALIDACAO", chave_pix: "12345678900", tipo_chave_pix: "cpf" })
        .eq("id", userId);

    logger.info("User status set to PENDENTE_VALIDACAO");

    // 3. Trigger Rejection
    logger.info("Triggering rejection...");
    await validacaoPixService.rejeitarValidacao(userId, "Simulated Bank Rejection");

    // 4. Verify DB Status
    const { data: updatedUser, error: selectError } = await supabaseAdmin
        .from("usuarios")
        .select("status_chave_pix")
        .eq("id", userId)
        .single();
    
    if (selectError) {
        logger.error({ selectError, userId }, "Error fetching user status");
    }

    if (updatedUser?.status_chave_pix === "FALHA_VALIDACAO") {
        logger.info("SUCCESS: User status updated to FALHA_VALIDACAO");
    } else {
        logger.error({ 
            expected: "FALHA_VALIDACAO", 
            actual: updatedUser?.status_chave_pix,
            user: updatedUser,
            selectError 
        }, "FAILURE: User status incorrect");
    }

    // 5. Cleanup
    await supabaseAdmin.auth.admin.deleteUser(userId);
    logger.info("Test user deleted");
}

run().catch(console.error);
