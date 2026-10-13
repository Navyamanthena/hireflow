import { jwtSecret, signupAllowed } from './auth.config';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('Correct-horse-battery', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same-password-123')).not.toBe(await hashPassword('same-password-123'));
  });

  it('never matches the dummy hash or malformed input', async () => {
    await expect(verifyPassword('', DUMMY_HASH)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$x$y')).resolves.toBe(false);
  });
});

describe('auth config', () => {
  const strong = 'x'.repeat(32);

  it('requires a strong JWT secret in production', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production' })).toThrow(/at least 32/);
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(jwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });

  it('rejects a short secret even in development', () => {
    expect(() => jwtSecret({ JWT_SECRET: 'short' })).toThrow(/too short/);
  });

  it('allows sign-up unless explicitly disabled', () => {
    expect(signupAllowed({})).toBe(true);
    expect(signupAllowed({ ALLOW_SIGNUP: 'false' })).toBe(false);
  });
});
