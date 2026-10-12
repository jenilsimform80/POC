import argon2 from 'argon2';

// argon2id with the library defaults (memory-hard; OWASP-recommended family).
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // malformed hash must not crash the request
  }
}

// Verified against when the email is unknown, so "no such user" and "wrong password" take
// similar time and cannot be told apart by response timing.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword('timing-equalizer-not-a-real-password');
  await verifyPassword(await dummyHash, plain);
}
