import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AssinaturaStatus } from "../types/enums.js";

export const accessControlService = {
  /**
   * Resolve o ID do usuário (tabela usuarios) a partir do ID de autenticação (auth_uid).
   */
  async resolveUsuarioId(authUid: string): Promise<string> {
    const { data: usuario, error } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .eq("auth_uid", authUid)
        .single();
    
    if (error || !usuario) {
        throw new AppError("Usuário não encontrado.", 404);
    }
    return usuario.id;
  },

  /**
   * Valida se o usuário tem permissão para realizar operações de escrita (POST/PUT/DELETE).
   * Lança exceção 403 se o usuário estiver inadimplente ou com trial expirado.
   * @param usuarioId ID do usuário
   */
  async validateWriteAccess(usuarioId: string): Promise<void> {
    // Busca assinatura mais recente (ativa ou não, para verificar motivo)
    const { data: assinaturas, error } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("status, ativo, trial_end_at, vigencia_fim")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
        logger.error({ error, usuarioId }, "Erro ao validar acesso de escrita");
        throw new AppError("Erro ao validar permissões.", 500);
    }

    const assinatura = assinaturas?.[0];

    // Se não tem assinatura, bloqueia (exceto se for processo de criação inicial, mas aí não chama esse método)
    if (!assinatura) {
        throw new AppError("Assinatura não encontrada. Regularize seu plano.", 403);
    }

    const hoje = new Date();
    
    // 1. Verificar Trial
    if (assinatura.status === AssinaturaStatus.TRIAL) {
        if (assinatura.trial_end_at) {
            const trialEnd = new Date(assinatura.trial_end_at);
            // Ajustar fim do dia? Geralmente compara timestamps.
            // Se hoje > trialEnd, expirou.
            if (hoje > trialEnd) {
                throw new AppError("Período de testes expirado. Assine para continuar editando.", 403);
            }
        }
        // Se está em trial e data não expirou, OK.
        return;
    }

    // 2. Verificar Assinatura Paga
    // Se status for ATIVA, valida vigência?
    // Se status for PENDENTE_PAGAMENTO, SUSPENSA ou CANCELADA -> Read Only
    if (assinatura.status !== AssinaturaStatus.ATIVA && assinatura.status !== AssinaturaStatus.TRIAL) {
        // Se estiver ativa, mas status for pendente (pode acontecer na renovação se falhar?)
        // Vamos ser estritos: Se não for ATIVA e não for TRIAL valido, bloqueia.
        throw new AppError("Assinatura inativa ou pendente. Regularize para continuar editando.", 403);
    }
    
    // 3. Verificar Vigência (Grace Period?)
    // Se está ATIVA mas vigencia_fim passou muito? 
    // Geralmente o Job muda status para Pendente. Vamos confiar no status por enquanto.
    
    return;
  }
};
