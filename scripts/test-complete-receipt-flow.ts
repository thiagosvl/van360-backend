import "dotenv/config";
import { COBRANCA_STATUS_PENDENTE } from "../src/config/constants.js";
import { supabaseAdmin } from "../src/config/supabase.js";
import { webhookCobrancaHandler } from "../src/services/handlers/webhook-cobranca.handler.js";

/**
 * TESTE COMPLETO: Fluxo de Recibo
 */
async function runTest() {
    const testTxid = `TEST_${Date.now()}`;
    const valorTeste = 150.00;
    
    // NÚMEROS DE TESTE: Altere aqui para testar com aparelhos diferentes
    const whatsappPai = "5511952070350"; 
    const whatsappMotorista = "5511951186951"; // Pode ser o mesmo ou outro diferente

    console.log("-----------------------------------------");
    console.log(`🚀 Iniciando Teste de Recibo`);
    console.log(`📡 TXID: ${testTxid}`);
    console.log(`📱 WhatsApp Pai: ${whatsappPai}`);
    console.log(`📱 WhatsApp Motorista: ${whatsappMotorista}`);
    console.log("-----------------------------------------");

    try {
        // --- PRÉ-CHECK: Verificação de tabelas ---
        console.log("🔍 Verificando acesso às tabelas...");
        const { error: checkError } = await supabaseAdmin.from("cobrancas").select("id").limit(1);
        if (checkError) {
            console.error("❌ Erro ao acessar tabela 'cobrancas':", checkError);
            return;
        }
        console.log("✅ Acesso à tabela 'cobrancas' confirmado.");

        // 1. Setup
        console.log(`🔍 Buscando motorista e passageiro...`);
        const { data: motorista, error: mError } = await supabaseAdmin.from("usuarios").select("id, nome").limit(1).single();
        if (mError) throw new Error(`Falha ao buscar motorista: ${mError.message}`);
        
        const { data: passageiro, error: pError } = await supabaseAdmin.from("passageiros").select("id, nome, nome_responsavel").limit(1).single();
        if (pError) throw new Error(`Falha ao buscar passageiro: ${pError.message}`);

        console.log(`📱 Vinculando WhatsApps de teste ao banco...`);
        
        // Atualiza o WhatsApp do Pai no Passageiro
        await supabaseAdmin
            .from("passageiros")
            .update({ telefone_responsavel: whatsappPai })
            .eq("id", passageiro.id);

        // Atualiza o WhatsApp do Motorista no Usuário
        await supabaseAdmin
            .from("usuarios")
            .update({ telefone: whatsappMotorista })
            .eq("id", motorista.id);

        // --- EVITAR DUPLICIDADE NO TESTE ---
        const now = new Date();
        const mesTeste = now.getMonth() + 1;
        const anoTeste = now.getFullYear();

        console.log(`🧹 Limpando cobranças anteriores do teste para este mês...`);
        await supabaseAdmin
            .from("cobrancas")
            .delete()
            .eq("passageiro_id", passageiro.id)
            .eq("mes", mesTeste)
            .eq("ano", anoTeste);

        console.log(`📝 Criando cobrança pendente para ${passageiro.nome_responsavel} (${passageiro.nome})...`);

        // 2. Criar Cobrança fake no banco
        const { data: cobranca, error: cobError } = await supabaseAdmin
            .from("cobrancas")
            .insert({
                usuario_id: motorista.id,
                passageiro_id: passageiro.id,
                valor: valorTeste,
                status: COBRANCA_STATUS_PENDENTE,
                txid_pix: testTxid,
                data_vencimento: now.toISOString().split('T')[0],
                qr_code_payload: "00020101021226830014br.gov.bcb.pix...",
                origem: "manual", 
                mes: mesTeste,
                ano: anoTeste
            })
            .select()
            .single();

        if (cobError) throw new Error(`Falha ao criar cobrança: ${cobError.message} (Dica: ${cobError.hint || 'Nenhuma'})`);

        console.log(`✅ Cobrança criada ID: ${cobranca.id}`);
        console.log(`📡 Simulando recebimento de Webhook...`);

        // 3. Simular Webhook
        const mockPagamento = {
            txid: testTxid,
            valor: valorTeste,
            horario: now.toISOString(),
            endToEndId: "E12345678"
        };

        const success = await webhookCobrancaHandler.handle(mockPagamento);

        if (success) {
            console.log(`✨ SUCESSO! O handler processou o pagamento.`);
            
            // 4. Verificar se a URL do recibo foi salva
            const { data: cobAtualizada, error: fetchCError } = await supabaseAdmin
                .from("cobrancas")
                .select("recibo_url, status")
                .eq("id", cobranca.id)
                .single();

            if (fetchCError) console.error("❌ Erro ao buscar cobrança final:", fetchCError.message);

            console.log(`📊 Status Final: ${cobAtualizada?.status}`);
            console.log(`🖼️ URL do Recibo: ${cobAtualizada?.recibo_url}`);

            if (cobAtualizada?.recibo_url) {
                console.log(`🔥 Teste concluído com êxito!`);
            } else {
                console.log(`⚠️ Pagamento processado, mas recibo_url está vazio.`);
            }
        } else {
            console.log(`❌ O handler retornou falha.`);
        }

    } catch (error: any) {
        console.error("💥 ERRO NO TESTE:");
        console.error(error.message || error);
        if (error.details) console.error(`Detalhes: ${error.details}`);
    }
}

runTest();
