export const nomes = [
    "Miguel", "Arthur", "Gael", "Théo", "Heitor", "Ravi", "Davi", "Bernardo", "Noah", "Gabriel",
    "Helena", "Alice", "Laura", "Maria Alice", "Sophia", "Manuela", "Maitê", "Liz", "Cecília", "Isabella"
];

export const sobrenomes = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
    "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa"
];

export const ruas = [
    "Rua das Flores", "Avenida Paulista", "Rua Augusta", "Avenida Brasil", "Rua da Consolação",
    "Rua Oscar Freire", "Avenida Faria Lima", "Rua Haddock Lobo", "Rua Bela Cintra", "Alameda Santos"
];

export const bairros = [
    "Centro", "Jardins", "Vila Madalena", "Pinheiros", "Moema", "Itaim Bibi", "Brooklin", "Vila Olímpia", "Perdizes", "Pompeia"
];

export const cidades = [
    { nome: "São Paulo", estado: "SP" },
    { nome: "Rio de Janeiro", estado: "RJ" },
    { nome: "Belo Horizonte", estado: "MG" },
    { nome: "Curitiba", estado: "PR" },
    { nome: "Porto Alegre", estado: "RS" }
];

export const escolas = [
    { nome: "Ibrahim Nobre", cep: "04410-080", logradouro: "Rua das Flores", numero: "123", bairro: "Centro", cidade: "São Paulo", estado: "SP" },
    { nome: "Joanna Abraão", cep: "01310-100", logradouro: "Avenida Paulista", numero: "1578", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP" },
    { nome: "Colégio Objetivo", cep: "01311-200", logradouro: "Avenida Brigadeiro", numero: "100", bairro: "Paraíso", cidade: "São Paulo", estado: "SP" }
];

export const veiculos = [
    { placa: "ABC-1234", modelo: "Ducato", marca: "Fiat" },
    { placa: "DEF-5678", modelo: "Spin", marca: "Chevrolet" },
];

export const randomNumber = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

const createCPFDigit = (cpfPartial: string) => {
    let sum = 0;
    let weight = cpfPartial.length + 1;
    for (let i = 0; i < cpfPartial.length; i++) sum += parseInt(cpfPartial[i]) * weight--;
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
};

export const generateCPF = (formatted = false): string => {
    const n = Array.from({ length: 9 }, () => randomNumber(0, 9)).join('');
    let cpf = n;
    cpf += createCPFDigit(cpf);
    cpf += createCPFDigit(cpf);
    if (formatted) return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return cpf;
};

export const generateName = (): string => `${nomes[randomNumber(0, nomes.length - 1)]} ${sobrenomes[randomNumber(0, sobrenomes.length - 1)]} ${sobrenomes[randomNumber(0, sobrenomes.length - 1)]}`;

export const generateAddress = () => {
    const cidade = cidades[randomNumber(0, cidades.length - 1)];
    return {
        logradouro: ruas[randomNumber(0, ruas.length - 1)],
        numero: randomNumber(1, 9999).toString(),
        bairro: bairros[randomNumber(0, bairros.length - 1)],
        cidade: cidade.nome,
        estado: cidade.estado,
        cep: `${randomNumber(10000, 99999)}-${randomNumber(100, 999)}`,
        referencia: "Perto do mercado",
    };
};

export const generateValorCobranca = (): number => [150, 180, 200, 220, 250, 300, 350][randomNumber(0, 6)];
