import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarError } from "./errors";
import { persistConnection } from "./database.server";
import { encryptToken } from "./tokens.server";
import {
  SESSION_MAX_AGE,
  sessionHash,
  CALENDAR_SCOPE,
  EMAIL_SCOPE,
  FLOW_COOKIE,
  SESSION_COOKIE,
  clearPrivateCookie,
  googleConfig,
  openCookie,
  sealCookie,
  setPrivateCookie,
  type OAuthFlow,
} from "./session.server";

export function completionRedirect(request: NextRequest, status: string) {
  // Relative destination on this deployment; never accept a return URL from the request.
  const url = new URL("/google-calendar/complete", request.url);
  url.searchParams.set("status", status);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function startOAuth() {
  const config = googleConfig();
  const flow: OAuthFlow = {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + 600_000,
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: `${CALENDAR_SCOPE} ${EMAIL_SCOPE}`,
    access_type: "offline",
    prompt: "select_account consent",
    state: flow.state,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  setPrivateCookie(response, FLOW_COOKIE, sealCookie(flow, FLOW_COOKIE), 600);
  return response;
}

export async function finishOAuth(request: NextRequest) {
  let response: NextResponse;
  try {
    const config = googleConfig();
    const flow = openCookie(
      request.cookies.get(FLOW_COOKIE)?.value,
      FLOW_COOKIE,
    ) as Partial<OAuthFlow> | null;
    const state = request.nextUrl.searchParams.get("state") ?? "";
    if (
      !flow ||
      typeof flow.state !== "string" ||
      typeof flow.verifier !== "string" ||
      typeof flow.expiresAt !== "number" ||
      flow.expiresAt <= Date.now() ||
      state.length !== flow.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))
    ) {
      throw new GoogleCalendarError("CONNECTION_FAILED");
    }
    if (request.nextUrl.searchParams.get("error") === "access_denied")
      throw new GoogleCalendarError("PERMISSION_DENIED");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096 || request.nextUrl.searchParams.has("error"))
      throw new GoogleCalendarError("CONNECTION_FAILED");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
        code_verifier: flow.verifier,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new GoogleCalendarError("CONNECTION_FAILED");
    const token = await tokenResponse.json();
    if (typeof token.scope !== "string" || !token.scope.split(" ").includes(CALENDAR_SCOPE))
      throw new GoogleCalendarError("PERMISSION_DENIED");
    if (
      typeof token.access_token !== "string" ||
      !token.access_token ||
      (token.refresh_token !== undefined &&
        (typeof token.refresh_token !== "string" ||
          !token.refresh_token ||
          token.refresh_token.length > 4096)) ||
      token.access_token.length > 2048 ||
      token.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 30
    )
      throw new GoogleCalendarError("CONNECTION_FAILED");
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!userResponse.ok) throw new GoogleCalendarError("CONNECTION_FAILED");
    const user = await userResponse.json();
    if (
      typeof user.id !== "string" ||
      !user.id ||
      user.id.length > 255 ||
      typeof user.email !== "string" ||
      user.email.length > 254 ||
      user.verified_email !== true
    )
      throw new GoogleCalendarError("CONNECTION_FAILED");
    const seconds = Math.min(Math.floor(token.expires_in), 3600);
    const opaqueId = randomBytes(32).toString("base64url");
    await persistConnection({
      connectionId: randomUUID(),
      subject: user.id,
      email: user.email,
      accessToken: encryptToken(token.access_token, user.id, "access"),
      refreshToken: token.refresh_token
        ? encryptToken(token.refresh_token, user.id, "refresh")
        : null,
      accessExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      sessionHash: sessionHash(opaqueId),
      sessionExpiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
    });
    response = completionRedirect(request, "connected");
    setPrivateCookie(response, SESSION_COOKIE, opaqueId, SESSION_MAX_AGE);
  } catch (error) {
    response = completionRedirect(
      request,
      error instanceof GoogleCalendarError ? error.code : "CONNECTION_FAILED",
    );
  }
  clearPrivateCookie(response, FLOW_COOKIE);
  return response;
}
