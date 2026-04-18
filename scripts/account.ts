import 'dotenv/config';
import * as readline from 'readline';
import { supabaseAdmin } from '../src/config/supabase.js';
import { SubscriptionStatus, ConfigKey } from '../src/types/enums.js';
import { subscriptionMonitorService } from '../src/services/subscriptions/subscription-monitor.service.js';
import { getConfigNumber } from '../src/services/configuracao.service.js';
import { getNowBR, addDays, getEndOfDayBR } from '../src/utils/date.utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// ANSI helpers
// ─────────────────────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  blue:    '\x1b[34m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
  bgGreen: '\x1b[42m',
};

const DEFAULT_CPF = '39542391838';
const out = (s: string) => process.stdout.write(s);


// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE CENÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

interface MenuItem {
  type: 'group' | 'item';
  label: string;
  key?: string;
  desc?: string;
  danger?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  // ── GERAL ──────────────────────────────────────────────────────────────────
  { type: 'group', label: 'GERAL' },
  {
    type: 'item', key: 'reset', danger: true,
    label: 'Reset completo da conta',
    desc:  'Faturas, cartões, notificações e volta ao TRIAL',
  },

  // ── TRIAL ──────────────────────────────────────────────────────────────────
  { type: 'group', label: 'TRIAL' },
  {
    type: 'item', key: 'trial-inicio',
    label: 'Trial ativo (início limpo)',
    desc:  'Trial com 15 dias restantes, sem faturas',
  },
  {
    type: 'item', key: 'trial-d7-engajado',
    label: 'Trial D+7 — Usuário engajado',
    desc:  'Com passageiros cadastrados',
  },
  {
    type: 'item', key: 'trial-d7-inativo',
    label: 'Trial D+7 — Usuário inativo',
    desc:  'Sem nenhum passageiro',
  },
  {
    type: 'item', key: 'trial-d14-aviso',
    label: 'Trial D+14 — Último aviso',
    desc:  'Trial expira amanhã',
  },
  {
    type: 'item', key: 'trial-hoje-aviso',
    label: 'Trial Dia 0 — Expira HOJE',
    desc:  'Aviso urgente de último dia',
  },
  {
    type: 'item', key: 'trial-expirando',
    label: 'Trial expirando',
    desc:  'Dentro da janela de aviso (N dias)',
  },
  {
    type: 'item', key: 'trial-expirado',
    label: 'Trial expirado',
    desc:  'Ends=ontem, status=TRIAL',
  },
  {
    type: 'item', key: 'trial-recuperacao-16',
    label: 'Trial — Recuperação D+16',
    desc:  'EXPIRED há 16 dias',
  },
  {
    type: 'item', key: 'trial-recuperacao-20',
    label: 'Trial — Recuperação D+20',
    desc:  'EXPIRED há 20 dias',
  },
  {
    type: 'item', key: 'trial-recuperacao-25',
    label: 'Trial — Recuperação Final D+25',
    desc:  'EXPIRED há 25 dias',
  },

  // ── PIX ────────────────────────────────────────────────────────────────────
  { type: 'group', label: 'PIX' },
  {
    type: 'item', key: 'pix-vencendo',
    label: 'PIX — Vencendo em breve (gera QR Code)',
    desc:  'ACTIVE + PIX, vence em 5 dias',
  },
  {
    type: 'item', key: 'pix-pastdue-d1',
    label: 'PIX — PAST_DUE D+1 (lembrete)',
    desc:  'Venceu ontem, fatura PIX pendente',
  },
  {
    type: 'item', key: 'pix-pastdue-d2',
    label: 'PIX — PAST_DUE D+2 (urgência)',
    desc:  'Venceu há 2 dias, fatura PIX pendente',
  },
  {
    type: 'item', key: 'pix-expirado',
    label: 'PIX — PAST_DUE além da carência (expira agora)',
    desc:  'Venceu além dos dias de carência',
  },
  {
    type: 'item', key: 'pix-recuperacao-5',
    label: 'PIX — Recuperação D+5 (ex-assinante)',
    desc:  'EXPIRED (já pagou via PIX), venceu há 5 dias',
  },
  {
    type: 'item', key: 'pix-recuperacao-10',
    label: 'PIX — Recuperação Final D+10 (ex-assinante)',
    desc:  'EXPIRED (já pagou via PIX), venceu há 10 dias',
  },

  // ── CARTÃO ─────────────────────────────────────────────────────────────────
  { type: 'group', label: 'CARTÃO' },
  {
    type: 'item', key: 'cartao-vencendo',
    label: 'Cartão — Aviso + cobrança automática',
    desc:  'ACTIVE + cartão salvo, vence em 5 dias',
  },
  {
    type: 'item', key: 'cartao-falha-maxima',
    label: 'Cartão — Limite de tentativas atingido',
    desc:  'ACTIVE + cartão, 3 faturas FAILED recentes',
  },
  {
    type: 'item', key: 'cartao-pastdue-d1',
    label: 'Cartão — PAST_DUE D+1 (lembrete)',
    desc:  'Venceu ontem com cartão',
  },
  {
    type: 'item', key: 'cartao-pastdue-d2',
    label: 'Cartão — PAST_DUE D+2 (urgência)',
    desc:  'Venceu há 2 dias com cartão',
  },
  {
    type: 'item', key: 'cartao-expirado',
    label: 'Cartão — PAST_DUE além da carência (expira agora)',
    desc:  'Venceu além dos dias de carência com cartão',
  },
  {
    type: 'item', key: 'cartao-recuperacao-5',
    label: 'Cartão — Recuperação D+5 (ex-assinante)',
    desc:  'EXPIRED (pagou c/ cartão), venceu há 5 dias',
  },
  {
    type: 'item', key: 'cartao-recuperacao-10',
    label: 'Cartão — Recuperação Final D+10 (ex-assinante)',
    desc:  'EXPIRED (pagou c/ cartão), venceu há 10 dias',
  },
  {
    type: 'item', key: 'cartao-deletado',
    label: 'Cartão — Vencendo mas cartão foi deletado',
    desc:  'ACTIVE, vence em 5 dias, metodo=cartao mas preferencial=NULL',
  },
];

// Índices navegáveis (apenas items, não grupos)
const selectableIndices = MENU_ITEMS
  .map((item, i) => item.type === 'item' ? i : -1)
  .filter(i => i !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// RENDERIZAÇÃO DO MENU
// ─────────────────────────────────────────────────────────────────────────────

/** Remove ANSI, trunca no limite de caracteres visíveis e reaplica reset. */
function truncateLine(line: string, maxVisible: number): string {
  const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
  if (plain.length <= maxVisible) return line;

  // Tenta manter o código de cor inicial se houver (ex: azul do selecionado)
  const ansiMatch = line.match(/^(\x1b\[[0-9;]*m)+/);
  const prefix = ansiMatch ? ansiMatch[0] : '';
  
  return prefix + plain.slice(0, maxVisible - 3) + '...' + c.reset;
}

function renderMenu(selectedSelectable: number): void {
  // \x1b[2J = Limpa tela toda
  // \x1b[H  = Move cursor para 1,1
  // \x1b[?25l = Esconde o cursor
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[H\x1b[?25l');
  }

  // Detecta a largura do terminal e deixa uma pequena margem de segurança
  const terminalWidth = process.stdout.columns || 100;
  const colLimit = terminalWidth - 5; 

  const lines: string[] = [];
  lines.push(`${c.bold}${c.cyan}VAN360 SIMULATOR${c.reset}\x1b[K`);
  lines.push('\x1b[K');

  let selIdx = 0;
  for (const item of MENU_ITEMS) {
    if (item.type === 'group') {
      lines.push(`${c.dim}── ${item.label} ──${c.reset}\x1b[K`);
      continue;
    }

    const isCurrent = selIdx === selectedSelectable;
    selIdx++;

    const prefix = isCurrent ? `${c.blue}${c.bold}❯${c.reset} ` : `  `;
    const labelText = item.danger ? `${c.red}${item.label}${c.reset}` : item.label;
    const label = isCurrent ? `${c.bold}${c.white}${labelText}${c.reset}` : labelText;
    const desc   = item.desc ? ` ${c.dim}— ${item.desc}${c.reset}` : '';

    // \x1b[K garante que o resto da linha seja limpo horizontalmente
    lines.push(truncateLine(`${prefix}${label}${desc}`, colLimit) + '\x1b[K');
  }

  lines.push('\x1b[K');
  lines.push(`${c.dim}↑↓ Navegar    Enter Confirmar    Ctrl+C Sair${c.reset}\x1b[K`);

  process.stdout.write(lines.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SIMPLES (readline)
// ─────────────────────────────────────────────────────────────────────────────

function askCpf(): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${c.cyan}CPF do motorista${c.reset} ${c.dim}(Enter = ${DEFAULT_CPF})${c.reset}: `, answer => {
      rl.close();
      resolve(answer.trim() || DEFAULT_CPF);
    });
  });
}

function askConfirm(question: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${question} ${c.dim}[s/N]${c.reset}: `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 's');
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU INTERATIVO (teclas raw)
// ─────────────────────────────────────────────────────────────────────────────

function runInteractiveMenu(): Promise<{ key: string }> {
  // Entra no Alternate Buffer (\x1b[?1049h) e limpa a tela (\x1b[2J) no início
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');
  }

  return new Promise(resolve => {
    let selected = 0;
    renderMenu(selected);

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKey = (_: unknown, key: readline.Key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1b[?25h\x1b[?1049l'); // Mostra cursor e sai do Alternate Buffer
        cleanup();
        out('\n');
        process.exit(0);
      }

      if (key.name === 'up') {
        selected = (selected - 1 + selectableIndices.length) % selectableIndices.length;
      } else if (key.name === 'down') {
        selected = (selected + 1) % selectableIndices.length;
      } else if (key.name === 'return') {
        process.stdout.write('\x1b[?25h\x1b[?1049l'); // Mostra cursor e sai do Alternate Buffer
        cleanup();
        out('\n');
        const item = MENU_ITEMS[selectableIndices[selected]] as MenuItem;
        // Pequena pausa para o Enter não vazar para os prompts seguintes de CPF e confirmação
        setTimeout(() => {
          resolve({ key: item.key! });
        }, 100);
        return;
      }

      renderMenu(selected);
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKey);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE BANCO
// ─────────────────────────────────────────────────────────────────────────────

const log = {
  step:  (msg: string) => console.log(`  ${c.cyan}↳${c.reset} ${msg}`),
  ok:    (msg: string) => console.log(`  ${c.green}✔${c.reset} ${msg}`),
  warn:  (msg: string) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`),
  error: (msg: string) => console.log(`  ${c.red}✖${c.reset} ${msg}`),
};

interface UserRow { id: string; nome: string; telefone: string | null; }
interface SubRow  { id: string; plano_id: string; metodo_pagamento: string | null; }

async function findUser(cpf: string): Promise<UserRow> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, nome, telefone')
    .eq('cpfcnpj', cpf.replace(/\D/g, ''))
    .single();
  if (error || !data) throw new Error(`Usuário com CPF ${cpf} não encontrado.`);
  return data as UserRow;
}

async function findSub(userId: string): Promise<SubRow> {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('id, plano_id, metodo_pagamento')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error('Nenhuma assinatura encontrada para este usuário.');
  return data as SubRow;
}

async function updateSub(subId: string, data: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('assinaturas')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', subId);
  if (error) throw error;
}

async function clearNotifications(userId: string) {
  log.step('Limpando histórico de notificações...');
  await supabaseAdmin.from('assinatura_notificacoes').delete().eq('usuario_id', userId);
}

async function clearPendingInvoices(userId: string) {
  log.step('Removendo faturas PENDING...');
  await supabaseAdmin.from('assinatura_faturas').delete().eq('usuario_id', userId).eq('status', 'PENDING');
}

async function clearAllInvoices(userId: string) {
  log.step('Removendo todas as faturas...');
  await supabaseAdmin.from('assinatura_faturas').delete().eq('usuario_id', userId);
}

async function clearSavedCards(userId: string) {
  log.step('Removendo cartões salvos...');
  await supabaseAdmin.from('metodos_pagamento').delete().eq('usuario_id', userId);
}

async function createFakeCard(userId: string, subId: string): Promise<string> {
  log.step('Criando cartão simulado (SIMULATE / 9999 / 12/2099)...');

  const { data: existing } = await supabaseAdmin
    .from('metodos_pagamento')
    .select('id')
    .eq('usuario_id', userId)
    .eq('last_4_digits', '9999')
    .maybeSingle();

  let cardId: string;

  if (existing) {
    cardId = existing.id as string;
    log.step('Cartão simulado já existe, reutilizando.');
  } else {
    const { data, error } = await supabaseAdmin
      .from('metodos_pagamento')
      .insert({
        usuario_id:    userId,
        brand:         'SIMULATE',
        last_4_digits: '9999',
        expire_month:  '12',
        expire_year:   '2099',
        payment_token: 'SIMULATE_FAKE_TOKEN_NAO_USAR_EM_PRODUCAO',
        is_default:    true,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Falha ao criar cartão simulado: ${error?.message}`);
    cardId = data.id as string;
  }

  await supabaseAdmin
    .from('assinaturas')
    .update({ metodo_pagamento_preferencial_id: cardId })
    .eq('id', subId);

  return cardId;
}

async function createFailedCardInvoices(
  userId: string, subId: string, planoId: string, count: number,
) {
  log.step(`Criando ${count} fatura(s) FAILED de cartão nos últimos 30 dias...`);
  const now = getNowBR();
  const records = Array.from({ length: count }, (_, i) => ({
    assinatura_id:    subId,
    usuario_id:       userId,
    plano_id:         planoId,
    metodo_pagamento: 'credit_card',
    status:           'FAILED',
    valor:            49.90,
    data_vencimento:  addDays(now, -(i + 1)).toISOString(),
    created_at:       addDays(now, -(i + 1)).toISOString(),
  }));
  const { error } = await supabaseAdmin.from('assinatura_faturas').insert(records);
  if (error) throw error;
}

async function createPendingPixInvoice(
  userId: string, subId: string, planoId: string, dueDate: Date,
) {
  log.step('Criando fatura PENDING com Pix simulado...');
  const { error } = await supabaseAdmin.from('assinatura_faturas').insert({
    assinatura_id:    subId,
    usuario_id:       userId,
    plano_id:         planoId,
    metodo_pagamento: 'pix',
    status:           'PENDING',
    valor:            49.90,
    data_vencimento:  dueDate.toISOString(),
    gateway_txid:     'SIMULATE_PIX_TXID',
    pix_copy_paste:
      '00020126580014br.gov.bcb.pix0136SIMULADO-APENAS-PARA-TESTES' +
      '52040000530398654045.005802BR5925VAN360 TECNOLOGIA LTDA6009SAO PAULO62070503***6304ABCD',
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUÇÃO DE CENÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

async function runScenario(scenarioKey: string, cpf: string, skipMonitor: boolean) {
  out('\x1b[2J\x1b[H');
  const item = MENU_ITEMS.find(i => i.key === scenarioKey)!;
  console.log(`\n  ${c.bold}${c.cyan}Cenário:${c.reset} ${item.label}`);
  console.log(`  ${c.dim}CPF: ${cpf}${c.reset}\n`);

  const user = await findUser(cpf);
  log.ok(`Usuário: ${user.nome} (${user.id})`);

  const now             = getNowBR();
  const daysBeforeTrial = await getConfigNumber(ConfigKey.SAAS_DIAS_AVISO_TRIAL, 3);
  const gracePeriod     = await getConfigNumber(ConfigKey.SAAS_DIAS_CARENCIA, 3);
  const daysToInvoice   = await getConfigNumber(ConfigKey.SAAS_DIAS_VENCIMENTO, 5);
  const maxRetries      = await getConfigNumber(ConfigKey.SAAS_MAX_TENTATIVAS_CARTAO, 3);

  // reset não precisa de sub para existir — mas todos os outros precisam
  const needsSub = scenarioKey !== 'reset';
  const sub = needsSub ? await findSub(user.id) : null;
  if (needsSub) log.ok(`Assinatura: ${sub!.id}`);

  console.log();

  // ─── RESET ───────────────────────────────────────────────────────────────

  if (scenarioKey === 'reset') {
    log.step('Removendo faturas...');
    await supabaseAdmin.from('assinatura_faturas').delete().eq('usuario_id', user.id);

    log.step('Removendo cartões salvos...');
    await supabaseAdmin.from('metodos_pagamento').delete().eq('usuario_id', user.id);

    log.step('Removendo registros de indicação...');
    await supabaseAdmin
      .from('indicacoes')
      .delete()
      .or(`indicador_id.eq.${user.id},indicado_id.eq.${user.id}`);

    log.step('Removendo histórico de notificações...');
    await supabaseAdmin.from('assinatura_notificacoes').delete().eq('usuario_id', user.id);

    log.step('Resetando assinatura para TRIAL (15 dias)...');
    const trialEndsAt = getEndOfDayBR(addDays(now, 15));
    const { error } = await supabaseAdmin
      .from('assinaturas')
      .update({
        status:                           SubscriptionStatus.TRIAL,
        trial_ends_at:                    trialEndsAt.toISOString(),
        data_inicio:                      now.toISOString(),
        data_vencimento:                  null,
        metodo_pagamento:                 null,
        metodo_pagamento_preferencial_id: null,
        gateway_subscription_id:         null,
        updated_at:                       new Date().toISOString(),
      })
      .eq('usuario_id', user.id);
    if (error) throw error;

    log.ok(`Trial expira em: ${trialEndsAt.toLocaleString('pt-BR')}`);
    console.log(`\n  ${c.bgGreen}${c.bold} RESET CONCLUÍDO ${c.reset}\n`);
    return;
  }

  // ─── CENÁRIOS DE TRIAL ───────────────────────────────────────────────────

  if (scenarioKey === 'trial-inicio') {
    await clearAllInvoices(user.id);
    await clearNotifications(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      trial_ends_at: getEndOfDayBR(addDays(now, 15)).toISOString(),
      data_inicio: now.toISOString(),
      data_vencimento: null,
      metodo_pagamento: null,
      metodo_pagamento_preferencial_id: null,
      gateway_subscription_id: null,
    });
  }

  if (scenarioKey === 'trial-d7-engajado') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      data_inicio: addDays(now, -7).toISOString(),
      trial_ends_at: getEndOfDayBR(addDays(now, 8)).toISOString(),
      data_vencimento: null,
    });
    log.warn('Certifique-se que o usuário possui ao menos 1 passageiro para disparar "engajado".');
  }

  if (scenarioKey === 'trial-d7-inativo') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      data_inicio: addDays(now, -7).toISOString(),
      trial_ends_at: getEndOfDayBR(addDays(now, 8)).toISOString(),
      data_vencimento: null,
    });
    log.warn('Certifique-se que o usuário NÃO possui passageiros para disparar "inativo".');
  }

  if (scenarioKey === 'trial-d14-aviso') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      data_inicio: addDays(now, -14).toISOString(),
      trial_ends_at: getEndOfDayBR(addDays(now, 1)).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-hoje-aviso') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      trial_ends_at: getEndOfDayBR(now).toISOString(),
      data_inicio: addDays(now, -15).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-expirando') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      trial_ends_at: getEndOfDayBR(addDays(now, daysBeforeTrial - 1)).toISOString(),
      data_inicio: addDays(now, -(15 - daysBeforeTrial + 1)).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-expirado') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.TRIAL,
      trial_ends_at: addDays(now, -1).toISOString(),
      data_inicio: addDays(now, -16).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-recuperacao-16') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -16).toISOString(),
      data_inicio: addDays(now, -31).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-recuperacao-20') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -20).toISOString(),
      data_inicio: addDays(now, -35).toISOString(),
      data_vencimento: null,
    });
  }

  if (scenarioKey === 'trial-recuperacao-25') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -25).toISOString(),
      data_inicio: addDays(now, -40).toISOString(),
      data_vencimento: null,
    });
  }

  // ─── CENÁRIOS PIX ────────────────────────────────────────────────────────

  if (scenarioKey === 'pix-vencendo') {
    await clearNotifications(user.id);
    await clearAllInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.ACTIVE,
      trial_ends_at: addDays(now, -30).toISOString(),
      data_vencimento: getEndOfDayBR(addDays(now, daysToInvoice - 1)).toISOString(),
      metodo_pagamento: 'pix',
      metodo_pagamento_preferencial_id: null,
    });
    log.warn('Tentará criar fatura PIX real no EfiPay. Use em ambiente de dev/staging.');
  }

  if (scenarioKey === 'pix-pastdue-d1') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    const due = addDays(now, -1);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -46).toISOString(),
      data_vencimento: due.toISOString(),
      metodo_pagamento: 'pix',
    });
    await createPendingPixInvoice(user.id, sub!.id, sub!.plano_id, due);
  }

  if (scenarioKey === 'pix-pastdue-d2') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    const due = addDays(now, -2);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -47).toISOString(),
      data_vencimento: due.toISOString(),
      metodo_pagamento: 'pix',
    });
    await createPendingPixInvoice(user.id, sub!.id, sub!.plano_id, due);
  }

  if (scenarioKey === 'pix-expirado') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -(gracePeriod + 1)).toISOString(),
      metodo_pagamento: 'pix',
    });
  }

  if (scenarioKey === 'pix-recuperacao-5') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -5).toISOString(),
      metodo_pagamento: 'pix',
    });
  }

  if (scenarioKey === 'pix-recuperacao-10') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -10).toISOString(),
      metodo_pagamento: 'pix',
    });
  }

  // ─── CENÁRIOS CARTÃO ─────────────────────────────────────────────────────

  if (scenarioKey === 'cartao-vencendo') {
    await clearNotifications(user.id);
    await clearAllInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.ACTIVE,
      trial_ends_at: addDays(now, -30).toISOString(),
      data_vencimento: getEndOfDayBR(addDays(now, daysToInvoice - 1)).toISOString(),
      metodo_pagamento: 'credit_card',
    });
    await createFakeCard(user.id, sub!.id);
    log.warn('Token simulado vai falhar no EfiPay — isso testa o fluxo de falha e a notificação de erro.');
  }

  if (scenarioKey === 'cartao-falha-maxima') {
    await clearNotifications(user.id);
    await clearAllInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.ACTIVE,
      trial_ends_at: addDays(now, -30).toISOString(),
      data_vencimento: getEndOfDayBR(addDays(now, daysToInvoice - 1)).toISOString(),
      metodo_pagamento: 'credit_card',
    });
    await createFakeCard(user.id, sub!.id);
    await createFailedCardInvoices(user.id, sub!.id, sub!.plano_id, maxRetries);
  }

  if (scenarioKey === 'cartao-pastdue-d1') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -46).toISOString(),
      data_vencimento: addDays(now, -1).toISOString(),
      metodo_pagamento: 'credit_card',
    });
    await createFakeCard(user.id, sub!.id);
  }

  if (scenarioKey === 'cartao-pastdue-d2') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -47).toISOString(),
      data_vencimento: addDays(now, -2).toISOString(),
      metodo_pagamento: 'credit_card',
    });
    await createFakeCard(user.id, sub!.id);
  }

  if (scenarioKey === 'cartao-expirado') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.PAST_DUE,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -(gracePeriod + 1)).toISOString(),
      metodo_pagamento: 'credit_card',
    });
    await createFakeCard(user.id, sub!.id);
  }

  if (scenarioKey === 'cartao-recuperacao-5') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -5).toISOString(),
      metodo_pagamento: 'credit_card',
    });
  }

  if (scenarioKey === 'cartao-recuperacao-10') {
    await clearNotifications(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.EXPIRED,
      trial_ends_at: addDays(now, -60).toISOString(),
      data_vencimento: addDays(now, -10).toISOString(),
      metodo_pagamento: 'credit_card',
    });
  }

  if (scenarioKey === 'cartao-deletado') {
    await clearNotifications(user.id);
    await clearPendingInvoices(user.id);
    await clearSavedCards(user.id);
    await updateSub(sub!.id, {
      status: SubscriptionStatus.ACTIVE,
      metodo_pagamento: 'credit_card',
      metodo_pagamento_preferencial_id: null,
      data_vencimento: getEndOfDayBR(addDays(now, 5)).toISOString(),
    });
    log.info('Simulando assinatura que tinha cartão, mas ele foi removido.');
  }

  // ─── MONITOR ─────────────────────────────────────────────────────────────

  if (skipMonitor) {
    log.warn('--skip-monitor: banco configurado, monitor NÃO executado.');
  } else {
    console.log(`\n  ${c.cyan}Executando monitor diário...${c.reset}\n`);
    await subscriptionMonitorService.runDailyCheck();
  }

  console.log(`\n  ${c.bgGreen}${c.bold} CONCLUÍDO ${c.reset}  ${item.label}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Modo CLI direto: npm run account -- cartao-vencendo 12345678901
  const cliArgs      = process.argv.slice(2);
  const skipMonitor  = cliArgs.includes('--skip-monitor');
  const cliScenario  = cliArgs.find(a => !a.startsWith('--') && !/^\d{11}$/.test(a));
  const cliCpf       = cliArgs.find(a => /^\d{11}$/.test(a)) ?? DEFAULT_CPF;
  const validKeys    = MENU_ITEMS.filter(i => i.type === 'item').map(i => i.key!);

  if (cliScenario) {
    if (!validKeys.includes(cliScenario)) {
      console.error(`Cenário "${cliScenario}" não reconhecido.`);
      process.exit(1);
    }
    await runScenario(cliScenario, cliCpf, skipMonitor);
    process.exit(0);
  }

  // Modo interativo
  const { key } = await runInteractiveMenu();
  // out('\x1b[2J\x1b[H'); // Removido para manter o histórico visível

  const item = MENU_ITEMS.find(i => i.key === key)!;
  console.log(`\n  ${c.bold}Selecionado:${c.reset} ${item.label}\n`);

  if (item.danger) {
    console.log(`  ${c.red}${c.bold}⚠  ATENÇÃO: esta operação é DESTRUTIVA e irreversível.${c.reset}\n`);
  }

  const cpf = await askCpf();

  const confirmed = await askConfirm(`Confirma execução para CPF ${cpf}?`);
  if (!confirmed) {
    console.log('\n  Cancelado.\n');
    process.exit(0);
  }

  console.log();

  try {
    await runScenario(key, cpf, skipMonitor);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(msg);
    process.exit(1);
  }

  process.exit(0);
}

main();
