import { Logger } from '@nestjs/common';

const DEV_SECRET = 'hireflow-dev-only-secret-do-not-use-in-production';

/**
 * JWT signing secret. Production refuses to start without a strong one;
 * development falls back to a fixed, clearly-labelled secret with a warning.
 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }
  if (secret) throw new Error('JWT_SECRET is too short; use at least 32 characters');
  Logger.warn('JWT_SECRET not set: using an insecure development secret', 'Auth');
  return DEV_SECRET;
}

export const jwtExpiresIn = (env: NodeJS.ProcessEnv = process.env) => env.JWT_EXPIRES_IN || '8h';

export const signupAllowed = (env: NodeJS.ProcessEnv = process.env) =>
  (env.ALLOW_SIGNUP ?? 'true').toLowerCase() !== 'false';

/** Login/register attempts per minute per client IP. */
export const authRateLimit = (env: NodeJS.ProcessEnv = process.env) => Number(env.AUTH_RATE_LIMIT ?? 10);
