import { ContractMultaTipo } from "./enums.js";

export interface ContractGenerationParams {
  contratoId: string;
  templateId?: string;
  dadosContrato: DadosContrato;
}

export interface DadosContrato {
  // Dados do passageiro
  nomePassageiro: string;
  nomeResponsavel: string;
  cpfResponsavel: string;
  telefoneResponsavel: string;
  emailResponsavel: string;
  parentescoResponsavel?: string;
  enderecoCompleto: string;
  
  // Dados da escola
  nomeEscola: string;
  enderecoEscola: string;
  
  // Dados do serviço
  periodo: string; // "Integral", "Manhã", "Tarde"
  modalidade: string; // "Ida e Volta", "Só Ida", "Só Volta"
  valorMensal: number;
  diaVencimento: number;
  
  // Condições do Período e Valor (Ano vigente)
  ano: number;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  valorTotal: number;
  qtdParcelas: number;
  valorParcela: number;

  // Multas
  multaAtraso: {
    valor: number;
    tipo: ContractMultaTipo;
  };
  multaRescisao: {
    valor: number;
    tipo: ContractMultaTipo;
  };
  
  // Dados do condutor
  nomeCondutor: string;
  cpfCnpjCondutor: string;
  telefoneCondutor: string;
  apelidoCondutor?: string;
  
  // Dados do veículo
  placaVeiculo: string;
  modeloVeiculo: string;

  // Configurações personalizadas
  clausulas?: string[];
  assinaturaCondutorUrl?: string;
}


export interface ContractGenerationResponse {
  documentUrl?: string; // URL do PDF gerado (in-house)
  providerDocumentId?: string; // ID no provedor externo
  providerSignatureLink?: string; // Link de assinatura do provedor
}

export interface ContractSignatureParams {
  contratoId: string;
  assinaturaBase64?: string; // Para in-house
  nomeAssinante?: string;
  cpfAssinante?: string;
  metadados: SignatureMetadata;
}

export interface SignatureMetadata {
  ip: string;
  userAgent: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}

export interface ContractSignatureResponse {
  documentoFinalUrl: string;
  assinadoEm: string;
}

export interface ContractProvider {
  name: string;
  
  // Gerar contrato (minuta)
  gerarContrato(params: ContractGenerationParams): Promise<ContractGenerationResponse>;
  
  // Processar assinatura
  processarAssinatura(params: ContractSignatureParams): Promise<ContractSignatureResponse>;
  
  // Cancelar contrato
  cancelarContrato(contratoId: string): Promise<boolean>;
  
  // Consultar status
  consultarStatus(contratoId: string): Promise<unknown>;
  
  // Baixar documento final
  baixarDocumento(contratoId: string): Promise<Buffer>;
}
