import crypto from "node:crypto";
import { DRIVER_EVENT_PIX_KEY_VALIDATED, DRIVER_EVENT_PIX_KEY_VALIDATION_FAILED } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { PixKeyStatus, PixKeyType, TransactionStatus } from "../types/enums.js";
import { formatPixKey } from "../utils/format.js";
import { onlyDigits } from "../utils/string.utils.js";
import { cobrancaPagamentoService } from "./cobranca-pagamento.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { paymentService } from "./payment.service.js";

// Interface interna
interface SolicitacaoValidacao {
    usuarioId: string;
    chavePix: string;
    tipoChave: string;
}

/**
 * Cadastra ou atualiza chave PIX e inicia processo de validação
 */
export async function cadastrarOuAtualizarChavePix(
  usuarioId: string,
  chavePix: string,
  tipoChave: string
) {
  if (!usuarioId) throw new Error("ID do usuário é obrigatório.");
  if (!chavePix) throw new Error("Chave PIX é obrigatória.");

  let chaveSanitizada = chavePix.trim();
  if ([PixKeyType.CPF, PixKeyType.CNPJ, PixKeyType.TELEFONE].includes(tipoChave as any)) {
    chaveSanitizada = onlyDigits(chavePix);
    if (tipoChave === PixKeyType.TELEFONE) {
      if (chaveSanitizada.length === 10 || chaveSanitizada.length === 11) {
        chaveSanitizada = `+55${chaveSanitizada}`;
      } else if (!chaveSanitizada.startsWith('+')) {
        chaveSanitizada = `+${chaveSanitizada}`;
      }
    }
  }

  // 3. Salvar no Banco como PENDENTE (Somente se não estiver validada ou for nova)
  // Se já estiver validada, NÃO sobrescrevemos a chave antiga agora. 
  // A nova chave será validada em background e o 'confirmarChaveUsuario' fará o swap final.
  const { data: userCurrentStatus } = await supabaseAdmin
    .from("usuarios")
    .select("status_chave_pix")
    .eq("id", usuarioId)
    .single();

  if (userCurrentStatus?.status_chave_pix !== PixKeyStatus.VALIDADA) {
    const { error } = await supabaseAdmin
      .from("usuarios")
      .update({
        chave_pix: chaveSanitizada,
        tipo_chave_pix: tipoChave,
        status_chave_pix: PixKeyStatus.PENDENTE_VALIDACAO,
        chave_pix_validada_em: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", usuarioId);

    if (error) {
      logger.error({ error: error.message, usuarioId }, "Erro ao salvar chave PIX pendente.");
      throw new Error("Erro ao salvar chave PIX.");
    }
  } else {
    logger.info({ usuarioId }, "Usuário já possui chave validada. Iniciando fluxo de troca segura (background).");
  }

  // 4. Iniciar Validação Async (Micro-pagamento)
  iniciarValidacaoPix(usuarioId, chaveSanitizada, tipoChave)
    .catch(err => {
      logger.error({ error: err.message, usuarioId }, "Falha silenciosa ao iniciar validação PIX (background).");
    });

  return { success: true, status: PixKeyStatus.PENDENTE_VALIDACAO };
}

/**
 * Realiza a validação ativa (envia R$ 0,01)
 */
export async function iniciarValidacaoPix(usuarioId: string, chavePix: string, tipoChave?: string) {
  logger.info({ usuarioId, chavePix }, "Iniciando validação de Chave PIX");

  // IDEMPOTÊNCIA STABLE: Usamos um hash do usuário + chave. 
  // Se o usuário clicar 'Salvar' várias vezes com a mesma chave, ou o worker retentar,
  // geramos o mesmo ID e o Banco/Provedor evita disparar dois pagamentos de R$ 0,01.
  const xIdIdempotente = crypto.createHash('md5').update(`${usuarioId}-${chavePix}`).digest('hex');

  try {
    // 1. Verificar se já existe uma validação em andamento ou concluída para este xIdIdempotente
    const { data: existente } = await supabaseAdmin
      .from("pix_validacao_pendente")
      .select("status")
      .eq("x_id_idempotente", xIdIdempotente)
      .maybeSingle();

    if (existente?.status === TransactionStatus.SUCESSO) {
        logger.info({ usuarioId, chavePix }, "Chave PIX já validada anteriormente via esta transação.");
        return;
    }

    if (existente?.status === TransactionStatus.PROCESSAMENTO) {
        logger.info({ usuarioId, chavePix }, "Validação já está em processamento no gateway. Aguardando.");
        return;
    }

    const { error: upsertError } = await supabaseAdmin
      .from("pix_validacao_pendente")
      .upsert({
        usuario_id: usuarioId,
        x_id_idempotente: xIdIdempotente,
        chave_pix_enviada: chavePix,
        status: TransactionStatus.PENDENTE
      }, { onConflict: 'x_id_idempotente' });

    if (upsertError) {
        logger.error({ error: upsertError.message }, "Erro DB ao registrar validação pendente");
        throw new Error(`Erro ao criar registro de validação pendente: ${upsertError.message}`);
    }

    // 2. Chamar Validação do Provider (Abstraída)
    const provider = paymentService.getProvider();
    const resultado = await provider.validarChavePix(chavePix, xIdIdempotente);

    logger.info({ 
      usuarioId, 
      resultado,
      provider: provider.name
    }, "Resultado da Validação do Provider");

    if (resultado.valido) {
         // Se temos nome, é sucesso instantâneo (C6, Mock ou Inter síncrono)
         if (resultado.nome) {
             await supabaseAdmin
                 .from("pix_validacao_pendente")
                 .update({
                     status: TransactionStatus.SUCESSO,
                     end_to_end_id: `VALIDADO-${provider.name}`, // C6 não gera E2E de pagto, mas Inter gera.
                 })
                 .eq("x_id_idempotente", xIdIdempotente);

             await confirmarChaveUsuario(
                 usuarioId, 
                 chavePix, 
                 tipoChave || "N/A"
             );
             
             logger.info({ usuarioId }, "Chave PIX validada com sucesso (Síncrono).");
         } else {
             // Válido mas sem nome = Processamento Async (Inter Pendente)
             // O webhook virá depois com o xIdIdempotente
             await supabaseAdmin
             .from("pix_validacao_pendente")
             .update({ status: TransactionStatus.PROCESSAMENTO })
             .eq("x_id_idempotente", xIdIdempotente);

             logger.info({ usuarioId }, "Validação PIX iniciada (Async). Aguardando Webhook.");
         }
    } else {
        // Inválido (Erro imediato)
        logger.warn({ usuarioId, erro: resultado.erro }, "Chave PIX considerada inválida pelo Provider.");
        
        // Marcar falha no pendente
        await supabaseAdmin
             .from("pix_validacao_pendente")
             .update({ status: TransactionStatus.ERRO })
             .eq("x_id_idempotente", xIdIdempotente);
             
        // Notificar falha e atualizar status do usuário (FALHA_VALIDACAO)
        await validacaoPixService.rejeitarValidacao(usuarioId, resultado.erro || "Falha na validação do Provedor");
    }

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId }, "Falha crítica ao executar validação PIX.");
  }
}

/**
 * Processa o retorno (Webhook) da validação PIX
 */
export async function processarRetornoValidacaoPix(
  identificador: { e2eId?: string, txid?: string }
) {
  logger.info({ identificador }, "Processando retorno de validação PIX (Webhook)...");

  // Buscar na tabela temporária
  let query = supabaseAdmin
    .from("pix_validacao_pendente")
    .select("id, usuario_id, x_id_idempotente, chave_pix_enviada, created_at");

  if (identificador.e2eId) {
      query = query.eq("end_to_end_id", identificador.e2eId);
  } else if (identificador.txid) {
    // Fallback: se salvamos o gateway_txid em algum lugar (mas usamos xIdIdempotente como gateway_txid no provider normalmente)
    // O Inter retorna o nosso gateway_txid (xIdIdempotente) no campo 'txid' do webhook? Sim.
    query = query.eq("x_id_idempotente", identificador.txid);
  } else {
      logger.warn("Identificador inválido para validação PIX");
      return;
  }

  const { data: pendentes, error } = await query;

  if (error || !pendentes || pendentes.length === 0) {
      logger.warn({ identificador }, "Nenhuma validação pendente encontrada para este retorno. (Pode ser pagamento normal)");
      return { success: false };
  }

  const pendente = pendentes[0];
  const { usuario_id, chave_pix_enviada } = pendente;

  // Confirmar
  await confirmarChaveUsuario(usuario_id, chave_pix_enviada, "N/A"); // Tipo N/A aqui, pois o swap final usa o que já está salvo ou o que veio no registro

  // Marcar como SUCESSO
  await supabaseAdmin
      .from("pix_validacao_pendente")
      .update({ status: TransactionStatus.SUCESSO })
      .eq("id", pendente.id);

  logger.info({ usuario_id }, "Chave PIX validada via Webhook com sucesso.");
  return { success: true };
}

/**
 * Helper: Atualiza o cadastro do usuário com a chave validada.
 */
async function confirmarChaveUsuario(
    usuarioId: string, 
    chave: string, 
    tipo: string
) {
    // Primeiro buscamos o tipo atual se não passarmos (para não sobrescrever com DESCONHECIDO se já existir)
    let tipoFinal = tipo;
    
    // Se update
    const updates: any = {
        chave_pix: chave,
        status_chave_pix: PixKeyStatus.VALIDADA,
        chave_pix_validada_em: new Date().toISOString()
    };

    if (tipo !== "N/A") {
        updates.tipo_chave_pix = tipo;
    }

    const { error } = await supabaseAdmin
        .from("usuarios")
        .update(updates)
        .eq("id", usuarioId);

    if (error) {
        logger.error({ error, usuarioId }, "Erro ao salvar chave pix validada no usuário");
        throw error;
    }

    // 4. RETRY IMEDIATO DE REPASSES
    // Se o usuário tinha saldo travado por falta de chave, tenta pagar agora.
    cobrancaPagamentoService.reprocessarRepassesPendentes(usuarioId)
        .catch(err => {
            logger.error({ err, usuarioId }, "Erro ao disparar retry de repasses após validação PIX");
        });

    // 5. Notificar Usuário via WhatsApp
    try {
        const { data: userData } = await supabaseAdmin
            .from("usuarios")
            .select("nome, telefone")
            .eq("id", usuarioId)
            .single();

        if (userData?.telefone) {
            logger.info({ usuarioId, telefone: userData.telefone }, "Enviando notificação de Chave PIX Validada");
            await notificationService.notifyDriver(userData.telefone, DRIVER_EVENT_PIX_KEY_VALIDATED, {
                nomeMotorista: userData.nome || "Motorista",
                nomePlano: "", // Not used in this template
                valor: 0,
                dataVencimento: "",
                chavePix: formatPixKey(chave, tipoFinal),
                tipoChavePix: tipoFinal
            });
        }
    } catch (notifyErr) {
        logger.error({ notifyErr, usuarioId }, "Erro ao enviar notificação de sucesso na validação PIX");
        // Não travar o processo principal por erro na notificação
    }
}

// Manter compatibilidade com objeto antigo se alguém importar 'validacaoPixService'
// Mas idealmente mudar consumidores.
export const validacaoPixService = {
    iniciarValidacao: async (params: SolicitacaoValidacao) => {
        return iniciarValidacaoPix(params.usuarioId, params.chavePix, params.tipoChave);
    },
    confirmarChaveUsuario,
    rejeitarValidacao: async (usuarioId: string, motivo: string) => {
        logger.warn({ usuarioId, motivo }, "Validação de PIX falhou. Notificando usuário.");

        // 1. Verificar status atual antes de 'rejeitar'
        const { data: user } = await supabaseAdmin
            .from("usuarios")
            .select("status_chave_pix")
            .eq("id", usuarioId)
            .single();

        // Só marcamos FALHA_VALIDACAO se o usuário não tiver uma chave já validada (fluxo de troca segura)
        if (user?.status_chave_pix !== PixKeyStatus.VALIDADA) {
            const { error } = await supabaseAdmin
                .from("usuarios")
                .update({
                    status_chave_pix: PixKeyStatus.FALHA_VALIDACAO,
                    chave_pix_validada_em: null 
                })
                .eq("id", usuarioId);

            if (error) {
                logger.error({ error, usuarioId }, "Erro ao registrar FALHA_VALIDACAO no banco");
            }
        } else {
            logger.info({ usuarioId }, "Mantendo status VALIDADA após falha na tentativa de troca de chave.");
        }

        // 2. Notificar Usuário
        try {
             const { data: userData } = await supabaseAdmin
                 .from("usuarios")
                 .select("nome, telefone, chave_pix, tipo_chave_pix")
                 .eq("id", usuarioId)
                 .single();
     
             if (userData?.telefone) {
                 await notificationService.notifyDriver(userData.telefone, DRIVER_EVENT_PIX_KEY_VALIDATION_FAILED, {
                     nomeMotorista: userData.nome || "Motorista",
                     nomePlano: "",
                     valor: 0,
                     dataVencimento: "",
                     chavePix: userData.chave_pix,
                     tipoChavePix: userData.tipo_chave_pix
                 });
             }
        } catch (notifyErr) {
             logger.error({ notifyErr, usuarioId }, "Erro ao enviar notificação de falha PIX");
        }
    }
};
