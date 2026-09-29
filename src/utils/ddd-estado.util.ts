export interface EstadoInfo {
  uf: string;
  nome: string;
  regiao: string;
}

const DDD_ESTADO_MAP: Record<string, EstadoInfo> = {
  "11": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "12": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "13": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "14": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "15": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "16": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "17": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "18": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },
  "19": { uf: "SP", nome: "São Paulo", regiao: "Sudeste" },

  "21": { uf: "RJ", nome: "Rio de Janeiro", regiao: "Sudeste" },
  "22": { uf: "RJ", nome: "Rio de Janeiro", regiao: "Sudeste" },
  "24": { uf: "RJ", nome: "Rio de Janeiro", regiao: "Sudeste" },

  "27": { uf: "ES", nome: "Espírito Santo", regiao: "Sudeste" },
  "28": { uf: "ES", nome: "Espírito Santo", regiao: "Sudeste" },

  "31": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "32": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "33": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "34": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "35": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "37": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  "38": { uf: "MG", nome: "Minas Gerais", regiao: "Sudeste" },

  "41": { uf: "PR", nome: "Paraná", regiao: "Sul" },
  "42": { uf: "PR", nome: "Paraná", regiao: "Sul" },
  "43": { uf: "PR", nome: "Paraná", regiao: "Sul" },
  "44": { uf: "PR", nome: "Paraná", regiao: "Sul" },
  "45": { uf: "PR", nome: "Paraná", regiao: "Sul" },
  "46": { uf: "PR", nome: "Paraná", regiao: "Sul" },

  "47": { uf: "SC", nome: "Santa Catarina", regiao: "Sul" },
  "48": { uf: "SC", nome: "Santa Catarina", regiao: "Sul" },
  "49": { uf: "SC", nome: "Santa Catarina", regiao: "Sul" },

  "51": { uf: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },
  "53": { uf: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },
  "54": { uf: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },
  "55": { uf: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },

  "61": { uf: "DF", nome: "Distrito Federal", regiao: "Centro-Oeste" },
  "62": { uf: "GO", nome: "Goiás", regiao: "Centro-Oeste" },
  "64": { uf: "GO", nome: "Goiás", regiao: "Centro-Oeste" },
  "63": { uf: "TO", nome: "Tocantins", regiao: "Norte" },
  "65": { uf: "MT", nome: "Mato Grosso", regiao: "Centro-Oeste" },
  "66": { uf: "MT", nome: "Mato Grosso", regiao: "Centro-Oeste" },
  "67": { uf: "MS", nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  "68": { uf: "AC", nome: "Acre", regiao: "Norte" },
  "69": { uf: "RO", nome: "Rondônia", regiao: "Norte" },

  "71": { uf: "BA", nome: "Bahia", regiao: "Nordeste" },
  "73": { uf: "BA", nome: "Bahia", regiao: "Nordeste" },
  "74": { uf: "BA", nome: "Bahia", regiao: "Nordeste" },
  "75": { uf: "BA", nome: "Bahia", regiao: "Nordeste" },
  "77": { uf: "BA", nome: "Bahia", regiao: "Nordeste" },

  "79": { uf: "SE", nome: "Sergipe", regiao: "Nordeste" },

  "81": { uf: "PE", nome: "Pernambuco", regiao: "Nordeste" },
  "87": { uf: "PE", nome: "Pernambuco", regiao: "Nordeste" },

  "82": { uf: "AL", nome: "Alagoas", regiao: "Nordeste" },
  "83": { uf: "PB", nome: "Paraíba", regiao: "Nordeste" },
  "84": { uf: "RN", nome: "Rio Grande do Norte", regiao: "Nordeste" },

  "85": { uf: "CE", nome: "Ceará", regiao: "Nordeste" },
  "88": { uf: "CE", nome: "Ceará", regiao: "Nordeste" },

  "86": { uf: "PI", nome: "Piauí", regiao: "Nordeste" },
  "89": { uf: "PI", nome: "Piauí", regiao: "Nordeste" },

  "91": { uf: "PA", nome: "Pará", regiao: "Norte" },
  "93": { uf: "PA", nome: "Pará", regiao: "Norte" },
  "94": { uf: "PA", nome: "Pará", regiao: "Norte" },

  "92": { uf: "AM", nome: "Amazonas", regiao: "Norte" },
  "97": { uf: "AM", nome: "Amazonas", regiao: "Norte" },

  "95": { uf: "RR", nome: "Roraima", regiao: "Norte" },
  "96": { uf: "AP", nome: "Amapá", regiao: "Norte" },

  "98": { uf: "MA", nome: "Maranhão", regiao: "Nordeste" },
  "99": { uf: "MA", nome: "Maranhão", regiao: "Nordeste" },
};

export function extrairDddTelefone(telefone?: string | null): string | null {
  if (!telefone) return null;

  const apenasDigitos = telefone.replace(/\D/g, "");
  if (!apenasDigitos) return null;

  let numeroLimpo = apenasDigitos;
  if (numeroLimpo.length >= 12 && numeroLimpo.startsWith("55")) {
    numeroLimpo = numeroLimpo.slice(2);
  }

  if (numeroLimpo.length < 10) return null;

  const ddd = numeroLimpo.slice(0, 2);
  return ddd in DDD_ESTADO_MAP ? ddd : null;
}

export function obterEstadoPorDdd(ddd: string | null): EstadoInfo {
  if (!ddd || !(ddd in DDD_ESTADO_MAP)) {
    return {
      uf: "NI",
      nome: "Não identificado",
      regiao: "Outros",
    };
  }

  return DDD_ESTADO_MAP[ddd];
}
