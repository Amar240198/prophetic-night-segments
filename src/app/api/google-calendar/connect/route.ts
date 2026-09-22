import { requireFeature } from "@/lib/product/entitlements.server";
import { NextRequest } from "next/server";
import { completionRedirect, startOAuth } from "@/lib/google-calendar/oauth.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { readAppUserFromRequest } from "@/lib/auth/session.server";
import { assertSameOrigin, errorResponse } from "@/lib/google-calendar/session.server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await readAppUserFromRequest(request);
    if (!user) throw new GoogleCalendarError("UNAUTHENTICATED", 401);
    await requireFeature(user.id, "calendar-read");
    return startOAuth(user.id);
  } catch (error) {
    return completionRedirect(
      request,
      error instanceof GoogleCalendarError ? error.code : "CONNECTION_FAILED",
    );
  }
}
/** Explicit management upgrade is a same-origin POST, never a link or redirect parameter. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await readAppUserFromRequest(request);
    if (!user) throw new GoogleCalendarError("UNAUTHENTICATED", 401);
    await requireFeature(user.id, "calendar-write");
    return startOAuth(user.id, true);
  } catch (error) {
    return errorResponse(error);
  }
}
