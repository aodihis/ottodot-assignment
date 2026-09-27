import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/helpers/password';

describe('password hashing (argon2id)', () => {
  it('produces a PHC-encoded argon2id hash that verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('salts every hash, so the same password hashes differently', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');

    expect(first).not.toBe(second);
    expect(await verifyPassword(second, 'same-password')).toBe(true);
  });

  it('returns false, never throws, for a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false);
    await expect(verifyPassword('', 'whatever')).resolves.toBe(false);
  });

  it('returns false, never throws, for a hash from another algorithm', async () => {
    // e.g. a leftover scrypt hash from a database created before the argon2 swap
    await expect(
      verifyPassword('$scrypt$ln=16384,r=8,p=1$c2FsdA$aGFzaA', 'whatever'),
    ).resolves.toBe(false);
  });
});
