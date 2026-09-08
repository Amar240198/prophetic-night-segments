import { NextRequest } from "next/server";
import { GoogleCalendarError, type GoogleErrorCode } from "@/lib/google-calendar/errors";
import {
  insertGoogleEvent,
  readBoundedJson,
  validateSelectedEvents,
  type EventOutcome,
} from "@/lib/google-calendar/events.server";
import {
  assertSameOrigin,
  clearPrivateCookie,
  errorResponse,
  privateResponse,
  readSession,
  SESSION_COOKIE,
} from "@/lib/google-calendar/session.server";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await readSession(request);
    const events = validateSelectedEvents(await readBoundedJson(request));
    const outcomes: EventOutcome[] = [];
    let stopCode: GoogleErrorCode | undefined;
    for (const event of events) {
      if (stopCode) {
        outcomes.push({ id: event.id, status: "failed", code: stopCode });
        continue;
      }
      try {
        if (session.accessExpiresAt <= Date.now() + 10_000)
          throw new GoogleCalendarError("SESSION_EXPIRED", 401);
        outcomes.push({
          id: event.id,
          status: await insertGoogleEvent(event, session.accessToken),
        });
      } catch (error) {
        const code = error instanceof GoogleCalendarError ? error.code : "EVENT_FAILED";
        outcomes.push({ id: event.id, status: "failed", code });
        if (["SESSION_EXPIRED", "PERMISSION_DENIED", "RATE_LIMITED"].includes(code))
          stopCode = code;
      }
    }
    const response = privateResponse({ outcomes });
    if (stopCode === "SESSION_EXPIRED") clearPrivateCookie(response, SESSION_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
