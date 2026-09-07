import { NextRequest } from "next/server";
import { completionRedirect, startOAuth } from "@/lib/google-calendar/oauth.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return startOAuth();
  } catch (error) {
    return completionRedirect(
      request,
      error instanceof GoogleCalendarError ? error.code : "CONNECTION_FAILED",
    );
  }
}
