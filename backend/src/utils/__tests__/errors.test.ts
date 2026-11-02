import { AppError, NotFoundError } from '../errors';

describe('AppError', () => {
  it('should create an AppError with default values', () => {
    const error = new AppError('Test error', 'TEST_ERROR', 400);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.status).toBe(400);
    expect(error.details).toBeUndefined();
    expect(error instanceof Error).toBe(true);
  });

  it('should create an AppError with details', () => {
    const details = { field: 'email', reason: 'invalid' };
    const error = new AppError('Validation failed', 'VALIDATION_ERROR', 400, details);

    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(400);
    expect(error.details).toEqual(details);
  });

  it('should have correct error name', () => {
    const error = new AppError('Test', 'TEST', 500);
    expect(error.name).toBe('AppError');
  });
});

describe('NotFoundError', () => {
  // Every call site passes a complete message - 'Record not found', 'Field not
  // found' - rather than a bare resource name, so the class must not append
  // anything of its own or those all read '... not found not found'.
  it('should carry the message it is given unchanged', () => {
    const error = new NotFoundError('User not found');

    expect(error.message).toBe('User not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error instanceof AppError).toBe(true);
  });

  it('should fall back to a default message', () => {
    expect(new NotFoundError().message).toBe('Not found');
  });

  it('should report its own name rather than the base class name', () => {
    expect(new NotFoundError('User not found').name).toBe('NotFoundError');
  });
});
