
export enum BillingMode {
  MANUAL = "manual",
  AUTOMATICO = "automatico"
}

export enum SubscriptionBillingType {
  SUBSCRIPTION = "subscription",
  UPGRADE_PLAN = "upgrade_plan", // Código atual (Manter ou alinhar com DB se db tiver 'upgrade_plan') -> DB tem 'upgrade_plan'
  UPGRADE = "upgrade", // DB has 'upgrade'
  DOWNGRADE = "downgrade",
  ACTIVATION = "activation",
  EXPANSION = "expansion",
  RENEWAL = "renewal",
  SCHOOL_FEE = "school_fee"
}

export enum CobrancaOrigem {
  INTER = "inter",
  MANUAL = "manual",
  AUTOMATICA = "automatica",
  // Adicionando job_renovacao que apareceu no codigo
  JOB_RENOVACAO = "job_renovacao"
}

export enum CobrancaTipo {
  MENSALIDADE = "mensalidade",
  AVULSA = "avulsa"
}

export enum PaymentMethod {
  PIX = "PIX",
  BOLETO = "BOLETO",
  CARTAO = "CARTAO"
}

export enum DesativacaoMotivo {
  MANUAL = "manual",
  AUTOMATICO = "automatico",
  INADIMPLENCIA = "inadimplencia"
}

export enum UserType {
  ADMIN = "admin",
  MOTORISTA = "motorista",
  RESPONSAVEL = "responsavel",
  ESCOLA = "escola"
}

export enum WhatsappStatus {
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND"
}
