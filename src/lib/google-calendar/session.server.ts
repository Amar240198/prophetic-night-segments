// Server-only: Node crypto and OAuth configuration must never be imported by client components.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarError } from "./errors";

export const SESSION_COOKIE = "pns_google_session";
export const FLOW_COOKIE = "pns_google_oauth";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export interface GoogleSession {
  accessToken: string;
  email: string;
  expiresAt: number;
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

export function sealCookie(value: GoogleSession | OAuthFlow, purpose: string): string {
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

export function readSession(request: NextRequest): GoogleSession {
  googleConfig();
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) throw new GoogleCalendarError("UNAUTHENTICATED", 401);
  const value = openCookie(raw, SESSION_COOKIE) as Partial<GoogleSession> | null;
  if (
    !value ||
    typeof value.accessToken !== "string" ||
    typeof value.email !== "string" ||
    typeof value.expiresAt !== "number" ||
    value.expiresAt <= Date.now() + 10_000
  ) {
    throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  }
  return value as GoogleSession;
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
