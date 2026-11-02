/**
 * Map API error messages to user-friendly messages
 */

const errorMap = {
  // Auth errors
  'Invalid email or password': 'The email or password you entered is incorrect. Please try again.',
  'Email already registered': 'This email is already registered. Please sign in or use a different email.',
  'Account is disabled': 'Your account has been disabled. Please contact an administrator.',
  'Invalid or expired refresh token': 'Your session has expired. Please sign in again.',
  'Invalid or expired access token': 'Your session has expired. Please sign in again.',
  'Authorization header missing or invalid': 'Your session has expired. Please sign in again.',
  'Authentication required': 'Your session has expired. Please sign in again.',
  'User not found': 'No account found with this email address.',
  'Too many login attempts': 'Too many login attempts. Please wait a few minutes and try again.',
  
  // Validation errors
  'Password must be at least 8 characters': 'Your password must be at least 8 characters long.',
  'Invalid email format': 'Please enter a valid email address.',
  'Name is required': 'Please enter your name.',
  
  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'Network request failed': 'Unable to connect to the server. Please check your internet connection.',
  'NetworkError': 'Unable to connect to the server. Please check your internet connection.',
  
  // Database errors
  'Duplicate value': 'This record already exists.',
  'Database validation error': 'Please check your input and try again.',
  
  // Generic errors
  'Internal server error': 'Something went wrong on our end. Please try again later.',
  'INTERNAL_SERVER_ERROR': 'Something went wrong on our end. Please try again later.',
};

/**
 * Get a user-friendly error message
 * @param {string|Error} error - The error message or Error object
 * @returns {string} User-friendly error message
 */
export function getFriendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  
  // Check exact matches first
  if (errorMap[message]) {
    return errorMap[message];
  }

  const dbPrefix = 'Database validation error: ';
  if (message.startsWith(dbPrefix) && message.length > dbPrefix.length) {
    return message.slice(dbPrefix.length);
  }
  
  // Check partial matches (do not swallow Postgres detail on Database validation error)
  for (const [key, friendly] of Object.entries(errorMap)) {
    if (key === 'Database validation error') continue;
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return friendly;
    }
  }
  
  // Return original if no mapping found, but clean it up
  if (message.startsWith('Error:')) {
    return message.replace('Error:', '').trim();
  }
  
  return message || 'An unexpected error occurred. Please try again.';
}

export default getFriendlyError;
