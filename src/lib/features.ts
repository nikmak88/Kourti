/**
 * Build-time feature switches for self-hosted installs.
 *
 * VITE_SIGNUP_ENABLED=false hides every "create account" entry point and sends
 * anonymous visitors of the sign-up wizard back to the login page. The backend
 * enforces the same rule independently with SIGNUP_ENABLED=false.
 */
export const SIGNUP_ENABLED = import.meta.env.VITE_SIGNUP_ENABLED !== 'false';
