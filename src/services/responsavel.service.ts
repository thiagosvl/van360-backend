import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import { responsavelRepository } from "../repositories/responsavel.repository.js";
import { onlyDigits } from "../utils/string.utils.js";

const JWT_SECRET = process.env.JWT_SECRET || "van360_responsavel_secret_key_2026";
const TOKEN_EXPIRATION = "30d";

export interface ResponsavelTokenPayload {
  phone: string;
  passageiro_ids: string[];
}

export const responsavelService = {
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

    for (const p of passageiros) {
      if (p.tipo_responsavel === "principal") {
        await responsavelRepository.updatePinPrincipal(p.id, pinHash);
      } else {
        await responsavelRepository.updatePinAdicional(p.responsavel_id, pinHash);
      }
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

  async getPassageiroCarteirinha(token: string, passageiroId: string) {
    const payload = await this.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    return responsavelRepository.getPassageiroCarteirinha(passageiroId);
  },

  async resetPinByDriver(passageiroId: string, responsavelId?: string) {
    if (responsavelId) {
      await responsavelRepository.resetPinAdicional(responsavelId);
    } else {
      await responsavelRepository.resetPinPrincipal(passageiroId);
    }
    return { success: true };
  }
};
