import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * argon2id at the OWASP-recommended minimum (19 MiB, t=2, p=1). Passed explicitly
 * because library defaults differ between versions.
 *
 * hash-wasm is pure WebAssembly: no native binaries, so `npm install` behaves the
 * same on Windows, macOS, and Linux.
 */
const PARAMS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
} as const;

/** Returns a standard PHC-encoded hash: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = new Uint8Array(randomBytes(16));
  return argon2id({ password: plain, salt, ...PARAMS, outputType: 'encoded' });
}

/**
 * Never throws. A malformed hash, or a hash from a different algorithm (say, an
 * old scrypt string in a stale database), is simply not a match.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: plain, hash });
  } catch {
    return false;
  }
}
