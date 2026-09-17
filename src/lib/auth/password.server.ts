import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(rawScrypt);
const FORMAT = "scrypt-v1";
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${FORMAT}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [format, saltText, hashText] = encoded.split("$");
  if (format !== FORMAT || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
