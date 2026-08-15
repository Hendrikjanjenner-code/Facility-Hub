import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Format: s2:<saltHex>:<scryptHashHex> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `s2:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [tag, salt, hash] = stored.split(":");
  if (tag !== "s2" || !salt || !hash) return false;
  const calc = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return calc.length === expected.length && timingSafeEqual(calc, expected);
}
