import { PushNotificationAction } from "../../../../../types/enums.js";
import { TRIAL_BONUS_INACTIVE_DAYS } from "../../../../../config/constants.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { FirebaseMessagePayload } from "../firebase.template.js";

export class FirebaseDriverTemplates {
    static welcomeTrial(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        return {
            title: "Bem-vindo ao Van360! 🎉",
            body: `Olá ${driverName}, seu período de teste começou. Aproveite todas as funcionalidades!`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static trialEnded(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        const body = totalPassageiros > 0
            ? `Olá ${driverName}, ${totalPassageiros === 1 ? "seu 1 aluno continua salvo" : `seus ${totalPassageiros} alunos continuam salvos`}! Assine agora para manter os lembretes aos pais e o controle da van em dia.`
            : `Olá ${driverName}, assine agora para manter o envio de lembretes aos pais e suas cobranças em dia!`;

        return {
            title: "Seu teste encerrou ⏰",
            body,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialLastCall(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        const body = totalPassageiros > 0
            ? `Assine hoje para manter as carteirinhas e os lembretes de pagamento ${totalPassageiros === 1 ? "do seu aluno" : `dos seus ${totalPassageiros} alunos`} funcionando no automático.`
            : "Assine hoje para continuar enviando lembretes aos pais e manter o financeiro do transporte organizado.";

        return {
            title: "Último dia de teste! ⚠️",
            body,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialActivationD1(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (totalPassageiros === 0) {
            return {
                title: "📲 Sem tempo para digitar tudo?",
                body: "Envie seu link exclusivo no WhatsApp dos pais e deixe que eles preencham a carteirinha dos filhos para você!",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGER_REQUESTS,
                    userId
                }
            };
        }

        return {
            title: "🎉 Ótimo começo na sua van!",
            body: "Dica rápida: envie seu link exclusivo no WhatsApp dos pais para eles preencherem o restante das carteirinhas sozinhos!",
            data: {
                action: PushNotificationAction.OPEN_PASSENGER_REQUESTS,
                userId
            }
        };
    }

    static trialActivationD3(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (totalPassageiros === 0) {
            return {
                title: "📇 Cadastre 1 aluno para testar!",
                body: "Veja na prática como a carteirinha do aluno e as parcelas mensais ficam organizadas automaticamente no celular.",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGERS,
                    userId
                }
            };
        }

        return {
            title: "💰 Chega de cobrar pais no WhatsApp!",
            body: "Configure sua chave Pix no aplicativo. O Van360 avisa os pais antes do vencimento sem você precisar cobrar ninguém.",
            data: {
                action: PushNotificationAction.OPEN_SETTINGS,
                userId
            }
        };
    }

    static trialActivationD5(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (totalPassageiros === 0) {
            return {
                title: "🚌 Sua van organizada em 2 minutos",
                body: "Compartilhe o link de cadastro no grupo dos pais hoje e receba as carteirinhas dos alunos prontas no aplicativo!",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGER_REQUESTS,
                    userId
                }
            };
        }

        return {
            title: "📋 Chega de itinerário no papel!",
            body: "Monte sua rota no aplicativo e marque embarque, desembarque ou ausência dos alunos com apenas um toque.",
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                userId
            }
        };
    }

    static trialActivationD8(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (totalPassageiros === 0) {
            return {
                title: "⏳ Metade do seu teste grátis passou!",
                body: "Ainda dá tempo de dar adeus ao caderninho. Toque aqui para cadastrar seus alunos e testar o controle de mensalidades.",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGERS,
                    userId
                }
            };
        }

        return {
            title: "✍️ Contratos digitais no WhatsApp!",
            body: "Gere contratos para seus alunos em 1 clique e colha a assinatura dos responsáveis direto pelo celular, sem papelada.",
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                userId
            }
        };
    }

    static trialActivationD11(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalPassageiros = Number(ctx.totalPassageiros) || 0;
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (totalPassageiros === 0) {
            return {
                title: "⚠️ Restam 4 dias de teste grátis",
                body: "Não deixe seu teste acabar em branco! Cadastre seus alunos agora para testar os lembretes automáticos de pagamento.",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGERS,
                    userId
                }
            };
        }

        return {
            title: "📲 Já convidou os pais para o app?",
            body: "Pela carteirinha do aluno, você libera o aplicativo dos pais para verem recibos, contratos e avisarem ausências!",
            data: {
                action: PushNotificationAction.OPEN_PASSENGERS,
                userId
            }
        };
    }

    static trialBonusInactive(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const bonusDays = (ctx.bonusDays as number) || TRIAL_BONUS_INACTIVE_DAYS;

        return {
            title: "Mais tempo para você! 🎁",
            body: `Olá ${driverName}, liberamos +${bonusDays} dias gratuitos para você testar o Van360 com calma. Aproveite para cadastrar seus alunos!`,
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
            title: "Sentimos sua falta! 💙",
            body: "Seus alunos continuam salvos. Reative sua conta e deixe as cobranças e rotas no automático!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialRecovery2(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const formattedValue = NotificationContextFormatter.formatValue(ctx.valorPromocional as number | string);
        const valorTexto = ctx.valorPromocional
            ? `por apenas ${formattedValue}/mês!`
            : "agora mesmo!";

        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Oferta especial pra você! 🎁",
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
            : `O responsável pelo(a) ${passName} acabou de assinar o contrato.`;

        return {
            title: "Novo Contrato Assinado! 📝",
            body,
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                contractUrl
            }
        };
    }

    static subscriptionPaid(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Assinatura Confirmada! ✅",
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
            title: "Renovação se Aproximando ⚠️",
            body: "Sua assinatura do Van360 expira em breve. Garanta sua renovação!",
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
            title: "Aviso de Vencimento 🚨",
            body: "Sua assinatura expira amanhã. Não perca acesso ao sistema!",
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
            title: "Sua Assinatura Venceu! ❌",
            body: "Renove agora para continuar tendo acesso total à sua frota.",
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
            title: "Último Aviso de Suspensão ⛔",
            body: "Sua conta será suspensa. Regularize sua assinatura imediatamente!",
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

        let title = "Pagamentos da Semana 💵";
        let body = "Confira as parcelas dos seus alunos no app.";

        if (totalAtrasado > 0 && totalProximos > 0) {
            const atrasadosLabel = qtdAtrasados === 1 ? "1 parcela" : `${qtdAtrasados} parcelas`;
            const proximosLabel = qtdProximos === 1 ? "1 a vencer esta semana" : `${qtdProximos} a vencer esta semana`;
            title = "Pagamentos da Semana 💵";
            body = `Você tem ${atrasadosLabel} em atraso (${NotificationContextFormatter.formatValue(totalAtrasado)}) e ${proximosLabel} (${NotificationContextFormatter.formatValue(totalProximos)}). Confira se já recebeu e dê baixa no app.`;
        } else if (totalAtrasado > 0) {
            const atrasadosLabel = qtdAtrasados === 1 ? "1 parcela" : `${qtdAtrasados} parcelas`;
            title = "Parcelas em Aberto ⚠️";
            body = `Você tem ${atrasadosLabel} em atraso (${NotificationContextFormatter.formatValue(totalAtrasado)}). Confira se já recebeu e dê baixa no app.`;
        } else if (totalProximos > 0) {
            const proximosLabel = qtdProximos === 1 ? "1 parcela a vencer" : `${qtdProximos} parcelas a vencer`;
            title = "Pagamentos da Semana 💵";
            body = `Você tem ${proximosLabel} nos próximos dias (${NotificationContextFormatter.formatValue(totalProximos)}). Confira os vencimentos no app.`;
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
            title: "Aniversariantes da Semana 🎂",
            body: "Confira quem faz aniversário esta semana e dê os parabéns aos seus alunos!",
            data: {
                action: PushNotificationAction.OPEN_BIRTHDAYS,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralBonus(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const isVitalicio = Boolean(ctx.isVitalicio);
        return {
            title: isVitalicio ? "Sua indicação assinou o Van360" : "Você recebeu 1 mês grátis! 🎁",
            body: isVitalicio
                ? "O motorista que você indicou assinou o Van360. Agradecemos pela indicação e pela confiança!"
                : "O motorista que você indicou assinou o Van360. O seu bônus de 30 dias foi aplicado com sucesso.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralRegistered(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Alguém se cadastrou usando o seu link de indicação! 🎉",
            body: "Você receberá o bônus de indicação assim que ele realizar a assinatura.",
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
            title: "Sua Assinatura Vence Hoje! ⚠️",
            body: `Olá ${driverName}, renove hoje seu acesso ao Van360 para evitar bloqueios.`,
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
            title: "Assinatura Expirada ⛔",
            body: "Sua assinatura do Van360 expirou por falta de pagamento. Regularize para reativar.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static newPassengerPreRegistration(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const parentName = NotificationContextFormatter.getFirstName((ctx.nomeResponsavel || ctx.nomePai || ctx.nome) as string, "Responsável");
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "novo aluno") as string;
        const requestsUrl = NotificationUrlBuilder.getPassengerRequestsUrl();

        return {
            title: "Novo cadastro na van! 🚌",
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
        const sujeito = parentName || "O responsável";
        const dateSuffix = formattedDate.startsWith("no ") ? formattedDate : `no dia ${formattedDate}`;

        return {
            title: "Notificação de Ausência 🚫",
            body: `${sujeito} informou que ${studentName} estará ausente na ${routeName} ${dateSuffix}.`,
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
        const sujeito = parentName || "O responsável";

        return {
            title: "Ausência Cancelada! 🚌",
            body: `${sujeito} cancelou a ausência de ${studentName} na ${routeName} do dia ${formattedDate}.`,
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
                    body: "Cadastre seus alunos para o app te avisar dos vencimentos todo dia. Diga adeus ao caderno e às planilhas!",
                    data: {
                        action: PushNotificationAction.OPEN_PASSENGERS,
                        userId
                    }
                };
            }

            return {
                title: "Sem Vencimentos Hoje 🟢",
                body: "Não há parcelas de alunos vencendo nesta data. Seu controle financeiro segue organizado!",
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
            const condicaoPagamento = respFirstName ? `Se ${respFirstName} já pagou` : "Se o responsável já pagou";

            return {
                title: "Vencimento de Hoje 💵",
                body: `A parcela ${prep} ${studentFirstName} (${formattedTotal}) vence hoje. ${condicaoPagamento}, dê baixa no app para emitir o recibo.`,
                data: {
                    action: PushNotificationAction.OPEN_BILLING,
                    userId
                }
            };
        }

        return {
            title: "Vencimentos de Hoje 💵",
            body: `Você tem ${qtdCobrancas} parcelas (${formattedTotal}) para hoje. Se algum responsável já pagou, dê baixa no app para emitir o recibo.`,
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId
            }
        };
    }

    static nightClosingDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const semAlunos = ctx.temAlunos !== undefined ? !Boolean(ctx.temAlunos) : Boolean(ctx.isTrial);
        const userId = (ctx.usuarioId || ctx.userId || "") as string;

        if (semAlunos) {
            return {
                title: "Controle de Pagamentos 💵",
                body: "Recebeu pagamentos da van hoje? Cadastre seus alunos no Van360 para dar baixa nas parcelas com um toque e dar adeus ao caderninho!",
                data: {
                    action: PushNotificationAction.OPEN_PASSENGERS,
                    userId
                }
            };
        }

        return {
            title: "Conferência do Dia 💵",
            body: "Recebeu pagamentos hoje? Dê baixa nas cobranças no app para manter seu controle em dia e liberar os recibos.",
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
        const statusRecibo = reciboEnviado ? "Baixa concluída e recibo enviado!" : "Baixa automática concluída no app!";
        const body = `Parcela de ${monthYear}${respStr}. ${statusRecibo}`;

        return {
            title: `Recebido: ${formattedValue} • ${studentName} 💰`,
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
        const title = (ctx.titulo || "Atualização na Renovação") as string;
        const body = (ctx.corpo || "Um responsável respondeu à proposta de renovação.") as string;

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
