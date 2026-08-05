import { formatCurrency, formatCpfCnpj } from "./format.js";

export interface ContractTemplateData {
  nomeContratante?: string | null;
  cpfContratante?: string | null;
  nomePassageiro?: string | null;
  valorMensal?: number | string | null;
  vencimento?: number | string | null;
  cidadeData?: string | null;
  [key: string]: unknown;
}

export function replaceContractTags(template: string, data: ContractTemplateData): string {
  if (!template) return "";

  const tagReplacements: Record<string, string> = {
    "{{NOME_CONTRATANTE}}": data.nomeContratante || "",
    "{{CPF_CONTRATANTE}}": data.cpfContratante ? formatCpfCnpj(data.cpfContratante) : "",
    "{{NOME_PASSAGEIRO}}": data.nomePassageiro || "",
    "{{VALOR_MENSAL}}": typeof data.valorMensal === "number"
      ? formatCurrency(data.valorMensal)
      : (data.valorMensal ? String(data.valorMensal) : ""),
    "{{VENCIMENTO}}": data.vencimento !== undefined && data.vencimento !== null ? String(data.vencimento) : "",
    "{{CIDADE_DATA}}": data.cidadeData || "",
  };

  let result = template;
  for (const [tag, value] of Object.entries(tagReplacements)) {
    result = result.split(tag).join(value);
  }

  return result;
}
