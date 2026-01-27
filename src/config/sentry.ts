import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./env.js";

/**
 * Inicializa o Sentry para error tracking e performance monitoring
 * 
 * Configuração:
 * - SENTRY_DSN: URL do projeto Sentry
 * - SENTRY_ENVIRONMENT: production | staging | development
 * - SENTRY_TRACES_SAMPLE_RATE: Taxa de amostragem de traces (0.0 a 1.0)
 */
export function initSentry() {
  // Só inicializa se DSN estiver configurado
  if (!env.SENTRY_DSN) {
    console.warn("⚠️  Sentry DSN não configurado. Error tracking desabilitado.");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || "development",
    
    // Performance Monitoring
    tracesSampleRate: parseFloat(env.SENTRY_TRACES_SAMPLE_RATE || "0.1"), // 10% das transações
    
    // Profiling (CPU/Memory)
    profilesSampleRate: parseFloat(env.SENTRY_PROFILES_SAMPLE_RATE || "0.1"), // 10% dos traces
    
    integrations: [
      // Profiling de performance
      nodeProfilingIntegration(),
      
      // HTTP tracking
      Sentry.httpIntegration({ tracing: true }),
      
      // Console tracking
      Sentry.consoleIntegration(),
    ],
    
    // Filtrar dados sensíveis
    beforeSend(event) {
      // Remove dados sensíveis de breadcrumbs e contexto
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      
      // Remove query params sensíveis
      if (event.request?.query_string) {
        const sensitiveParams = ['token', 'password', 'senha', 'cpf', 'access_token'];
        sensitiveParams.forEach(param => {
          if (event.request?.query_string?.includes(param)) {
            event.request.query_string = event.request.query_string.replace(
              new RegExp(`${param}=[^&]*`, 'gi'),
              `${param}=[REDACTED]`
            );
          }
        });
      }
      
      return event;
    },
    
    // Ignorar erros comuns/esperados
    ignoreErrors: [
      // Erros de rede do cliente
      'Network request failed',
      'NetworkError',
      'Failed to fetch',
      
      // Erros de timeout esperados
      'timeout',
      'ETIMEDOUT',
      
      // Erros de validação (não são bugs)
      'ValidationError',
      'ZodError',
    ],
  });

  console.log("✅ Sentry inicializado:", {
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE || "0.1",
  });
}

/**
 * Captura exceção manualmente
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Captura mensagem manualmente
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info", context?: Record<string, any>) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Adiciona contexto ao usuário atual
 */
export function setUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

/**
 * Adiciona tags customizadas
 */
export function setTags(tags: Record<string, string>) {
  Sentry.setTags(tags);
}

/**
 * Adiciona contexto extra
 */
export function setContext(name: string, context: Record<string, any>) {
  Sentry.setContext(name, context);
}
