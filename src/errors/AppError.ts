export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Captura o stack trace, excluindo o construtor dessa classe
    Error.captureStackTrace(this, this.constructor);
  }
}
