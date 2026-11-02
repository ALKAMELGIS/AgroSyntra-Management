export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'INTERNAL_ERROR', status = 500, details?: Record<string, unknown>) {
    super(message);
    // Extending Error leaves name as 'Error', so every application error would
    // otherwise be logged as a generic one. new.target gives subclasses their
    // own name rather than all of them reporting 'AppError'.
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, details);
  }
}
