import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { database } from "@/lib/google-calendar/database.server";
const COOKIE = "miqaat_session";
const MAX_AGE = 60 * 60 * 24 * 30;
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export interface AppUser {
  id: string;
  email: string;
  plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
}
export async function createUser(email: string, passwordHash: string): Promise<AppUser> {
  const rows =
    await database()`WITH created AS (INSERT INTO miqaat_users (email, password_hash) VALUES (${email}, ${passwordHash}) RETURNING id, email), entitlement AS (INSERT INTO miqaat_entitlements (user_id) SELECT id FROM created), preferences AS (INSERT INTO miqaat_preferences (user_id) SELECT id FROM created) SELECT id, email FROM created`;
  if (!rows.length) throw new Error("ACCOUNT_CREATE_FAILED");
  return { id: rows[0]!.id as string, email: rows[0]!.email as string, plan: "FREE" };
}
export async function findUser(email: string) {
  const rows =
    await database()`SELECT id, email, password_hash FROM miqaat_users WHERE email = ${email}`;
  return (rows[0] as { id: string; email: string; password_hash: string } | undefined) ?? null;
}
export async function startSession(userId: string) {
  const secret = randomBytes(32).toString("hex");
  await database()`INSERT INTO miqaat_sessions (id, user_id, expires_at) VALUES (${hash(secret)}, ${userId}, now() + (${MAX_AGE} || ' seconds')::interval)`;
  const jar = await cookies();
  jar.set(COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}
export async function readAppUser(): Promise<AppUser | null> {
  const secret = (await cookies()).get(COOKIE)?.value;
  if (!secret) return null;
  const rows =
    await database()`SELECT u.id, u.email, COALESCE(e.plan, 'FREE') AS plan FROM miqaat_sessions s JOIN miqaat_users u ON u.id = s.user_id LEFT JOIN miqaat_entitlements e ON e.user_id = u.id WHERE s.id = ${hash(secret)} AND s.expires_at > now()`;
  return (rows[0] as AppUser | undefined) ?? null;
}
export async function endSession() {
  const secret = (await cookies()).get(COOKIE)?.value;
  if (secret) await database()`DELETE FROM miqaat_sessions WHERE id = ${hash(secret)}`;
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
export function normaliseEmail(value: unknown): string {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)
    throw new Error("INVALID_EMAIL");
  return value.trim().toLowerCase();
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 200;
}
