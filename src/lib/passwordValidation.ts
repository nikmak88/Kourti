/**
 * Shared password validation utility.
 * Enforces consistent password policy across all password forms. Messages are
 * translated at call time (namespace "auth", keys password.rules.*), so they
 * follow the current UI language.
 */
import i18n from '@/i18n';

export interface PasswordValidationResult {
  valid: boolean;
  error: string | null;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < 12) {
    return { valid: false, error: i18n.t('auth:password.rules.minLengthError', { count: 12 }) };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: i18n.t('auth:password.rules.uppercaseError') };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: i18n.t('auth:password.rules.lowercaseError') };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: i18n.t('auth:password.rules.numberError') };
  }
  return { valid: true, error: null };
}

/** `label` is read at render time so it follows a language switch. */
export const PASSWORD_REQUIREMENTS = [
  {
    key: 'minLength',
    get label() {
      return i18n.t('auth:password.rules.minLength', { count: 12 });
    },
    test: (p: string) => p.length >= 12,
  },
  {
    key: 'uppercase',
    get label() {
      return i18n.t('auth:password.rules.uppercase');
    },
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    key: 'lowercase',
    get label() {
      return i18n.t('auth:password.rules.lowercase');
    },
    test: (p: string) => /[a-z]/.test(p),
  },
  {
    key: 'number',
    get label() {
      return i18n.t('auth:password.rules.number');
    },
    test: (p: string) => /[0-9]/.test(p),
  },
] as const;
