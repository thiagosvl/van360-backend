# 🔭 Observabilidade - Van360

## 📋 Visão Geral

Este documento descreve a estratégia completa de observabilidade do Van360.

---

## 🚀 Configuração Rápida (10 minutos)

### Passo 1: Criar Contas (Gratuitas)

#### 1.1 Sentry (Error Tracking)
1. Acesse: https://sentry.io/signup/
2. Crie projeto Node.js chamado "Van360 API"
3. Copie o DSN em Settings > Client Keys

#### 1.2 Better Stack / Logtail (Logs)
1. Acesse: https://betterstack.com/logtail
2. Crie source "Van360 API"
3. Copie o Source Token

### Passo 2: Configurar Variáveis de Ambiente

Adicione no arquivo .env:

```env
# Observabilidade
SENTRY_DSN=https://abc123@o123.ingest.sentry.io/456
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

LOGTAIL_TOKEN=abc123def456ghi789

LOG_LEVEL=info
```

### Passo 3: Reiniciar Servidor

```bash
npm run build
pm2 restart ecosystem.config.js
pm2 logs van360-api --lines 20
```

Você deve ver:
- ✅ Sentry inicializado
- ✅ Logger configurado com Better Stack

---

## 📊 Como Usar

### 1. Visualizar Logs (Better Stack)
- Acesse: https://logs.betterstack.com
- Live Tail: logs em tempo real
- Search: busque por erro, usuário, endpoint

### 2. Rastrear Erros (Sentry)
- Acesse: https://sentry.io
- Issues: veja todos os erros
- Performance: veja performance da API

---

## 🚨 Configurar Alertas

### Sentry:
1. Settings > Alerts
2. Crie alerta para erros críticos
3. Configure notificação (Discord/Slack/Email)

### Better Stack:
1. Alerts > Create Alert
2. Configure query (ex: message:"DISCONNECTED")
3. Configure notificação

---

## 💰 Custos

| Mês | Motoristas | Custo |
|-----|------------|-------|
| 1-2 | 10-20 | R$ 0 |
| 3-4 | 30-50 | R$ 50 |
| 5-6 | 60-100 | R$ 125 |

ROI: Economiza ~5h/semana = R$ 1.000/mês

---

## 🛠️ Troubleshooting

### Logs não aparecem no Logtail
```bash
cat .env | grep LOGTAIL_TOKEN
pm2 logs van360-api | grep "Logger configurado"
```

### Erros não aparecem no Sentry
```bash
cat .env | grep SENTRY_DSN
pm2 logs van360-api | grep "Sentry inicializado"
```

---

**Última atualização:** 2026-01-27
