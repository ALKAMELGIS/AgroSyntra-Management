import { getFriendlyError } from '../utils/errorMessages';

describe('getFriendlyError', () => {
  test('returns friendly message for "Invalid email or password"', () => {
    const result = getFriendlyError('Invalid email or password');
    expect(result).toBe('The email or password you entered is incorrect. Please try again.');
  });

  test('returns friendly message for "Email already registered"', () => {
    const result = getFriendlyError('Email already registered');
    expect(result).toBe('This email is already registered. Please sign in or use a different email.');
  });

  test('returns friendly message for network errors', () => {
    const result = getFriendlyError('Failed to fetch');
    expect(result).toBe('Unable to connect to the server. Please check your internet connection.');
  });

  test('returns friendly message for "Network request failed"', () => {
    const result = getFriendlyError('Network request failed');
    expect(result).toBe('Unable to connect to the server. Please check your internet connection.');
  });

  test('returns friendly message for password validation', () => {
    const result = getFriendlyError('Password must be at least 8 characters');
    expect(result).toBe('Your password must be at least 8 characters long.');
  });

  test('returns friendly message for server errors', () => {
    const result = getFriendlyError('Internal server error');
    expect(result).toBe('Something went wrong on our end. Please try again later.');
  });

  test('returns friendly message for session expiry', () => {
    const result = getFriendlyError('Invalid or expired refresh token');
    expect(result).toBe('Your session has expired. Please sign in again.');
  });

  test('returns friendly message for missing auth header', () => {
    const result = getFriendlyError('Authorization header missing or invalid');
    expect(result).toBe('Your session has expired. Please sign in again.');
  });

  test('handles Error objects', () => {
    const error = new Error('Invalid email or password');
    const result = getFriendlyError(error);
    expect(result).toBe('The email or password you entered is incorrect. Please try again.');
  });

  test('handles partial matches (case insensitive)', () => {
    const result = getFriendlyError('FAILED TO FETCH data from server');
    expect(result).toBe('Unable to connect to the server. Please check your internet connection.');
  });

  test('strips "Error:" prefix from unknown errors', () => {
    const result = getFriendlyError('Error: Some unknown error');
    expect(result).toBe('Some unknown error');
  });

  test('returns original message for unknown errors', () => {
    const result = getFriendlyError('Some completely unknown error message');
    expect(result).toBe('Some completely unknown error message');
  });

  test('keeps Postgres detail on Database validation error', () => {
    expect(getFriendlyError('Database validation error')).toBe('Please check your input and try again.');
    expect(
      getFriendlyError('Database validation error: invalid input syntax for type date: "14/03/2026"')
    ).toBe('invalid input syntax for type date: "14/03/2026"');
  });

  test('returns default message for empty input', () => {
    const result = getFriendlyError('');
    expect(result).toBe('An unexpected error occurred. Please try again.');
  });

  test('returns default message for null/undefined', () => {
    const result = getFriendlyError(null);
    expect(result).toContain('null');
  });
});
