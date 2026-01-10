
export enum BillingMode {
  MANUAL = "manual",
  AUTOMATICO = "automatico"
}

export enum SubscriptionBillingType {
  SUBSCRIPTION = "subscription",
  UPGRADE_PLAN = "upgrade_plan",
  DOWNGRADE = "downgrade",
  ACTIVATION = "activation",
  EXPANSION = "expansion"
}

export enum CobrancaOrigem {
  INTER = "inter",
  MANUAL = "manual",
  AUTOMATICA = "automatica"
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
