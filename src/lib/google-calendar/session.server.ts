// Server-only: Node crypto and OAuth configuration must never be imported by client components.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarError } from "./errors";
import { findSession, updateTokens } from "./database.server";
import { decryptToken, encryptToken } from "./tokens.server";

export const SESSION_COOKIE = "pns_google_session";
export const FLOW_COOKIE = "pns_google_oauth";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export interface GoogleSession {
  accessToken: string;
  email: string;
  expiresAt: number;
  accessExpiresAt: number;
}
export interface OAuthFlow {
  state: string;
  verifier: string;
  expiresAt: number;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const secret = process.env.GOOGLE_SESSION_SECRET;
  if (
    !process.env.DATABASE_URL ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !secret ||
    !/^[A-Za-z0-9+/]{43}=$/.test(secret)
  ) {
    throw new GoogleCalendarError("NOT_CONFIGURED", 503);
  }
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new GoogleCalendarError("NOT_CONFIGURED", 503);
  }
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
    url.pathname !== "/api/google-calendar/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new GoogleCalendarError("NOT_CONFIGURED", 503);
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    origin: url.origin,
    secure: url.protocol === "https:",
    key: Buffer.from(secret, "base64"),
  };
}

export function sealCookie(value: OAuthFlow, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", googleConfig().key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (sealed.length > 3800) throw new GoogleCalendarError("CONNECTION_FAILED", 502);
  return sealed;
}

export function openCookie(value: string | undefined, purpose: string): unknown {
  if (!value || value.length > 3800) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", googleConfig().key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
    );
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

export function sessionHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function sessionId(request: NextRequest): string | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}

export async function readSession(request: NextRequest): Promise<GoogleSession> {
  const config = googleConfig();
  const raw = sessionId(request);
  if (!request.cookies.get(SESSION_COOKIE)?.value)
    throw new GoogleCalendarError("UNAUTHENTICATED", 401);
  if (!raw) throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  let row = await findSession(sessionHash(raw));
  if (
    !row ||
    !Number.isFinite(Date.parse(row.session_expires_at)) ||
    Date.parse(row.session_expires_at) <= Date.now() + 10_000
  )
    throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  if (!Number.isFinite(Date.parse(row.access_token_expires_at)))
    throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  if (Date.parse(row.access_token_expires_at) <= Date.now() + 30_000) {
    if (!row.encrypted_refresh_token) throw new GoogleCalendarError("SESSION_EXPIRED", 401);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: decryptToken(row.encrypted_refresh_token, row.google_subject, "refresh"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const token = await response.json().catch(() => null);
    if (!response.ok) {
      if (token?.error === "invalid_grant") throw new GoogleCalendarError("SESSION_EXPIRED", 401);
      throw new GoogleCalendarError("CONNECTION_FAILED", 502);
    }
    if (
      !token ||
      typeof token.access_token !== "string" ||
      !token.access_token ||
      token.access_token.length > 4096 ||
      token.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 30 ||
      (token.refresh_token !== undefined &&
        (typeof token.refresh_token !== "string" ||
          !token.refresh_token ||
          token.refresh_token.length > 4096)) ||
      (token.scope !== undefined &&
        (typeof token.scope !== "string" || !token.scope.split(" ").includes(CALENDAR_SCOPE)))
    )
      throw new GoogleCalendarError("CONNECTION_FAILED", 502);
    await updateTokens(
      row,
      encryptToken(token.access_token, row.google_subject, "access"),
      token.refresh_token ? encryptToken(token.refresh_token, row.google_subject, "refresh") : null,
      new Date(Date.now() + Math.min(token.expires_in, 3600) * 1000).toISOString(),
    );
    // Re-read after CAS, including concurrent disconnect/reconnect.
    row = await findSession(sessionHash(raw));
    if (
      !row ||
      Date.parse(row.session_expires_at) <= Date.now() + 10_000 ||
      Date.parse(row.access_token_expires_at) <= Date.now() + 10_000
    )
      throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  }
  return {
    accessToken: decryptToken(row.encrypted_access_token, row.google_subject, "access"),
    email: row.google_account_email,
    expiresAt: row.encrypted_refresh_token
      ? Date.parse(row.session_expires_at)
      : Math.min(Date.parse(row.session_expires_at), Date.parse(row.access_token_expires_at)),
    accessExpiresAt: Date.parse(row.access_token_expires_at),
  };
}

export function setPrivateCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: googleConfig().secure,
    sameSite: "lax",
    path: "/api/google-calendar",
    maxAge,
  });
}

export function clearPrivateCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    secure: process.env.GOOGLE_OAUTH_REDIRECT_URI?.startsWith("https:") ?? false,
    sameSite: "lax",
    path: "/api/google-calendar",
    maxAge: 0,
  });
}

export function assertSameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== googleConfig().origin)
    throw new GoogleCalendarError("FORBIDDEN", 403);
}

export function privateResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function errorResponse(error: unknown) {
  const safe =
    error instanceof GoogleCalendarError
      ? error
      : new GoogleCalendarError("CONNECTION_FAILED", 502);
  const response = privateResponse(
    { error: { code: safe.code, message: safe.message } },
    safe.status,
  );
  if (safe.code === "SESSION_EXPIRED") clearPrivateCookie(response, SESSION_COOKIE);
  return response;
}
