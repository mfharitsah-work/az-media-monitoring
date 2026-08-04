import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "pbkdf2_sha256";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("base64url");
  return `${ALGO}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algo, iterationsText, salt, expectedHash] = storedHash.split("$");
  if (algo !== ALGO || !iterationsText || !salt || !expectedHash) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;

  const actual = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(expectedHash, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export const PASSWORD_ALGO = ALGO;
