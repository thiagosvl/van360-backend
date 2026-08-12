import 'dotenv/config';
import { ResendAdapter } from '../src/services/notifications/adapters/resend/resend.adapter.js';
import {
    EVENTO_AUTH_RECUPERACAO_SENHA,
    EVENTO_AUTH_SENHA_ALTERADA,
    EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
    EVENTO_MOTORISTA_EQUIPE_CADASTRO,
    EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
    EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
    EVENTO_MOTORISTA_ASSINATURA_PAGO,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1
} from '../src/config/constants.js';

const resendAdapter = new ResendAdapter();

async function sendTestEmail(targetEmail: string, eventName: string, contextData: any) {
    console.log(`\n📧 Disparando e-mail de '${eventName}' para: ${targetEmail}...`);
    
    // Injeta o e-mail em contextData e em options para garantir o envio direto
    const ctx = { ...contextData, email: targetEmail };
    const success = await resendAdapter.send(eventName, ctx, { email: targetEmail });
    
    if (success) {
        console.log(`✅ [SUCESSO] E-mail enviado!`);
    } else {
        console.error(`❌ [FALHA] Erro ao enviar e-mail.`);
    }
}

async function runRoteiro(emailTarget: string, filterGroup?: string) {
    console.log(`\n======================================================`);
    console.log(`🚀 ROTEIRO DE TESTES DE E-MAIL (RESEND) -> ${emailTarget}`);
    console.log(`======================================================\n`);

    const ctxBase = {
        nome: "Thiago Silva",
        nomeMotorista: "Thiago Silva",
        nomeResponsavel: "Maria Oliveira",
        nomePassageiro: "Lucas Silva",
        cpfLogin: "395.423.918-38",
        senhaTemporaria: "Van360@2026",
        codigoOtp: "849201",
        contratoUrl: "https://app.van360.com.br/assinar/token-123",
        documentoFinalUrl: "https://app.van360.com.br/assinar/token-123",
        valorPromocional: 79.90
    };

    const testes = [
        // GRUPO 1: AUTENTICAÇÃO (auth)
        { id: "1", group: "auth", name: "Recuperação de Senha (OTP)", event: EVENTO_AUTH_RECUPERACAO_SENHA, ctx: ctxBase },
        { id: "2", group: "auth", name: "Senha Alterada", event: EVENTO_AUTH_SENHA_ALTERADA, ctx: ctxBase },

        // GRUPO 2: CONTRATOS (contract)
        { id: "3", group: "contract", name: "Cópia do Contrato Assinado", event: EVENTO_PASSAGEIRO_CONTRATO_ASSINADO, ctx: ctxBase },

        // GRUPO 3: EQUIPE DO MOTORISTA (team)
        { id: "4", group: "team", name: "Cadastro de Ajudante", event: EVENTO_MOTORISTA_EQUIPE_CADASTRO, ctx: ctxBase },
        { id: "5", group: "team", name: "Reset de Senha do Ajudante", event: EVENTO_MOTORISTA_EQUIPE_RESET_SENHA, ctx: ctxBase },
        { id: "6", group: "team", name: "Status Ativado", event: EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO, ctx: { ...ctxBase, isEngaged: true } },
        { id: "7", group: "team", name: "Status Desativado", event: EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO, ctx: { ...ctxBase, isEngaged: false } },

        // GRUPO 4: ASSINATURA SAAS VAN360 (saas)
        { id: "8", group: "saas", name: "Pagamento Confirmado", event: EVENTO_MOTORISTA_ASSINATURA_PAGO, ctx: ctxBase },
        { id: "9", group: "saas", name: "Assinatura Vencendo", event: EVENTO_MOTORISTA_ASSINATURA_VENCENDO, ctx: ctxBase },
        { id: "10", group: "saas", name: "Assinatura Vence Hoje", event: EVENTO_MOTORISTA_ASSINATURA_VENCEU, ctx: ctxBase },
        { id: "11", group: "saas", name: "Falha no Cartão", event: EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, ctx: ctxBase },
        { id: "12", group: "saas", name: "Assinatura Expirada", event: EVENTO_MOTORISTA_ASSINATURA_ATRASADA, ctx: ctxBase },
        { id: "13", group: "saas", name: "Reengajamento / Trial", event: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1, ctx: ctxBase },
    ];

    const selecionados = filterGroup 
        ? testes.filter(t => t.group === filterGroup || t.id === filterGroup)
        : testes;

    for (const item of selecionados) {
        console.log(`👉 Testando [${item.id}/13] (${item.group.toUpperCase()}) - ${item.name}`);
        await sendTestEmail(emailTarget, item.event, item.ctx);
        await new Promise(r => setTimeout(r, 1200)); // Aguarda 1.2s entre envios para respeitar o Resend
    }

    console.log(`\n🎉 Disparos concluídos! Verifique a caixa de entrada de ${emailTarget}.`);
}

const targetEmail = process.argv[2] || "thiago-svl@hotmail.com";
const filter = process.argv[3]; // Opcional: 'auth', 'contract', 'team', 'saas' ou ID '1'..'13'

runRoteiro(targetEmail, filter);
