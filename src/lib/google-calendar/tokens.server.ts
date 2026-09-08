import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { GoogleCalendarError } from "./errors";

function key() {
  const secret = process.env.GOOGLE_SESSION_SECRET;
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret))
    throw new GoogleCalendarError("NOT_CONFIGURED", 503);
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "base64"), "pns-google-db-v1", "token-encryption", 32),
  );
}

export function encryptToken(token: string, subject: string, kind: "access" | "refresh"): string {
  if (!token || token.length > 4096) throw new GoogleCalendarError("CONNECTION_FAILED", 502);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(["v1", subject, kind])));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

export function decryptToken(value: string, subject: string, kind: "access" | "refresh"): string {
  try {
    if (!value.startsWith("v1.") || value.length > 6000) throw new Error();
    const bytes = Buffer.from(value.slice(3), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(JSON.stringify(["v1", subject, kind])));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  }
}
