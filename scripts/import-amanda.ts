import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin as defaultClient } from "../src/config/supabase.js";
import type { Database } from "../src/types/database.types.js";

type EscolaInsert = Database["public"]["Tables"]["escolas"]["Insert"];
type VeiculoInsert = Database["public"]["Tables"]["veiculos"]["Insert"];
type ResponsavelInsert = Database["public"]["Tables"]["responsaveis"]["Insert"];
type PassageiroInsert = Database["public"]["Tables"]["passageiros"]["Insert"];
type PassageiroResponsavelInsert = Database["public"]["Tables"]["passageiro_responsaveis"]["Insert"];

const IS_PROD = process.argv.includes("--prod");
const PROD_USER_ID = "1cceb472-dcc2-45d4-8852-79b8e1b67e28";
const DEV_PHONE = "11951186951";

const prodUrlArg = process.argv.find((a) => a.startsWith("--url="))?.replace("--url=", "") || process.env.SUPABASE_PROD_URL || "https://scxjzvblqnamfvasjaug.supabase.co";
const prodKeyArg = process.argv.find((a) => a.startsWith("--key="))?.replace("--key=", "") || process.env.SUPABASE_PROD_SERVICE_KEY;

const supabase = (IS_PROD && prodKeyArg)
  ? createClient<Database>(prodUrlArg, prodKeyArg, { auth: { persistSession: false } })
  : defaultClient;

interface EscolaDef {
  nome: string;
  aliases: string[];
}

const ESCOLAS_CONFIG: EscolaDef[] = [
  {
    nome: "Colégio Municipal Adriano T. de Santana",
    aliases: ["adriano teixeira", "adriano t"],
  },
  {
    nome: "Colégio Municipal Dona Celina da Costa Machado Silva",
    aliases: ["dona celina da costa machado", "celina da costa machado", "dona celina"],
  },
  {
    nome: "Colégio Municipal Dr. Álvaro Ribeiro",
    aliases: ["alvaro ribeiro", "dr. álvaro ribeiro", "dr alvaro ribeiro"],
  },
  {
    nome: "Colégio Municipal Governador Mário Covas Júnior",
    aliases: ["mário covas", "mario covas"],
  },
  {
    nome: "Colégio Municipal Holmes Villar",
    aliases: ["holmmes villar", "holmes villar"],
  },
  {
    nome: "Colégio Municipal Montanha Encantada",
    aliases: ["montanha encantada"],
  },
  {
    nome: "Colégio Municipal Pingo de Gente",
    aliases: ["pingo de gente"],
  },
  {
    nome: "Colégio Municipal Presidente Tancredo de Almeida Neves",
    aliases: ["tancredo de almeida neves", "tancredo neves"],
  },
  {
    nome: "Colégio Municipal Prof. Aldônio Ramos Teixeira",
    aliases: ["aldonio ramos teixeira", "aldônio ramos teixeira"],
  },
  {
    nome: "Colégio Municipal Profª Daisy Moraes Chaves Nicolas",
    aliases: ["daisy moraes chaves", "daisy moraes"],
  },
  {
    nome: "Colégio Municipal Profª Maria Apparecida de Miranda",
    aliases: ["maria aparecida de miranda", "maria apparecida de miranda"],
  },
  {
    nome: "Colégio Municipal Senhora Gabriele D'Alessandro",
    aliases: ["gabriele de alessandro", "gabriele d'alessandro", "gabriele dalessandro"],
  },
  {
    nome: "Escola Espaço Renovare",
    aliases: ["renovare particular", "renovare", "espaço renovare"],
  },
];

interface VeiculoDef {
  placa: string;
  aliases: string[];
}

const VEICULOS_CONFIG: VeiculoDef[] = [
  {
    placa: "EWU3378",
    aliases: ["ewu-3378", "ewu3378"],
  },
  {
    placa: "TJR0D18",
    aliases: ["tjr-0d18", "tjr0d18"],
  },
  {
    placa: "ECV3E49",
    aliases: ["ecv-3449", "ecv3449", "ecv3e49"],
  },
];

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ";" && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function cleanDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function parseDateBR(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim();
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

function normalizeModalidade(val: string | null | undefined): "ida" | "volta" | "ida_volta" {
  if (!val) return "ida_volta";
  const s = val.toLowerCase().trim();
  if (s === "ida") return "ida";
  if (s.includes("só volta") || s === "volta") return "volta";
  return "ida_volta";
}

function normalizePeriodo(val: string | null | undefined): "manha" | "tarde" | "integral" | "noite" {
  if (!val) return "manha";
  const s = val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (s.includes("tarde")) return "tarde";
  if (s.includes("integral")) return "integral";
  if (s.includes("noite")) return "noite";
  return "manha";
}

function cleanTurmaSala(serieRaw: string | null | undefined, turmaRaw: string | null | undefined): { turma: string | null; sala: string | null } {
  let s = (serieRaw || "").trim();
  let t = (turmaRaw || "").trim();

  if (!s && !t) return { turma: null, sala: null };
  if (!s) return { turma: t, sala: null };
  if (!t) return { turma: s, sala: null };

  if (s.toLowerCase() === t.toLowerCase()) {
    return { turma: s, sala: null };
  }

  if (/ainda n[aã]o sei|a decidir|^0$/i.test(t)) {
    return { turma: s, sala: null };
  }

  if (/^[A-Za-z]$/.test(t)) {
    if (s.toLowerCase().endsWith(t.toLowerCase())) {
      return { turma: s, sala: null };
    }
    return { turma: `${s} ${t}`.trim(), sala: null };
  }

  const salaMatch = t.match(/sala\s*([0-9a-zA-Z]+)/i) || s.match(/sala\s*([0-9a-zA-Z]+)/i);
  const sala = salaMatch ? salaMatch[1] : null;

  if (/ano|série/i.test(t) && /ano|série/i.test(s)) {
    return { turma: t, sala: null };
  }

  if (/^(abelha|pantera|rubi|gato|coruja|le[aã]o|elefante|borboleta|diamante|panda)$/i.test(t)) {
    return { turma: `${s} (${t})`, sala: null };
  }

  if (sala && t.toLowerCase().startsWith("sala")) {
    return { turma: s, sala };
  }

  return { turma: `${s} ${t}`.trim(), sala: null };
}

function resolveEscolaId(escolaName: string, mapEscolas: Map<string, string>): string {
  const s = escolaName.toLowerCase().trim();
  for (const [alias, id] of mapEscolas.entries()) {
    if (s.includes(alias) || alias.includes(s)) {
      return id;
    }
  }
  const firstId = mapEscolas.values().next().value;
  return firstId || "";
}

function resolveVeiculoId(
  veiculoStr: string,
  escolaStr: string,
  mapVeiculos: Map<string, string>
): string {
  const v = veiculoStr.toLowerCase().trim();
  for (const [alias, id] of mapVeiculos.entries()) {
    if (v.includes(alias)) {
      return id;
    }
  }

  const e = escolaStr.toLowerCase();
  if (e.includes("gabriele")) {
    return mapVeiculos.get("ewu3378") || "";
  }
  return mapVeiculos.get("ecv3e49") || mapVeiculos.get("tjr0d18") || "";
}

async function run() {
  console.log("=================================================");
  console.log(`   IMPORTAÇÃO DE CADASTROS - TIA AMANDA (${IS_PROD ? "PRODUÇÃO" : "DEV"})`);
  console.log("=================================================\n");

  let usuarioId = PROD_USER_ID;

  if (!IS_PROD) {
    console.log(`[1/4] Buscando usuário pelo telefone em DEV: ${DEV_PHONE}...`);
    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("id, nome, email")
      .eq("telefone", DEV_PHONE)
      .single();

    if (userError || !usuario) {
      console.error("[ERRO] Usuário não encontrado no banco:", userError);
      process.exit(1);
    }
    usuarioId = usuario.id;
    console.log(`[OK] Usuário identificado: ${usuario.nome} (${usuarioId})\n`);
  } else {
    console.log(`[1/4] Utilizando usuário de PRODUÇÃO: ${PROD_USER_ID} (Amanda Soares Telles Araújo)\n`);
  }

  console.log("[2/4] Vinculando as 13 Escolas e 3 Veículos existentes do usuário...");

  const { data: escolasDb, error: escErr } = await supabase
    .from("escolas")
    .select("id, nome")
    .eq("usuario_id", usuarioId);

  if (escErr || !escolasDb || escolasDb.length === 0) {
    console.error("[ERRO] Nenhuma escola encontrada para o usuário:", escErr);
    process.exit(1);
  }

  const mapEscolas = new Map<string, string>();
  for (const esc of ESCOLAS_CONFIG) {
    const found = escolasDb.find(
      (e) => e.nome.toLowerCase().includes(esc.nome.toLowerCase()) || esc.nome.toLowerCase().includes(e.nome.toLowerCase())
    );
    if (found) {
      mapEscolas.set(esc.nome.toLowerCase(), found.id);
      for (const alias of esc.aliases) {
        mapEscolas.set(alias, found.id);
      }
    }
  }
  console.log(`[OK] ${escolasDb.length} Escolas vinculadas com sucesso.`);

  const { data: veiculosDb, error: veicErr } = await supabase
    .from("veiculos")
    .select("id, placa")
    .eq("usuario_id", usuarioId);

  if (veicErr || !veiculosDb || veiculosDb.length === 0) {
    console.error("[ERRO] Nenhum veículo encontrado para o usuário:", veicErr);
    process.exit(1);
  }

  const mapVeiculos = new Map<string, string>();
  for (const v of VEICULOS_CONFIG) {
    const found = veiculosDb.find((ve) => ve.placa.toUpperCase().replace(/\D/g, "") === v.placa.toUpperCase().replace(/\D/g, "") || ve.placa.toUpperCase() === v.placa.toUpperCase());
    if (found) {
      mapVeiculos.set(v.placa.toLowerCase(), found.id);
      for (const alias of v.aliases) {
        mapVeiculos.set(alias, found.id);
      }
    }
  }
  console.log(`[OK] ${veiculosDb.length} Veículos vinculados com sucesso.\n`);

  console.log("[3/4] Lendo arquivo CSV e preparando os 386 alunos...");
  const csvPath = "C:\\Users\\thiag\\Downloads\\passageiros_Tia_Amanda_Transporte_Escolar_2026 (57).csv";
  if (!fs.existsSync(csvPath)) {
    console.error(`[ERRO] Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const csvRaw = fs.readFileSync(csvPath, "utf8");
  const rawLines = csvRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = rawLines.slice(1).map(parseCSVLine);
  console.log(`[OK] ${rows.length} linhas de alunos carregadas do CSV.\n`);

  console.log("[4/4] Processando alunos e responsáveis...");

  const responsaveisPorChave = new Map<string, string>();

  let totalResponsaveisCriados = 0;
  let totalResponsaveisReutilizados = 0;
  let totalAlunosCriados = 0;
  let totalAlunosAtualizados = 0;
  let totalIsentos = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nomeAluno = r[0]?.trim();
    if (!nomeAluno) continue;

    const cpfCol1 = r[1]?.trim();
    const nomeResp = r[2]?.trim() || r[27]?.trim() || "Responsável Legal";
    const telefone = cleanDigits(r[3]);
    const email = r[4]?.trim() || null;
    const escolaNome = r[5]?.trim() || "";
    const veiculoNome = r[6]?.trim() || "";
    const periodo = normalizePeriodo(r[7]);
    const valorMensalidadeRaw = parseFloat(r[8]?.replace(",", ".") || "0");
    const diaVencimento = parseInt(r[9]?.trim() || "10", 10) || 10;
    const cep = cleanDigits(r[10]) || null;
    const endereco = r[11]?.trim() || null;
    const cidade = r[12]?.trim() || "Santana de Parnaíba";
    const bairro = r[13]?.trim() || null;
    const estado = r[14]?.trim() || "SP";
    const numero = r[15]?.trim() || null;
    const complemento = r[16]?.trim() || null;
    const horarioSaida = r[18]?.trim() || null;
    const serie = r[19]?.trim() || null;
    const turmaRaw = r[20]?.trim() || null;
    const autorizaImagem = r[21]?.trim() || "Não";
    const modalidadeRaw = r[23]?.trim();
    const horarioEntrada = r[24]?.trim() || null;
    const alergias = r[25]?.trim();
    const doencas = r[26]?.trim();
    const cpfRespRaw = r[28]?.trim();
    const dataNascimento = parseDateBR(r[29]);
    const necessidadesEspeciais = r[30]?.trim();
    const telefoneEmergencia = r[31]?.trim() || null;

    let cpfRespLimpo: string | null = null;
    const cpfRespCandidato = cleanDigits(cpfRespRaw);
    const cpfCol1Candidato = cleanDigits(cpfCol1);

    if (cpfRespCandidato.length === 11 && !cpfRespRaw?.includes("E+")) {
      cpfRespLimpo = cpfRespCandidato;
    } else if (cpfCol1Candidato.length === 11 && !cpfCol1?.includes("E+")) {
      cpfRespLimpo = cpfCol1Candidato;
    }

    const chaveResponsavel = cpfRespLimpo ? `cpf_${cpfRespLimpo}` : `tel_${telefone}`;
    let responsavelId: string | undefined = responsaveisPorChave.get(chaveResponsavel);

    if (!responsavelId) {
      if (cpfRespLimpo) {
        const { data: dbRespCpf } = await supabase
          .from("responsaveis")
          .select("id")
          .eq("cpf", cpfRespLimpo)
          .maybeSingle();
        if (dbRespCpf) responsavelId = dbRespCpf.id;
      }

      if (!responsavelId && telefone) {
        const { data: dbRespTel } = await supabase
          .from("responsaveis")
          .select("id")
          .eq("telefone", telefone)
          .maybeSingle();
        if (dbRespTel) responsavelId = dbRespTel.id;
      }

      if (!responsavelId) {
        const respPayload: ResponsavelInsert = {
          nome: nomeResp,
          telefone: telefone || "11999999999",
          cpf: cpfRespLimpo,
          email: email && email.includes("@") ? email : null,
          cep,
          logradouro: endereco,
          numero,
          bairro,
          cidade,
          estado,
          complemento,
        };

        const { data: novoResp, error: errResp } = await supabase
          .from("responsaveis")
          .insert(respPayload)
          .select("id")
          .single();

        if (errResp || !novoResp) {
          console.error(`[ERRO] Falha ao cadastrar responsável de ${nomeAluno}:`, errResp);
          continue;
        }

        responsavelId = novoResp.id;
        totalResponsaveisCriados++;
      } else {
        totalResponsaveisReutilizados++;
      }

      responsaveisPorChave.set(chaveResponsavel, responsavelId);
    } else {
      totalResponsaveisReutilizados++;
    }

    const escolaId = resolveEscolaId(escolaNome, mapEscolas);
    const veiculoId = resolveVeiculoId(veiculoNome, escolaNome, mapVeiculos);
    const modalidade = normalizeModalidade(modalidadeRaw);
    const { turma, sala } = cleanTurmaSala(serie, turmaRaw);

    const isIsento = valorMensalidadeRaw <= 0;
    if (isIsento) totalIsentos++;

    const obsArray: string[] = [];
    if (alergias && alergias.toLowerCase() !== "não" && alergias.toLowerCase() !== "nao" && alergias.toLowerCase() !== "não tem") {
      obsArray.push(`[Alergias]: ${alergias}`);
    }
    if (doencas && doencas.toLowerCase() !== "não" && doencas.toLowerCase() !== "nao" && doencas.toLowerCase() !== "nenhuma") {
      obsArray.push(`[Saúde]: ${doencas}`);
    }
    if (necessidadesEspeciais && necessidadesEspeciais.toLowerCase() !== "não" && necessidadesEspeciais.toLowerCase() !== "nao" && necessidadesEspeciais.toLowerCase() !== "nenhuma") {
      obsArray.push(`[Necessidades Especiais]: ${necessidadesEspeciais}`);
    }
    if (autorizaImagem) {
      obsArray.push(`[Uso de Imagem]: ${autorizaImagem}`);
    }
    if (telefoneEmergencia) {
      obsArray.push(`[Contato Emergência]: ${telefoneEmergencia}`);
    }
    const observacoesPlanilha = obsArray.length > 0 ? obsArray.join(" | ") : null;

    // Regras de Datas acordadas
    const dataInicioCobranca = isIsento ? null : "2026-09-24";
    const dataFimCobranca = isIsento ? null : "2026-12-01";

    const { data: existingAluno } = await supabase
      .from("passageiros")
      .select("id, turma, sala, observacoes, valor_cobranca, dia_vencimento, isento, data_inicio_cobranca, data_fim_cobranca, data_inicio_transporte, data_fim_transporte")
      .eq("usuario_id", usuarioId)
      .ilike("nome", nomeAluno)
      .maybeSingle();

    if (existingAluno) {
      // PRESERVAÇÃO TOTAL: Apenas complementa se estiver nulo no banco
      const updatedObs = existingAluno.observacoes
        ? (observacoesPlanilha ? `${existingAluno.observacoes} | ${observacoesPlanilha}` : existingAluno.observacoes)
        : observacoesPlanilha;

      await supabase
        .from("passageiros")
        .update({
          turma: existingAluno.turma || turma,
          sala: existingAluno.sala || sala,
          observacoes: updatedObs,
          valor_cobranca: existingAluno.valor_cobranca ?? (isIsento ? 0 : valorMensalidadeRaw),
          dia_vencimento: existingAluno.dia_vencimento ?? diaVencimento,
          isento: existingAluno.isento ?? isIsento,
          data_inicio_cobranca: existingAluno.data_inicio_cobranca || dataInicioCobranca,
          data_fim_cobranca: existingAluno.data_fim_cobranca || dataFimCobranca,
        })
        .eq("id", existingAluno.id);

      totalAlunosAtualizados++;
    } else {
      const alunoPayload: PassageiroInsert = {
        usuario_id: usuarioId,
        escola_id: escolaId,
        veiculo_id: veiculoId,
        nome: nomeAluno,
        data_nascimento: dataNascimento,
        periodo,
        modalidade,
        turma,
        sala,
        horario_entrada: horarioEntrada,
        horario_saida: horarioSaida,
        valor_cobranca: isIsento ? 0 : valorMensalidadeRaw,
        dia_vencimento: diaVencimento,
        isento: isIsento,
        observacoes: observacoesPlanilha,
        ativo: true,
        enviar_notificacoes: true,
        ano_letivo: 2026,
        data_inicio_transporte: null,
        data_fim_transporte: null,
        data_inicio_cobranca: dataInicioCobranca,
        data_fim_cobranca: dataFimCobranca,
      };

      const { data: novoAluno, error: errAluno } = await supabase
        .from("passageiros")
        .insert(alunoPayload)
        .select("id")
        .single();

      if (errAluno || !novoAluno) {
        console.error(`[ERRO] Falha ao cadastrar aluno ${nomeAluno}:`, errAluno);
        continue;
      }

      const vinculoPayload: PassageiroResponsavelInsert = {
        passageiro_id: novoAluno.id,
        responsavel_id: responsavelId,
        tipo: "principal",
        parentesco: "responsavel_legal",
        notificacoes_rota_habilitadas: false,
      };

      await supabase.from("passageiro_responsaveis").insert(vinculoPayload);

      totalAlunosCriados++;
    }

    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      console.log(`[PROGRESSO] ${i + 1}/${rows.length} carteirinhas processadas...`);
    }
  }

  console.log("\n=================================================");
  console.log(`   RELATÓRIO FINAL DA CARGA - ${IS_PROD ? "PRODUÇÃO" : "DEV"}`);
  console.log("=================================================");
  console.log(`✅ Total de Alunos no Arquivo: ${rows.length}`);
  console.log(`✅ Carteirinhas de Alunos Criadas: ${totalAlunosCriados}`);
  console.log(`✅ Carteirinhas de Alunos Atualizadas (Existentes): ${totalAlunosAtualizados}`);
  console.log(`✅ Responsáveis Únicos Cadastrados: ${totalResponsaveisCriados}`);
  console.log(`✅ Vínculos com Responsáveis Reutilizados (Irmãos): ${totalResponsaveisReutilizados}`);
  console.log(`✅ Alunos Isentos (Mensalidade R$ 0): ${totalIsentos}`);
  console.log(`✅ Escolas Vinculadas: ${mapEscolas.size}`);
  console.log(`✅ Veículos Vinculados: ${mapVeiculos.size}`);
  console.log("=================================================\n");
}

run().catch((err) => {
  console.error("Erro fatal durante execução da carga:", err);
  process.exit(1);
});
