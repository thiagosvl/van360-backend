import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatSubject } from "./components.js";
import { TRIAL_DURATION_DAYS, TRIAL_BONUS_INACTIVE_DAYS } from "../../../../../config/constants.js";

/**
 * Templates de E-mail para Motoristas (SaaS, Assinatura e Autenticação)
 */
export class ResendDriverTemplates {

    /**
     * 1. Recuperação de Senha (OTP)
     */
    static authRecovery(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nome || ctx.nomeMotorista, "Motorista");
        const codigoOtp = (ctx.codigoOtp || ctx.token || "") as string;

        const subject = formatSubject("Código de Redefinição de Senha");
        const preheader = `Seu código de redefinição de senha do Van360 é: ${codigoOtp}`;
        const text = `Olá, ${nome}!\n\nRecebemos uma solicitação para redefinir a sua senha no Van360.\n\nCódigo: ${codigoOtp}\n\nO código é válido por 15 minutos.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Recebemos uma solicitação para redefinir a sua senha de acesso à sua conta no <strong>Van360</strong>.")}
            ${EmailComponents.paragraph("Insira o código abaixo no aplicativo para prosseguir com a redefinição. O código é válido por <strong>15 minutos</strong>.")}
            
            ${codigoOtp ? EmailComponents.otpCard(codigoOtp) : ""}

            ${EmailComponents.warningCard("⚠️ <strong>Aviso de Segurança:</strong> Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha atual permanecerá segura.")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 2. Confirmação de Senha Alterada
     */
    static passwordChanged(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nome || ctx.nomeMotorista, "Motorista");

        const subject = formatSubject("Sua senha foi alterada");
        const preheader = `A senha da sua conta no Van360 foi alterada com sucesso.`;
        const text = `Olá, ${nome}!\n\nConfirmamos que a senha da sua conta no Van360 foi alterada com sucesso.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Confirmamos que a senha da sua conta no <strong>Van360</strong> foi alterada com sucesso.")}

            ${EmailComponents.warningCard(`🔒 <strong>Aviso de Segurança:</strong> Se você não realizou essa alteração, entre em contato imediatamente com a nossa equipe pelo e-mail <a href="mailto:contato@van360.com.br" style="color: #d97706; text-decoration: underline; font-weight: 600;">contato@van360.com.br</a>.`)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 3. Pagamento Confirmado da Assinatura
     */
    static subscriptionPaid(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");

        const subject = formatSubject("Pagamento Confirmado");
        const preheader = "Seu pagamento foi confirmado com sucesso. Obrigado por continuar com o Van360!";
        const text = `Olá, ${nome}!\n\nSeu pagamento foi confirmado com sucesso. Obrigado por continuar com o Van360!\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Seu pagamento foi confirmado com sucesso. Obrigado por continuar com o <strong>Van360</strong>!")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 4. Lembrete de Vencimento Próximo
     */
    static async subscriptionDueSoon(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: false, email });

        const subject = formatSubject("Lembrete de Vencimento da Assinatura");
        const preheader = "Sua assinatura do Van360 está próxima do vencimento. Acesse o sistema para renovar via Pix ou cartão.";
        const text = `Olá, ${nome}!\n\nSua assinatura do Van360 está próxima do vencimento. Acesse o sistema para renovar via Pix ou cartão.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Sua assinatura do Van360 está próxima do vencimento. Acesse a tela de pagamento para concluir a renovação via Pix ou cartão.")}

            ${EmailComponents.button("Acessar Minha Assinatura", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 5. Assinatura Vence Hoje
     */
    static async subscriptionDueToday(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: true, email });

        const subject = formatSubject("Assinatura Vence Hoje");
        const preheader = "Sua assinatura do Van360 vence hoje. Realize o pagamento para evitar interrupções no sistema.";
        const text = `Olá, ${nome}!\n\nSua assinatura do Van360 vence hoje. Realize o pagamento para evitar interrupções no sistema.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Sua assinatura do Van360 vence hoje. Clique no botão abaixo para acessar a tela de renovação e pagar via Pix ou cartão.")}

            ${EmailComponents.button("Pagar Assinatura", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 6. Falha de Pagamento no Cartão de Crédito
     * Alinhado com o texto do WABA: informa claramente que vai acessar a tela para trocar cartão ou pagar via Pix.
     */
    static async subscriptionFailedCC(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: true, email });

        const subject = formatSubject("Falha no Pagamento via Cartão");
        const preheader = "A cobrança automática da sua assinatura no cartão de crédito não foi autorizada.";
        const text = `Olá, ${nome}!\n\nA cobrança automática da sua assinatura no cartão de crédito não foi autorizada.\n\nClique no botão para acessar a tela de renovação e atualizar seu cartão ou pagar via Pix.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("A cobrança automática da sua assinatura no cartão de crédito não foi autorizada.")}
            ${EmailComponents.paragraph("Clique no botão abaixo para acessar a tela de renovação e atualizar seu cartão ou pagar via Pix.")}

            ${EmailComponents.button("Regularizar Assinatura", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 7. Assinatura Expirada / Atrasada
     */
    static async subscriptionOverdue(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: true, email });

        const subject = formatSubject("Assinatura Expirada");
        const preheader = "Sua assinatura do Van360 expirou. Seu acesso foi suspenso até a regularização do pagamento.";
        const text = `Olá, ${nome}!\n\nSua assinatura do Van360 expirou. Seu acesso foi suspenso até a regularização do pagamento.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Sua assinatura do Van360 expirou. Seu acesso foi suspenso até a regularização do pagamento.")}

            ${EmailComponents.button("Renovar Assinatura Agora", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 8. Fim do Período de Teste Grátis (Trial Ended)
     */
    static async trialEnded(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: true, email });

        const subject = formatSubject("Seu Teste Grátis Encerrou");
        const preheader = `Seu período de teste grátis de ${TRIAL_DURATION_DAYS} dias chegou ao fim. Assine um de nossos planos e continue gerenciando sua frota.`;
        const text = `Olá, ${nome}!\n\nSeu período de teste grátis de ${TRIAL_DURATION_DAYS} dias chegou ao fim. Assine um de nossos planos e continue gerenciando sua frota sem interrupções.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph(`Seu período de teste grátis de ${TRIAL_DURATION_DAYS} dias chegou ao fim. Assine um de nossos planos e continue gerenciando sua frota sem interrupções.`)}

            ${EmailComponents.button("Assinar Agora", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 9. Último Dia de Trial
     */
    static async trialLastCall(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: true, email });

        const subject = formatSubject("Último Dia do Teste Grátis");
        const preheader = "Seu período de teste grátis encerra hoje. Garanta sua assinatura para não perder o acesso às suas rotas.";
        const text = `Olá, ${nome}!\n\nSeu período de teste grátis encerra hoje. Garanta sua assinatura para não perder o acesso às suas rotas e passageiros.\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Seu período de teste grátis encerra hoje. Garanta sua assinatura para não perder o acesso às suas rotas e passageiros.")}

            ${EmailComponents.button("Garantir Assinatura", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 10. Reengajamento e Recuperação de Trial
     */
    static async trialRecovery(ctx: ResendTemplateContext): Promise<ResendTemplatePayload> {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const email = (ctx.email || ctx.emailMotorista) as string | undefined;
        const fullUrl = await NotificationUrlBuilder.getSubscriptionCheckoutUrl({ autoOpen: false, email });

        const subject = formatSubject("Sentimos sua falta!");
        const preheader = "Seu teste expirou, mas todos os seus dados e rotas continuam salvos com segurança. Escolha um plano!";
        const text = `Olá, ${nome}!\n\nSeu teste expirou, mas todos os seus dados e rotas continuam salvos com segurança. Escolha um plano e volte a usar o sistema!\n\nAcesse: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Seu teste expirou, mas todos os seus dados e rotas continuam salvos com segurança. Escolha um plano e volte a usar o sistema!")}

            ${EmailComponents.button("Ver Planos e Assinar", fullUrl)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 11. Boas-Vindas ao Trial (Novo Cadastro)
     */
    /**
     * 11. Boas-Vindas ao Trial (Novo Cadastro / Onboarding)
     */
    /**
     * 11. Boas-Vindas ao Trial (Novo Cadastro / Onboarding)
     */
    static welcomeTrial(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const fullUrl = NotificationUrlBuilder.getBaseAppUrl();

        const subject = formatSubject("Seu teste grátis do Van360 começou");
        const preheader = `Seu cadastro no Van360 foi concluído com sucesso. Você já tem ${TRIAL_DURATION_DAYS} dias grátis para conhecer a plataforma.`;
        const text = `Olá, ${nome}!\n\nSeu cadastro no Van360 foi concluído com sucesso.\n\nVocê já tem ${TRIAL_DURATION_DAYS} dias grátis para conhecer a plataforma e organizar a gestão do seu transporte escolar.\n\nComece pelo que mais importa:\nComece cadastrando seus passageiros e organizando suas parcelas. Depois, explore as ferramentas que podem simplificar sua rotina.\n\n• Passageiros: Tenha seus alunos organizados em um só lugar.\n• Financeiro: Controle pagamentos, gastos e cobranças em um só lugar.\n• Rotas: Organize seus trajetos e passageiros com mais praticidade.\n\nQuer conhecer tudo o que o Van360 pode fazer por você?\nEntre na plataforma e explore as outras funcionalidades.\n\nEntrar no Van360: ${fullUrl}\n\nDurante os próximos ${TRIAL_DURATION_DAYS} dias:\nVocê terá acesso às funcionalidades do Van360 para conhecer a plataforma e testar como ela pode facilitar sua rotina.\n\nA ideia é simples: use o Van360 na sua rotina e veja, na prática, o que ele pode organizar para você.\n\nSe precisar de ajuda durante o teste, fale com a gente. Estamos à disposição.`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Seu cadastro no <strong>Van360</strong> foi concluído com sucesso.")}
            ${EmailComponents.paragraph(`Você já tem <strong>${TRIAL_DURATION_DAYS} dias grátis</strong> para conhecer a plataforma e organizar a gestão do seu transporte escolar.`)}

            <div style="margin: 28px 0 20px 0;">
                <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">Comece pelo que mais importa</div>
                ${EmailComponents.paragraph("Comece cadastrando seus passageiros e organizando suas parcelas. Depois, explore as ferramentas que podem simplificar sua rotina.", 16)}

                <!-- Card 1: Passageiros -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02);">
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        <span>Passageiros</span>
                    </div>
                    <div style="font-size: 13px; color: #475569; line-height: 1.45;">Tenha seus alunos organizados em um só lugar.</div>
                </div>

                <!-- Card 2: Financeiro -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02);">
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 6v12"></path></svg>
                        <span>Financeiro</span>
                    </div>
                    <div style="font-size: 13px; color: #475569; line-height: 1.45;">Controle pagamentos, gastos e cobranças em um só lugar.</div>
                </div>

                <!-- Card 3: Rotas -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02);">
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></svg>
                        <span>Rotas</span>
                    </div>
                    <div style="font-size: 13px; color: #475569; line-height: 1.45;">Organize seus trajetos e passageiros com mais praticidade.</div>
                </div>
            </div>

            <div style="margin-top: 24px; margin-bottom: 6px;">
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Quer conhecer tudo o que o Van360 pode fazer por você?</div>
                ${EmailComponents.paragraph("Entre na plataforma e explore as outras funcionalidades.", 16)}
            </div>

            ${EmailComponents.button("Entrar no Van360", fullUrl)}

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 24px 0;" />

            <div>
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Durante os próximos ${TRIAL_DURATION_DAYS} dias</div>
                ${EmailComponents.paragraph("Você terá acesso às funcionalidades do Van360 para conhecer a plataforma e testar como ela pode facilitar sua rotina.")}
                ${EmailComponents.paragraph("A ideia é simples: use o Van360 na sua rotina e veja, na prática, o que ele pode organizar para você.")}
                ${EmailComponents.paragraph("Se precisar de ajuda durante o teste, fale com a gente. Estamos à disposição.")}
            </div>
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 12. Bônus de Indicação Concluída
     */
    static referralBonus(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const bonusDays = (ctx.trialDays || 30) as number;

        const subject = formatSubject("Você ganhou 1 mês grátis no Van360! 🎁");
        const preheader = `Seu indicado concluiu a assinatura do Van360. Adicionamos +${bonusDays} dias de acesso gratuito na sua conta.`;
        const text = `Olá, ${nome}!\n\nÓtimas notícias! O motorista que você indicou concluiu a assinatura do Van360.\n\nComo recompensa por indicar a nossa plataforma, adicionamos +${bonusDays} dias de acesso gratuito à sua conta!\n\nObrigado por ajudar a comunidade do Van360 a crescer.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Ótimas notícias! O motorista que você indicou concluiu a assinatura do <strong>Van360</strong>.")}
            ${EmailComponents.paragraph(`Como recompensa pela sua indicação, adicionamos <strong>+${bonusDays} dias de acesso gratuito</strong> à sua conta!`)}
            
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin: 24px 0;">
                <div style="font-size: 15px; font-weight: 700; color: #166534; margin-bottom: 4px;">🎉 Bônus Aplicado com Sucesso</div>
                <div style="font-size: 13.5px; color: #15803d; line-height: 1.45;">Seu prazo de vencimento foi automaticamente estendido. Continue aproveitando todas as ferramentas do Van360 sem custos adicionais neste período.</div>
            </div>

            ${EmailComponents.paragraph("Obrigado por confiar no Van360 e fazer a nossa comunidade de transporte escolar crescer!")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 13. Extensão de Trial para Usuário Inativo
     */
    static trialBonusInactive(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Motorista");
        const bonusDays = (ctx.bonusDays || TRIAL_BONUS_INACTIVE_DAYS) as number;
        const fullUrl = NotificationUrlBuilder.getBaseAppUrl();

        const subject = formatSubject("Liberamos +7 dias gratuitos para você no Van360 🎁");
        const preheader = `Vimos que a rotina foi corrida! Liberamos mais ${bonusDays} dias grátis para você testar o Van360 com calma.`;
        const text = `Olá, ${nome}!\n\nSabemos como a rotina no transporte escolar é corrida. Vimos que você ainda não conseguiu cadastrar seus alunos e aproveitar as facilidades do Van360.\n\nComo queremos que você realmente veja como a plataforma simplifica o seu dia a dia, liberamos mais ${bonusDays} dias de teste gratuito para a sua conta!\n\nCadastre seus primeiros passageiros e organize suas rotas e mensalidades com tranquilidade.\n\nAcessar Van360: ${fullUrl}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Sabemos como a rotina no transporte escolar é corrida no dia a dia.")}
            ${EmailComponents.paragraph(`Vimos que você ainda não conseguiu cadastrar seus alunos e testar o <strong>Van360</strong> na prática. Como queremos que você realmente sinta a facilidade de organizar suas rotas e mensalidades, <strong>liberamos mais ${bonusDays} dias gratuitos</strong> para a sua conta!`)}

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin: 24px 0;">
                <div style="font-size: 15px; font-weight: 700; color: #166534; margin-bottom: 4px;">🎁 +${bonusDays} Dias de Teste Liberados</div>
                <div style="font-size: 13.5px; color: #15803d; line-height: 1.45;">Seu período gratuito foi automaticamente prorrogado. Aproveite este tempo extra para cadastrar seus primeiros passageiros e organizar seu fluxo de trabalho.</div>
            </div>

            ${EmailComponents.button("Acessar o Van360 e Começar", fullUrl)}

            ${EmailComponents.paragraph("Se precisar de qualquer ajuda durante a configuração inicial, nossa equipe está sempre à disposição.")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }
}
