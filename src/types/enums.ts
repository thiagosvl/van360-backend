
export enum CobrancaStatus {
  PAGO = "pago",
  PENDENTE = "pendente"
}

export enum CobrancaTipoPagamento {
  DINHEIRO = "dinheiro",
  CARTAO_CREDITO = "cartao-credito",
  CARTAO_DEBITO = "cartao-debito",
  TRANSFERENCIA = "transferencia",
  PIX = "PIX",
  BOLETO = "boleto"
}

export enum CobrancaOrigem {
  MANUAL = "manual",
  AUTOMATICA = "automatica",
}

export enum UserType {
  ADMIN = "admin",
  MOTORISTA = "motorista",
  MOTORISTA_AUXILIAR = "motorista_auxiliar",
  MONITOR = "monitor",
  RESPONSAVEL = "responsavel",
}

export enum TipoResponsavel {
  PRINCIPAL = "principal",
  ADICIONAL = "adicional",
}

export enum PushNotificationAction {
  OPEN_HOME = "OPEN_HOME",
  OPEN_SUBSCRIPTION = "OPEN_SUBSCRIPTION",
  OPEN_CONTRACTS = "OPEN_CONTRACTS",
  OPEN_ROUTE = "OPEN_ROUTE",
  OPEN_TEAM = "OPEN_TEAM",
  OPEN_BILLING = "OPEN_BILLING",
  OPEN_PASSENGERS = "OPEN_PASSENGERS",
  OPEN_SCHOOLS = "OPEN_SCHOOLS",
  OPEN_VEHICLES = "OPEN_VEHICLES",
  OPEN_EXPENSES = "OPEN_EXPENSES",
  OPEN_REPORTS = "OPEN_REPORTS",
  OPEN_SETTINGS = "OPEN_SETTINGS",
  OPEN_BIRTHDAYS = "OPEN_BIRTHDAYS",
  OPEN_PASSENGER_REQUESTS = "OPEN_PASSENGER_REQUESTS"
}

export enum NotificationChannelEnum {
  WABA = "WABA",
  FIREBASE = "FIREBASE",
  EVOLUTION = "EVOLUTION",
  SMS = "SMS",
  RESEND = "RESEND",
  TELEGRAM = "TELEGRAM"
}

export enum NotificationQueueStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  SENT = "SENT",
  RETRY_PENDING = "RETRY_PENDING",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED"
}

export enum WabaTemplateNameEnum {
  PAIS_VENCIMENTO_PROXIMO = "van360_pais_vencimento_proximo",
  PAIS_VENCIMENTO_PROXIMO_PIX = "van360_pais_vencimento_proximo_pix",
  PAIS_VENCIMENTO_PROXIMO_SEM_PIX = "van360_pais_vencimento_proximo_sem_pix",
  PAIS_VENCIMENTO_HOJE = "van360_pais_vencimento_hoje",
  PAIS_VENCIMENTO_HOJE_PIX = "van360_pais_vencimento_hoje_pix",
  PAIS_VENCIMENTO_HOJE_SEM_PIX = "van360_pais_vencimento_hoje_sem_pix",
  PAIS_ATRASADO = "van360_pais_atrasado",
  PAIS_ATRASADO_PIX = "van360_pais_atrasado_pix",
  PAIS_ATRASADO_SEM_PIX = "van360_pais_atrasado_sem_pix",
  PAIS_RECIBO = "van360_pais_recibo",
  PAIS_CONTRATO = "van360_pais_contrato",
  MOTORISTA_RENOVACAO_PIX = "van360_motorista_renovacao_pix",
  MOTORISTA_FALHA_CARTAO = "van360_motorista_falha_cartao",
}

export enum WabaComponentTypeEnum {
  HEADER = "header",
  BODY = "body",
  BUTTON = "button"
}

export enum WabaButtonSubTypeEnum {
  URL = "url",
  QUICK_REPLY = "quick_reply",
  PAYMENT = "payment",
  PAYMENT_REQUEST = "payment_request",
  COPY_CODE = "copy_code"
}

export enum WabaParameterTypeEnum {
  TEXT = "text",
  CURRENCY = "currency",
  DATE_TIME = "date_time",
  DOCUMENT = "document",
  IMAGE = "image",
  ACTION = "action"
}

export enum WabaPaymentTypeEnum {
  PIX_DYNAMIC_CODE = "pix_dynamic_code",
  PIX_STATIC_CODE = "pix_static_code"
}

export enum WabaPixKeyTypeEnum {
  CPF = "CPF",
  CNPJ = "CNPJ",
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  EVP = "EVP"
}

export enum EvolutionConnectionStatus {
  // Estados Legados/Gerais
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",

  // Estados Oficiais Evolution v2
  OPEN = "open",
  CLOSE = "close",
  REFUSED = "refused",

  // Estados Internos do Sistema
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND"
}

export enum EvolutionPurpose {
  TRANSACTIONAL = "TRANSACTIONAL",
  BULK = "BULK"
}

export enum EvolutionEvent {
  // Eventos recebidos no Webhook (Lowercase/Dot notation)
  CONNECTION_UPDATE = "connection.update",
  MESSAGES_UPSERT = "messages.upsert",      // Novo na v2 para novas mensagens
  MESSAGES_UPDATE = "messages.update",      // Status da mensagem
  SEND_MESSAGE = "send.message",
  QRCODE_UPDATED = "qrcode.updated",
  LOGOUT_INSTANCE = "logout.instance",

  // Eventos para Configuração (Uppercase/Underscore - para setWebhook)
  _CONNECTION_UPDATE = "CONNECTION_UPDATE",
  _MESSAGES_UPSERT = "MESSAGES_UPSERT",
  _MESSAGES_UPDATE = "MESSAGES_UPDATE",
  _SEND_MESSAGE = "SEND_MESSAGE",
  _QRCODE_UPDATED = "QRCODE_UPDATED",
  _LOGOUT_INSTANCE = "LOGOUT_INSTANCE",
}

export enum EvolutionMediaType {
  TEXT = "text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document"
}

export enum EvolutionIntegration {
  BAILEYS = "WHATSAPP-BAILEYS"
}

export enum ConfigKey {
  PASSAGEIRO_DIAS_AVISO_VENCIMENTO = "PASSAGEIRO_DIAS_AVISO_VENCIMENTO",
  SAAS_DIAS_VENCIMENTO = "SAAS_DIAS_VENCIMENTO",
  SAAS_DIAS_CARENCIA = "SAAS_DIAS_CARENCIA",
  SAAS_DIAS_AVISO_TRIAL = "SAAS_DIAS_AVISO_TRIAL",
  SAAS_PROMOCAO_ATIVA = "SAAS_PROMOCAO_ATIVA",
  SAAS_MAX_TENTATIVAS_CARTAO = "SAAS_MAX_TENTATIVAS_CARTAO",
  SAAS_REFERRAL_BONUS_DAYS = "SAAS_REFERRAL_BONUS_DAYS",
  SAAS_REFERRAL_DISCOUNT_PCT = "SAAS_REFERRAL_DISCOUNT_PCT",
  SAAS_DIAS_ANTECEDENCIA_RENOVACAO = "SAAS_DIAS_ANTECEDENCIA_RENOVACAO",
}

export enum ContratoStatus {
  RASCUNHO = "rascunho",
  PENDENTE = "pendente",
  ASSINADO = "assinado",
  SUBSTITUIDO = "substituido"
}

export enum DriverContractConfigStatus {
  NAO_CONFIGURADO = "NAO_CONFIGURADO",
  ATIVO = "ATIVO",
  DESATIVADO = "DESATIVADO"
}

export enum PassageiroModalidade {
  IDA = "ida",
  VOLTA = "volta",
  IDA_VOLTA = "ida_volta"
}

export enum PassageiroGenero {
  MASCULINO = "masculino",
  FEMININO = "feminino",
}

export enum ParentescoResponsavel {
  PAI = "pai",
  MAE = "mae",
  AVO = "avo",
  TIO = "tio",
  IRMAO = "irmao",
  PRIMO = "primo",
  PADRASTRO = "padrastro",
  MADRASTA = "madrasta",
  RESPONSAVEL_LEGAL = "responsavel_legal",
  OUTRO = "outro"
}

export enum ContratoProvider {
  INHOUSE = "inhouse",
  ASSINAFY = "assinafy",
  DOCUSIGN = "docusign",
  IMPORTADO = "importado"
}

export enum SubscriptionStatus {
  TRIAL = "TRIAL",
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",
  CANCELED = "CANCELED",
  EXPIRED = "EXPIRED"
}

export const STATUS_ASSINATURA_LIBERADA = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE
];

export enum SubscriptionInvoiceStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  CANCELED = "CANCELED",
  FAILED = "FAILED"
}

export enum SubscriptionIdentifer {
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY"
}

export enum IndicacaoStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED"
}

export enum CheckoutPaymentMethod {
  PIX = "pix",
  CREDIT_CARD = "credit_card"
}

export enum PaymentProvider {
  EFIPAY = "efipay",
  WOOVI = "woovi"
}

export enum ContractMultaTipo {
  PERCENTUAL = "percentual",
  FIXO = "fixo"
}

export enum PeriodoEnum {
  MANHA = "manha",
  TARDE = "tarde",
  NOITE = "noite",
  INTEGRAL = "integral"
}

export enum GastoCategoria {
  COMBUSTIVEL = "combustivel",
  MANUTENCAO = "manutencao",
  IMPOSTOS = "impostos",
  MULTAS = "multas",
  LAVAGEM = "lavagem",
  ALIMENTACAO = "alimentacao",
  SEGURO = "seguro",
  OUTROS = "outros"
}

export enum AtividadeEntidadeTipo {
  COBRANCA = "COBRANCA",
  PASSAGEIRO = "PASSAGEIRO",
  USUARIO = "USUARIO",
  GASTO = "GASTO",
  VEICULO = "VEICULO",
  ESCOLA = "ESCOLA",
  CONTRATO = "CONTRATO",
  SAAS_ASSINATURA = "SAAS_ASSINATURA",
  SAAS_FATURA = "SAAS_FATURA",
  BLOG_POST = "BLOG_POST",
  ROTA = "ROTA",
}

export enum AtividadeAcao {
  // Financeiro
  COBRANCA_CRIADA = "COBRANCA_CRIADA",
  COBRANCA_EDITADA = "COBRANCA_EDITADA",
  COBRANCA_EXCLUIDA = "COBRANCA_EXCLUIDA",
  PAGAMENTO_MANUAL = "PAGAMENTO_MANUAL",
  PAGAMENTO_REVERTIDO = "PAGAMENTO_REVERTIDO",
  NOTIFICACAO_EVOLUTION = "NOTIFICACAO_EVOLUTION",
  NOTIFICACAO_WABA = "NOTIFICACAO_WABA",
  CONFIG_LEMBRETE = "CONFIG_LEMBRETE",

  // Passageiro
  PASSAGEIRO_CRIADO = "PASSAGEIRO_CRIADO",
  PASSAGEIRO_EDITADO = "PASSAGEIRO_EDITADO",
  PASSAGEIRO_STATUS = "PASSAGEIRO_STATUS",
  PASSAGEIRO_EXCLUIDO = "PASSAGEIRO_EXCLUIDO",
  PRE_CADASTRO_CRIADO = "PRE_CADASTRO_CRIADO",
  PRE_CADASTRO_CONCLUIDO = "PRE_CADASTRO_CONCLUIDO",

  // Perfil / Sistema
  CHAVE_PIX_ALTERADA = "CHAVE_PIX_ALTERADA",
  PERFIL_EDITADO = "PERFIL_EDITADO",
  CONFIGURACES_EDITADAS = "CONFIGURACES_EDITADAS",
  CONTRATO_CONFIG_EDITADA = "CONTRATO_CONFIG_EDITADA",
  CONTRATO_GERADO = "CONTRATO_GERADO",
  CONTRATO_ASSINADO = "CONTRATO_ASSINADO",
  CONTRATO_IMPORTADO = "CONTRATO_IMPORTADO",
  CONTRATO_EXCLUIDO = "CONTRATO_EXCLUIDO",
  USUARIO_SUSPENSO = "USUARIO_SUSPENSO",
  EVOLUTION_STATUS_ALTERADO = "EVOLUTION_STATUS_ALTERADO",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  SENHA_ALTERADA = "SENHA_ALTERADA",
  RECUPERACAO_SENHA = "RECUPERACAO_SENHA",

  // Operacional
  GASTO_REGISTRADO = "GASTO_REGISTRADO",
  GASTO_EDITADO = "GASTO_EDITADO",
  GASTO_EXCLUIDO = "GASTO_EXCLUIDO",
  VEICULO_CRIADO = "VEICULO_CRIADO",
  VEICULO_EDITADO = "VEICULO_EDITADO",
  VEICULO_STATUS = "VEICULO_STATUS",
  VEICULO_EXCLUIDO = "VEICULO_EXCLUIDO",
  ESCOLA_CRIADA = "ESCOLA_CRIADA",
  ESCOLA_EDITADA = "ESCOLA_EDITADA",
  ESCOLA_STATUS = "ESCOLA_STATUS",
  ESCOLA_EXCLUIDA = "ESCOLA_EXCLUIDA",
  ROTA_CRIADA = "ROTA_CRIADA",
  ROTA_EDITADA = "ROTA_EDITADA",
  ROTA_EXCLUIDA = "ROTA_EXCLUIDA",
  ROTA_INICIADA = "ROTA_INICIADA",
  ROTA_CONCLUIDA = "ROTA_CONCLUIDA",
  ROTA_CANCELADA = "ROTA_CANCELADA",

  // SaaS / Assinaturas
  SAAS_ASSINATURA_ATIVA = "SAAS_ASSINATURA_ATIVA",
  SAAS_ASSINATURA_CANCELADA = "SAAS_ASSINATURA_CANCELADA",
  SAAS_ASSINATURA_ATRASO = "SAAS_ASSINATURA_ATRASO",
  SAAS_ASSINATURA_EXPIRADA = "SAAS_ASSINATURA_EXPIRADA",
  SAAS_PAGAMENTO_RECEBIDO = "SAAS_PAGAMENTO_RECEBIDO",
  SAAS_REFERRAL_BONUS_RECEIVED = "SAAS_REFERRAL_BONUS_RECEIVED",
  SAAS_FATURA_GERADA = "SAAS_FATURA_GERADA",
  SAAS_FATURA_RECUSADA = "SAAS_FATURA_RECUSADA"
}

export enum TipoChavePix {
  CPF = "CPF",
  CNPJ = "CNPJ",
  EMAIL = "EMAIL",
  TELEFONE = "TELEFONE",
  ALEATORIA = "ALEATORIA"
}

export enum CronJob {
  DAILY_SUBSCRIPTION_MONITOR = "daily-subscription-monitor",
  SUBSCRIPTION_CHECK = "subscription-check",
  SUBSCRIPTION_GENERATOR = "subscription-generator",
  CHARGE_GENERATOR = "charge-generator",
  DAILY_CHARGE_MONITOR = "daily-charge-monitor",
  BIRTHDAY_REMINDER = "birthday-reminder",
  WEEKLY_DRIVER_CHARGE_SUMMARY = "weekly-driver-charge-summary",
  NOTIFICATION_RETRY = "notification-retry",
}

export enum RouteExecutionStatus {
  INICIADA = "iniciada",
  CONCLUIDA = "concluida",
  CANCELADA = "cancelada"
}

export enum RouteStopStatus {
  PENDENTE = "pendente",
  EMBARCADO = "embarcado",
  DESEMBARCADO = "desembarcado",
  AUSENTE = "ausente"
}

export enum RouteNodeType {
  PASSAGEIRO = "passageiro",
  ESCOLA = "escola"
}

export enum RouteSentido {
  INDO = "indo",
  VOLTANDO = "voltando"
}

export enum CanalAquisicao {
  PLAY_STORE = "PLAY_STORE",
  APP_STORE = "APP_STORE",
  INDICACAO = "INDICACAO",
  PANFLETO = "PANFLETO",
  INSTAGRAM = "INSTAGRAM",
  FACEBOOK = "FACEBOOK",
  TIKTOK = "TIKTOK",
  YOUTUBE = "YOUTUBE",
  GOOGLE = "GOOGLE",
  OUTROS = "OUTROS"
}

export enum BlogPostStatus {
  DRAFT = "draft",
  PUBLISHED = "published"
}

export enum GastoTipoCalculoParcela {
  TOTAL = "total",
  PARCELA = "parcela",
}

export enum GastoEscopoAcao {
  UNICA = "unica",
  FUTURAS = "futuras",
  TODAS = "todas",
}

export enum DispositivoCadastro {
  APP_ANDROID = "APP_ANDROID",
  APP_IOS = "APP_IOS",
  WEB_MOBILE_ANDROID = "WEB_MOBILE_ANDROID",
  WEB_MOBILE_IOS = "WEB_MOBILE_IOS",
  WEB_DESKTOP = "WEB_DESKTOP",
}

export enum RouteBroadcastEvent {
  ROUTE_EXECUTION_CHANGED = "route_execution_changed",
  ROUTE_DEFINITION_CHANGED = "route_definition_changed",
  STOP_STATUS_CHANGED = "stop_status_changed",
  ABSENCE_CHANGED = "absence_changed"
}

export enum RoutePermission {
  VISUALIZAR = "rotas.visualizar",
  CRIAR_EDITAR = "rotas.criar_editar",
  EXCLUIR = "rotas.excluir",
  INICIAR_ENCERRAR = "rotas.iniciar_encerrar",
  EXECUTAR_PARADAS = "rotas.executar_paradas"
}

