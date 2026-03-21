import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";

export const accessControlService = {

  /**
   * Valida se o usuário tem permissão para realizar operações de escrita (POST/PUT/DELETE).
   * Clean Slate: Acesso total liberado para todos os usuários cadastrados.
   */
  async validateWriteAccess(usuarioId: string): Promise<void> {
    // Acesso total liberado (Clean Slate)
    return;
  }
};
