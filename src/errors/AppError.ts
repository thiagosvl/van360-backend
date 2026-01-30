export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public field?: string;

  constructor(message: string, statusCode = 400, isOperational = true, field?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.field = field;

    // Captura o stack trace, excluindo o construtor dessa classe
    Error.captureStackTrace(this, this.constructor);
    this.name = 'AppError';
  }
}
