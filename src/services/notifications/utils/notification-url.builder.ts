import { env } from "../../../config/env.js";
import { supabaseAdmin } from "../../../config/supabase.js";
import { logger } from "../../../config/logger.js";

/**
 * NotificationUrlBuilder (SSOT - Single Source of Truth para URLs de Notificações)
 * Centraliza a geração de todas as URLs do sistema (Checkout, Contratos, App, Lojas).
 * Evita duplicação de código e quebra de contratos entre canais (WABA, Resend, Firebase).
 */
export class NotificationUrlBuilder {
    /**
     * Retorna a URL base do Frontend configurada no ambiente
     */
    static getBaseAppUrl(): string {
        const url = env.FRONTEND_URL || process.env.FRONTEND_URL || "https://app.van360.com.br";
        return url.replace(/\/$/, "");
    }

    /**
     * Gera a URL síncrona limpa da página de Assinatura/Checkout no aplicativo Web
     */
    static getSubscriptionCheckoutUrlSync(options?: { autoOpen?: boolean }): string {
        const baseUrl = this.getBaseAppUrl();
        const autoOpen = options?.autoOpen ?? false;
        const route = autoOpen ? "/assinatura?open_checkout=true" : "/assinatura";

        return `${baseUrl}${route}`;
    }

    /**
     * Gera a URL da página de Assinatura/Checkout no aplicativo Web.
     * Se um e-mail for fornecido, tenta gerar um Magic Link de autenticação direta via Supabase Admin API.
     * Caso o e-mail não seja fornecido ou ocorra qualquer falha, aplica o Fallback limpo da rota.
     */
    static async getSubscriptionCheckoutUrl(options?: { autoOpen?: boolean; token?: string; email?: string }): Promise<string> {
        const autoOpen = options?.autoOpen ?? false;
        const email = options?.email?.trim();
        const fallbackUrl = this.getSubscriptionCheckoutUrlSync({ autoOpen });

        if (!email || !email.includes("@")) {
            return fallbackUrl;
        }

        try {
            const baseUrl = this.getBaseAppUrl();
            const targetRoute = autoOpen ? "/assinatura?open_checkout=true" : "/assinatura";
            const redirectTo = `${baseUrl}${targetRoute}`;

            const { data, error } = await supabaseAdmin.auth.admin.generateLink({
                type: "magiclink",
                email: email,
                options: {
                    redirectTo,
                },
            });

            if (error || !data?.properties?.action_link) {
                logger.warn({ email, error: error?.message }, "[NotificationUrlBuilder] Falha ao gerar Magic Link, utilizando Smart Fallback");
                return fallbackUrl;
            }

            return data.properties.action_link;
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ error: errorMessage, email }, "[NotificationUrlBuilder] Exceção ao gerar Magic Link para checkout");
            return fallbackUrl;
        }
    }

    /**
     * Gera a URL da Ponte Externa de Autenticação para Checkout Expresso
     */
    static getExternalCheckoutBridgeUrl(options?: { autoOpen?: boolean; token?: string }): string {
        const baseUrl = this.getBaseAppUrl();
        const autoOpen = options?.autoOpen ?? false;
        
        if (autoOpen) {
            return `${baseUrl}/checkout-externo?auto_open=true`;
        }
        return `${baseUrl}/checkout-externo`;
    }

    /**
     * Gera a URL para a assinatura digital do Contrato
     * @param tokenOrLink Token de acesso do contrato ou link completo
     */
    static getContractSignatureUrl(tokenOrLink?: string): string {
        const baseUrl = this.getBaseAppUrl();
        if (!tokenOrLink) return `${baseUrl}/contratos`;

        // Se já for uma URL absoluta (começa com http:// ou https://), retorna ela mesma
        if (tokenOrLink.startsWith("http://") || tokenOrLink.startsWith("https://")) {
            return tokenOrLink;
        }

        return `${baseUrl}/assinar/${tokenOrLink}`;
    }

    /**
     * Gera a URL para a lista de Pré-Cadastros / Solicitações de Passageiros no App
     */
    static getPassengerRequestsUrl(): string {
        const baseUrl = this.getBaseAppUrl();
        return `${baseUrl}/passageiros?tab=solicitacoes`;
    }

    /**
     * Extrai apenas o sufixo/token de uma URL para uso em botões de URL Dinâmica da Meta (WABA)
     */
    static extractWabaDynamicToken(urlOrToken?: string): string {
        if (!urlOrToken) return "assinatura";
        const clean = urlOrToken.trim();
        const lastPart = clean.split("/").pop() || clean;
        return lastPart.replace(/^\//, "");
    }

    /**
     * URL oficial da Play Store (Android)
     */
    static getPlayStoreUrl(): string {
        return process.env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.tibis.van360";
    }

    /**
     * Badge oficial da Play Store
     */
    static getPlayStoreBadgeUrl(): string {
        return process.env.PLAY_STORE_BADGE_URL || "https://play.google.com/intl/en_us/badges/static/images/badges/pt-br_badge_web_generic.png";
    }

    /**
     * URL oficial da App Store (Apple/iOS)
     */
    static getAppStoreUrl(): string | null {
        const url = process.env.APP_STORE_URL || process.env.APPLE_STORE_URL;
        return url && url.trim().length > 0 ? url.trim() : null;
    }

    /**
     * Badge oficial da App Store
     */
    static getAppStoreBadgeUrl(): string {
        return process.env.APP_STORE_BADGE_URL || "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/pt-br?size=250x83";
    }
}
