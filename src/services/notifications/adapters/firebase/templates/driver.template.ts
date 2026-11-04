import { PushNotificationAction } from "../../../../../types/enums.js";
import { TRIAL_BONUS_INACTIVE_DAYS } from "../../../../../config/constants.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { FirebaseMessagePayload } from "../firebase.template.js";

export class FirebaseDriverTemplates {
    static welcomeTrial(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        return {
            title: "Bem-vindo ao Van360! ðŸŽ‰",
            body: `OlÃ¡ ${driverName}, seu perÃ­odo de teste comeÃ§ou. Aproveite todas as funcionalidades!`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static trialEnded(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Seu teste encerrou â°",
            body: `OlÃ¡ ${driverName}, assine agora para manter o envio de lembretes aos pais e suas cobranÃ§as em dia!`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialLastCall(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Ãšltimo dia de teste! âš ï¸",
            body: "Assine hoje para continuar enviando lembretes aos pais e manter o financeiro do transporte organizado.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialBonusInactive(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const bonusDays = (ctx.bonusDays as number) || TRIAL_BONUS_INACTIVE_DAYS;

        return {
            title: "Mais tempo para vocÃª! ðŸŽ",
            body: `OlÃ¡ ${driverName}, liberamos +${bonusDays} dias gratuitos para vocÃª testar o Van360 com calma. Aproveite para cadastrar seus alunos!`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static trialRecovery1(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sentimos sua falta! ðŸ’™",
            body: "Seus alunos continuam salvos. Reative sua conta e deixe as cobranÃ§as e rotas no automÃ¡tico!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialRecovery2(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const formattedValue = NotificationContextFormatter.formatValue(ctx.valorPromocional as number | string);
        const valorTexto = ctx.valorPromocional
            ? `por apenas ${formattedValue}/mÃªs!`
            : "agora mesmo!";

        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Oferta especial pra vocÃª! ðŸŽ",
            body: `Reative seu Van360 ${valorTexto}`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static contractSignedDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const rawTokenOrLink = (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.tokenAssinatura || ctx.token || "") as string;
        const contractUrl = NotificationUrlBuilder.getContractSignatureUrl(rawTokenOrLink);
        const parentName = ctx.nomeResponsavel ? NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string) : "";
        const body = parentName
            ? `${parentName} acabou de assinar o contrato de ${passName}.`
            : `O responsÃ¡vel pelo(a) ${passName} acabou de assinar o contrato.`;

        return {
            title: "Novo Contrato Assinado! ðŸ“",
            body,
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                contractUrl
            }
        };
    }

    static subscriptionPaid(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Assinatura Confirmada! âœ…",
            body: "Seu pagamento foi aprovado. Obrigado por continuar com o Van360!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static renewalReminder(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: false,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "RenovaÃ§Ã£o se Aproximando âš ï¸",
            body: "Sua assinatura do Van360 expira em breve. Garanta sua renovaÃ§Ã£o!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalUrgency(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Aviso de Vencimento ðŸš¨",
            body: "Sua assinatura expira amanhÃ£. NÃ£o perca acesso ao sistema!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalRecovery1(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sua Assinatura Venceu! âŒ",
            body: "Renove agora para continuar tendo acesso total Ã  sua frota.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalRecoveryFinal(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Ãšltimo Aviso de SuspensÃ£o â›”",
            body: "Sua conta serÃ¡ suspensa. Regularize sua assinatura imediatamente!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static weeklySummary(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalProximos = typeof ctx.totalProximos === "number" ? ctx.totalProximos : Number(ctx.totalProximos) || 0;
        const totalAtrasado = typeof ctx.totalAtrasado === "number" ? ctx.totalAtrasado : Number(ctx.totalAtrasado) || 0;
        const qtdProximos = typeof ctx.qtdProximos === "number" ? ctx.qtdProximos : Number(ctx.qtdProximos) || 0;
        const qtdAtrasados = typeof ctx.qtdAtrasados === "number" ? ctx.qtdAtrasados : Number(ctx.qtdAtrasados) || 0;

        let title = "Pagamentos da Semana ðŸ’µ";
        let body = "Confira as parcelas dos seus alunos no app.";

        if (totalAtrasado > 0 && totalProximos > 0) {
            const atrasadosLabel = qtdAtrasados === 1 ? "1 parcela" : `${qtdAtrasados} parcelas`;
            const proximosLabel = qtdProximos === 1 ? "1 a vencer esta semana" : `${qtdProximos} a vencer esta semana`;
            title = "Pagamentos da Semana ðŸ’µ";
            body = `VocÃª tem ${atrasadosLabel} em atraso (${NotificationContextFormatter.formatValue(totalAtrasado)}) e ${proximosLabel} (${NotificationContextFormatter.formatValue(totalProximos)}). Confira se jÃ¡ recebeu e dÃª baixa no app.`;
        } else if (totalAtrasado > 0) {
            const atrasadosLabel = qtdAtrasados === 1 ? "1 parcela" : `${qtdAtrasados} parcelas`;
            title = "Parcelas em Aberto âš ï¸";
            body = `VocÃª tem ${atrasadosLabel} em atraso (${NotificationContextFormatter.formatValue(totalAtrasado)}). Confira se jÃ¡ recebeu e dÃª baixa no app.`;
        } else if (totalProximos > 0) {
            const proximosLabel = qtdProximos === 1 ? "1 parcela a vencer" : `${qtdProximos} parcelas a vencer`;
            title = "Pagamentos da Semana ðŸ’µ";
            body = `VocÃª tem ${proximosLabel} nos prÃ³ximos dias (${NotificationContextFormatter.formatValue(totalProximos)}). Confira os vencimentos no app.`;
        }

        return {
            title,
            body,
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static birthdayReminder(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Aniversariantes da Semana ðŸŽ‚",
            body: "Confira quem faz aniversÃ¡rio esta semana e dÃª os parabÃ©ns aos seus alunos!",
            data: {
                action: PushNotificationAction.OPEN_BIRTHDAYS,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralBonus(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const isVitalicio = Boolean(ctx.isVitalicio);
        return {
            title: isVitalicio ? "Sua indicaÃ§Ã£o assinou o Van360" : "VocÃª recebeu 1 mÃªs grÃ¡tis! ðŸŽ",
            body: isVitalicio
                ? "O motorista que vocÃª indicou assinou o Van360. Agradecemos pela indicaÃ§Ã£o e pela confianÃ§a!"
                : "O motorista que vocÃª indicou assinou o Van360. O seu bÃ´nus de 30 dias foi aplicado com sucesso.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralRegistered(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "AlguÃ©m se cadastrou usando o seu link de indicaÃ§Ã£o! ðŸŽ‰",
            body: "VocÃª receberÃ¡ o bÃ´nus de indicaÃ§Ã£o assim que ele realizar a assinatura.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static subscriptionDueToday(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sua Assinatura Vence Hoje! âš ï¸",
            body: `OlÃ¡ ${driverName}, renove hoje seu acesso ao Van360 para evitar bloqueios.`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static subscriptionOverdue(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Assinatura Expirada â›”",
            body: "Sua assinatura do Van360 expirou por falta de pagamento. Regularize para reativar.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static newPassengerPreRegistration(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const parentName = NotificationContextFormatter.getFirstName((ctx.nomeResponsavel || ctx.nomePai || ctx.nome) as string, "ResponsÃ¡vel");
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "novo aluno") as string;
        const requestsUrl = NotificationUrlBuilder.getPassengerRequestsUrl();

        return {
            title: "Novo cadastro na van! ðŸšŒ",
            body: `${parentName} realizou o cadastro de ${studentName}. Toque para revisar.`,
            data: {
                action: PushNotificationAction.OPEN_PASSENGER_REQUESTS,
                targetUrl: requestsUrl,
                prePassageiroId: (ctx.prePassageiroId || ctx.passageiroId || ctx.id || "") as string,
                passageiroId: (ctx.prePassageiroId || ctx.passageiroId || ctx.id || "") as string
            }
        };
    }

    static absenceRegisteredByParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "O aluno") as string;
        const routeName = (ctx.nomeRota || ctx.rota || "rota") as string;
        const formattedDate = (ctx.dataFormatada || ctx.data || "") as string;
        const parentName = ctx.nomeResponsavel ? NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string) : "";
        const sujeito = parentName || "O responsÃ¡vel";
        const dateSuffix = formattedDate.startsWith("no ") ? formattedDate : `no dia ${formattedDate}`;

        return {
            title: "NotificaÃ§Ã£o de AusÃªncia ðŸš«",
            body: `${sujeito} informou que ${studentName} estarÃ¡ ausente na ${routeName} ${dateSuffix}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string,
                rotaId: (ctx.rotaId || "") as string,
                dataAusencia: (ctx.dataAusencia || "") as string
            }
        };
    }

    static absenceRemovedByParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "O aluno") as string;
        const routeName = (ctx.nomeRota || ctx.rota || "rota") as string;
        const formattedDate = (ctx.dataFormatada || ctx.data || "") as string;
        const parentName = ctx.nomeResponsavel ? NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string) : "";
        const sujeito = parentName || "O responsÃ¡vel";

        return {
            title: "AusÃªncia Cancelada! ðŸšŒ",
            body: `${sujeito} cancelou a ausÃªncia de ${studentName} na ${routeName} do dia ${formattedDate}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string,
                rotaId: (ctx.rotaId || "") as string,
                dataAusencia: (ctx.dataAusencia || "") as string
            }
        };
    }

    static dueTodayDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const qtdCobrancas = typeof ctx.qtdCobrancas === "number" ? ctx.qtdCobrancas : Number(ctx.qtdCobrancas) || 0;
        const valorTotal = typeof ctx.valorTotal === "number" ? ctx.valorTotal : Number(ctx.valorTotal) || 0;
        const temAlunos = Boolean(ctx.temAlunos);
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (qtdCobrancas === 0) {
            if (!temAlunos) {
                return {
                    title: "Nenhuma parcela vence hoje!",
                    body: "Cadastre seus alunos para o app te avisar dos vencimentos todo dia. Diga adeus ao caderno e Ã s planilhas!",
                    data: {
                        action: PushNotificationAction.OPEN_PASSENGERS,
                        userId
                    }
                };
            }

            return {
                title: "Sem Vencimentos Hoje ðŸŸ¢",
                body: "NÃ£o hÃ¡ parcelas de alunos vencendo nesta data. Seu controle financeiro segue organizado!",
                data: {
                    action: PushNotificationAction.OPEN_BILLING,
                    userId
                }
            };
        }

        const formattedTotal = NotificationContextFormatter.formatValue(valorTotal);

        if (qtdCobrancas === 1) {
            const studentFirstName = NotificationContextFormatter.getFirstName(
                (ctx.nomePassageiro || ctx.nomeAluno || "Aluno") as string,
                "Aluno"
            );
            const prep = NotificationContextFormatter.getStudentPreposition(
                ctx.generoPassageiro as string | null | undefined
            );
            const rawRespNome = (ctx.nomeResponsavel || "") as string;
            const respFirstName = rawRespNome ? NotificationContextFormatter.getFirstName(rawRespNome) : "";
            const condicaoPagamento = respFirstName ? `Se ${respFirstName} jÃ¡ pagou` : "Se o responsÃ¡vel jÃ¡ pagou";

            return {
                title: "Vencimento de Hoje ðŸ’µ",
                body: `A parcela ${prep} ${studentFirstName} (${formattedTotal}) vence hoje. ${condicaoPagamento}, dÃª baixa no app para emitir o recibo.`,
                data: {
                    action: PushNotificationAction.OPEN_BILLING,
                    userId
                }
            };
        }

        return {
            title: "Vencimentos de Hoje ðŸ’µ",
            body: `VocÃª tem ${qtdCobrancas} parcelas (${formattedTotal}) para hoje. Se algum responsÃ¡vel jÃ¡ pagou, dÃª baixa no app para emitir o recibo.`,
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId
            }
        };
    }

    static nightClosingDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const isTrial = Boolean(ctx.isTrial);
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (isTrial) {
            return {
                title: "Controle de Pagamentos ðŸ’µ",
                body: "Recebeu pagamentos da van hoje? Cadastre seus alunos no Van360 para dar baixa nas parcelas com um toque e dar adeus ao caderninho!",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGERS,
                    userId
                }
            };
        }

        return {
            title: "ConferÃªncia do Dia ðŸ’µ",
            body: "Recebeu pagamentos hoje? DÃª baixa nas cobranÃ§as no app para manter seu controle em dia e liberar os recibos.",
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId
            }
        };
    }

    static automaticPaymentReceivedDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const formattedValue = NotificationContextFormatter.formatValue(ctx.valor as number | string);
        const studentName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        const parentName = ctx.nomeResponsavel ? NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string) : "";
        const monthYear = NotificationContextFormatter.formatMonthYearShort(ctx.mes as number | string, ctx.ano as number | string);
        const reciboEnviado = Boolean(ctx.reciboEnviado);
        const userId = (ctx.usuarioId || ctx.userId || "") as string;
        const cobrancaId = (ctx.cobrancaId || "") as string;

        const respStr = parentName ? ` (${parentName})` : "";
        const statusRecibo = reciboEnviado ? "Baixa concluÃ­da e recibo enviado!" : "Baixa automÃ¡tica concluÃ­da no app!";
        const body = `Parcela de ${monthYear}${respStr}. ${statusRecibo}`;

        return {
            title: `Recebido: ${formattedValue} â€¢ ${studentName} ðŸ’°`,
            body,
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId,
                cobrancaId
            }
        };
    }

    static renewalResponseReceivedDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const userId = (ctx.usuarioId || ctx.userId || "") as string;
        const title = (ctx.titulo || "AtualizaÃ§Ã£o na RenovaÃ§Ã£o") as string;
        const body = (ctx.corpo || "Um responsÃ¡vel respondeu Ã  proposta de renovaÃ§Ã£o.") as string;

        return {
            title,
            body,
            data: {
                action: PushNotificationAction.OPEN_RENOVATIONS,
                userId
            }
        };
    }
}
