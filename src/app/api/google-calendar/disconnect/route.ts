import { NextRequest } from "next/server";
import {
  assertSameOrigin,
  clearPrivateCookie,
  errorResponse,
  FLOW_COOKIE,
  privateResponse,
  sessionId,
  sessionHash,
  SESSION_COOKIE,
} from "@/lib/google-calendar/session.server";
import { deleteConnection, deleteSession } from "@/lib/google-calendar/database.server";
import { decryptToken } from "@/lib/google-calendar/tokens.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return errorResponse(error);
  }
  let revoked = false;
  const id = sessionId(request);
  try {
    const row = id ? await deleteConnection(sessionHash(id)) : null;
    if (id) await deleteSession(sessionHash(id));
    if (!row) revoked = true;
    else {
      // Credentials have already been removed locally; upstream failures cannot restore access.
      try {
        const token = row.encrypted_refresh_token
          ? decryptToken(row.encrypted_refresh_token, row.google_subject, "refresh")
          : decryptToken(row.encrypted_access_token, row.google_subject, "access");
        const result = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        revoked = result.ok;
      } catch {
        revoked = false;
      }
    }
  } catch (error) {
    // Do not claim a successful disconnect if durable invalidation failed.
    return errorResponse(error);
  }
  const response = privateResponse({ connected: false, revoked });
  clearPrivateCookie(response, SESSION_COOKIE);
  clearPrivateCookie(response, FLOW_COOKIE);
  return response;
}
