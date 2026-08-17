import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import { responsavelRepository } from "../repositories/responsavel.repository.js";
import { routeRepository } from "../repositories/route.repository.js";
import { usuarioPushTokenRepository } from "../repositories/usuario-push-token.repository.js";
import { maskEmail, onlyDigits } from "../utils/string.utils.js";
import { notificationService } from "./notifications/notification.service.js";
import { routeService } from "./route.service.js";
import { NotificationChannelEnum, TipoResponsavel } from "../types/enums.js";
import { EVENTO_PASSAGEIRO_PIN_RESET, EVENTO_MOTORISTA_AUSENCIA_REGISTRADA, EVENTO_MOTORISTA_AUSENCIA_REMOVIDA } from "../config/constants.js";
import { CreateResponsavelAusenciaDTO } from "../types/dtos/responsavel-ausencia.dto.js";

const JWT_SECRET = process.env.JWT_SECRET || "van360_responsavel_secret_key_2026";
const TOKEN_EXPIRATION = "30d";

export interface ResponsavelTokenPayload {
  phone: string;
  passageiro_ids: string[];
}

interface OtpStoreItem {
  phone: string;
  email: string;
  code: string;
  expiresAt: number;
}

const otpStore = new Map<string, OtpStoreItem>();

export const portalResponsavelService = {
  async checkPhone(phoneRaw: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    if (!phoneDigits || phoneDigits.length < 8) {
      throw new AppError("Telefone inválido.", 400);
    }

    const passageiros = await responsavelRepository.findPassageirosByPhone(phoneDigits);

    if (!passageiros || passageiros.length === 0) {
      throw new AppError("Cadastro não encontrado. Entre em contato com o motorista para verificar o número cadastrado.", 404);
    }

    const hasPin = passageiros.some(p => Boolean(p.pin_acesso));

    return {
      hasPin,
      totalPassageiros: passageiros.length
    };
  },

  async setupPin(phoneRaw: string, pin: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    const passageiros = await responsavelRepository.findPassageirosByPhone(phoneDigits);

    if (!passageiros || passageiros.length === 0) {
      throw new AppError("Cadastro não encontrado.", 404);
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await responsavelRepository.updatePinByPhone(phoneDigits, pinHash);

    const passageiroIds = passageiros.map(p => p.id);
    const token = jwt.sign(
      { phone: phoneDigits, passageiro_ids: passageiroIds },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      token,
      passageiros: passageiros.map(p => ({
        id: p.id,
        nome: p.nome,
        motorista_nome: p.motorista_nome
      }))
    };
  },

  async login(phoneRaw: string, pin: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    const passageiros = await responsavelRepository.findPassageirosByPhone(phoneDigits);

    if (!passageiros || passageiros.length === 0) {
      throw new AppError("Cadastro não encontrado.", 404);
    }

    const recordWithPin = passageiros.find(p => Boolean(p.pin_acesso));
    if (!recordWithPin || !recordWithPin.pin_acesso) {
      throw new AppError("Primeiro acesso não configurado. Defina um PIN de 4 dígitos.", 400);
    }

    const isValid = await bcrypt.compare(pin, recordWithPin.pin_acesso);
    if (!isValid) {
      throw new AppError("PIN incorreto. Tente novamente.", 401);
    }

    const passageiroIds = passageiros.map(p => p.id);
    const token = jwt.sign(
      { phone: phoneDigits, passageiro_ids: passageiroIds },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      token,
      passageiros: passageiros.map(p => ({
        id: p.id,
        nome: p.nome,
        motorista_nome: p.motorista_nome
      }))
    };
  },

  async verifyResponsavelToken(token: string): Promise<ResponsavelTokenPayload> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as ResponsavelTokenPayload;
      return decoded;
    } catch {
      throw new AppError("Sessão do responsável expirada ou inválida. Faça login novamente.", 401);
    }
  },

  async getPassageiros(token: string) {
    const payload = await this.verifyResponsavelToken(token);
    const passageiros = await responsavelRepository.findPassageirosByPhone(payload.phone);

    if (!passageiros || passageiros.length === 0) {
      throw new AppError("Nenhum cadastro ativo vinculado a este acesso no momento. Entre em contato com o motorista.", 404);
    }

    return passageiros.map(p => ({
      id: p.id,
      nome: p.nome,
      motorista_nome: p.motorista_nome
    }));
  },

  async getPassageiroCarteirinha(token: string, passageiroId: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const passageiros = await responsavelRepository.findPassageirosByPhone(payload.phone);
    const target = passageiros.find(p => p.id === passageiroId);

    if (!target) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    return responsavelRepository.getPassageiroCarteirinha(passageiroId, target);
  },

  async updateDadosComplementares(token: string, passageiroId: string, cpf: string, email: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const passageiros = await responsavelRepository.findPassageirosByPhone(payload.phone);
    const target = passageiros.find(p => p.id === passageiroId);

    if (!target) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const cpfLimpo = onlyDigits(cpf);
    const emailLimpo = email.trim().toLowerCase();

    if (target.tipo_responsavel === TipoResponsavel.PRINCIPAL) {
      await responsavelRepository.updateDadosComplementaresPrincipal(passageiroId, cpfLimpo, emailLimpo);
    } else {
      await responsavelRepository.updateDadosComplementaresAdicional(target.responsavel_id, cpfLimpo, emailLimpo);
    }

    return { success: true };
  },

  async registrarAusencia(token: string, passageiroId: string, data: CreateResponsavelAusenciaDTO) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const passageiros = await responsavelRepository.findPassageirosByPhone(payload.phone);
    const target = passageiros.find(p => p.id === passageiroId);

    if (!target) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    let rotaId = data.rota_id;

    if (!rotaId) {
      const { data: rotasVinculadas } = await routeRepository.getRotasByPassageiro(passageiroId);

      const rotasDisponiveis = (rotasVinculadas || [])
        .map((r: any) => (Array.isArray(r.rota) ? r.rota[0] : r.rota))
        .filter((r: any) => r && r.id);

      if (rotasDisponiveis.length === 1) {
        rotaId = rotasDisponiveis[0].id;
      } else if (rotasDisponiveis.length === 0) {
        throw new AppError("O passageiro não está vinculado a nenhuma rota para registrar ausência.", 400);
      } else {
        throw new AppError("Selecione a qual rota a ausência se refere.", 400);
      }
    }

    const ausencia = await routeService.registrarAusenciaAntecipada({
      passageiro_id: passageiroId,
      rota_id: rotaId!,
      data_ausencia: data.data_ausencia,
      sentido: data.sentido,
      registrado_por: target.motorista_id
    });

    try {
      const { data: rotaData } = await routeRepository.getRotaNomeById(rotaId!);

      const [ano, mes, dia] = data.data_ausencia.split("-");
      const dataFormatada = `${dia}/${mes}/${ano}`;

      notificationService.sendDirect(
        NotificationChannelEnum.FIREBASE,
        EVENTO_MOTORISTA_AUSENCIA_REGISTRADA,
        {
          nomePassageiro: target.nome,
          nomeRota: rotaData?.nome || "rota",
          dataAusencia: data.data_ausencia,
          dataFormatada,
          passageiroId,
          rotaId: rotaId!,
          usuarioId: target.motorista_id
        },
        { usuarioId: target.motorista_id }
      ).catch(() => {});
    } catch {}

    return ausencia;
  },

  async removerAusencia(token: string, passageiroId: string, ausenciaId: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const passageiros = await responsavelRepository.findPassageirosByPhone(payload.phone);
    const target = passageiros.find(p => p.id === passageiroId);

    const { data: ausenciaExistente } = await routeRepository.getAusenciaExistenteById(ausenciaId);

    await routeService.removerAusenciaAntecipada(
      ausenciaId,
      passageiroId,
      ausenciaExistente?.rota_id,
      ausenciaExistente?.data_ausencia
    );

    if (target && ausenciaExistente) {
      try {
        const r = Array.isArray(ausenciaExistente.rota) ? ausenciaExistente.rota[0] : ausenciaExistente.rota;
        const [ano, mes, dia] = (ausenciaExistente.data_ausencia || "").split("-");
        const dataFormatada = dia && mes && ano ? `${dia}/${mes}/${ano}` : ausenciaExistente.data_ausencia;

        notificationService.sendDirect(
          NotificationChannelEnum.FIREBASE,
          EVENTO_MOTORISTA_AUSENCIA_REMOVIDA,
          {
            nomePassageiro: target.nome,
            nomeRota: r?.nome || "rota",
            dataAusencia: ausenciaExistente.data_ausencia,
            dataFormatada,
            passageiroId,
            rotaId: ausenciaExistente.rota_id,
            usuarioId: target.motorista_id
          },
          { usuarioId: target.motorista_id }
        ).catch(() => {});
      } catch {}
    }

    return { success: true };
  },

  async updateObservacoes(token: string, passageiroId: string, observacoes: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    await responsavelRepository.updateObservacoes(passageiroId, observacoes);
    return { success: true };
  },

  async addResponsavel(token: string, passageiroId: string, data: Record<string, unknown>) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const inserted = await responsavelRepository.addResponsavelAdicional(passageiroId, data);
    return inserted;
  },

  async updateResponsavel(token: string, passageiroId: string, responsavelId: string, data: Record<string, unknown>) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const updated = await responsavelRepository.updateResponsavelAdicional(responsavelId, data, passageiroId);
    return updated;
  },

  async deleteResponsavel(token: string, passageiroId: string, responsavelId: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    await responsavelRepository.deleteResponsavelAdicional(responsavelId);
    return { success: true };
  },

  async setPrincipalResponsavel(token: string, passageiroId: string, responsavelId: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    await responsavelRepository.setPrincipalResponsavel(passageiroId, responsavelId);
    return { success: true };
  },

  async checkResetEmails(phoneRaw: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    if (!phoneDigits || phoneDigits.length < 8) {
      throw new AppError("Telefone inválido.", 400);
    }

    const emails = await responsavelRepository.findEmailsByPhone(phoneDigits);

    if (!emails || emails.length === 0) {
      throw new AppError("Nenhum e-mail cadastrado no momento. Solicite ao motorista da van para resetar seu PIN.", 404);
    }

    const maskedEmails = emails.map((e, index) => ({
      id: index,
      mascarado: maskEmail(e)
    }));

    return { emails: maskedEmails };
  },

  async sendResetOtp(phoneRaw: string, emailIndex: number = 0) {
    const phoneDigits = onlyDigits(phoneRaw);
    const emails = await responsavelRepository.findEmailsByPhone(phoneDigits);

    if (!emails || emails.length === 0) {
      throw new AppError("Nenhum e-mail cadastrado para este telefone.", 404);
    }

    const selectedIndex = (emailIndex >= 0 && emailIndex < emails.length) ? emailIndex : 0;
    const emailTarget = emails[selectedIndex];

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    otpStore.set(phoneDigits, {
      phone: phoneDigits,
      email: emailTarget,
      code: otpCode,
      expiresAt
    });

    await notificationService.sendDirect(
      NotificationChannelEnum.RESEND,
      EVENTO_PASSAGEIRO_PIN_RESET,
      {
        to: emailTarget,
        codigo: otpCode,
        nomeResponsavel: "Responsável"
      }
    );

    return { emailMascarado: maskEmail(emailTarget) };
  },

  async validateResetOtp(phoneRaw: string, code: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    const stored = otpStore.get(phoneDigits);

    if (!stored) {
      throw new AppError("Código de verificação expirado ou não encontrado. Solicite um novo código.", 400);
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phoneDigits);
      throw new AppError("O código expirou. Solicite um novo código.", 400);
    }

    if (stored.code !== code.trim()) {
      throw new AppError("Código de verificação incorreto.", 400);
    }

    const resetToken = jwt.sign(
      { phone: phoneDigits, scope: "pin_reset" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    return { resetToken };
  },

  async executePinReset(resetToken: string, newPin: string) {
    try {
      const decoded = jwt.verify(resetToken, JWT_SECRET) as { phone: string; scope: string };
      if (decoded.scope !== "pin_reset") {
        throw new AppError("Token de redefinição inválido.", 401);
      }

      const phoneDigits = decoded.phone;
      const passageiros = await responsavelRepository.findPassageirosByPhone(phoneDigits);

      if (!passageiros || passageiros.length === 0) {
        throw new AppError("Nenhum cadastro ativo encontrado para este telefone.", 404);
      }

      const pinHash = await bcrypt.hash(newPin, 10);
      await responsavelRepository.updatePinByPhone(phoneDigits, pinHash);

      otpStore.delete(phoneDigits);

      return { success: true };
    } catch {
      throw new AppError("Sessão de redefinição expirada. Inicie o processo novamente.", 401);
    }
  },

  async resetPinByDriver(passageiroId: string, responsavelId?: string) {
    if (responsavelId) {
      await responsavelRepository.resetPinAdicional(responsavelId);
    } else {
      await responsavelRepository.resetPinPrincipal(passageiroId);
    }
    return { success: true };
  },

  async registerPushToken(phoneRaw: string, pushToken: string, platform: string) {
    const phoneDigits = onlyDigits(phoneRaw);
    if (!phoneDigits) throw new AppError("Telefone inválido para registro de token.", 400);

    const user = await usuarioPushTokenRepository.findUsuarioByTelefone(phoneDigits);
    let targetUserId = user?.id;

    if (!targetUserId) {
      const phoneWithout55 = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits.substring(2) : phoneDigits;
      const phoneWith55 = `55${phoneWithout55}`;
      const resp = await responsavelRepository.findByTelefoneVariants([phoneDigits, phoneWithout55, phoneWith55]);
      targetUserId = resp?.id || phoneDigits;
    }

    await notificationService.registerPushToken(targetUserId || phoneDigits, pushToken, platform);
    return { success: true };
  }
};
