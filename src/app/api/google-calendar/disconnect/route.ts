import { NextRequest } from "next/server";
import {
  assertSameOrigin,
  clearPrivateCookie,
  errorResponse,
  FLOW_COOKIE,
  privateResponse,
  readSession,
  SESSION_COOKIE,
} from "@/lib/google-calendar/session.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return errorResponse(error);
  }
  let revoked = false;
  try {
    const session = readSession(request);
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: session.accessToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    revoked = response.ok;
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.code === "UNAUTHENTICATED") revoked = true;
  }
  const response = privateResponse({ connected: false, revoked });
  clearPrivateCookie(response, SESSION_COOKIE);
  clearPrivateCookie(response, FLOW_COOKIE);
  return response;
}
