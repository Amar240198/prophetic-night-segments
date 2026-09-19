import { NextRequest } from "next/server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import {
  errorResponse,
  googleConfig,
  privateResponse,
  readSession,
} from "@/lib/google-calendar/session.server";
import { readSyncPreference, readSyncSelection } from "@/lib/google-calendar/sync-database.server";
import { readAppUserFromRequest } from "@/lib/auth/session.server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    googleConfig();
    const appUser = await readAppUserFromRequest(request);
    if (!appUser) return privateResponse({ connected: false, configured: true });
    const session = await readSession(request, appUser.id);
    return privateResponse({
      connected: true,
      configured: true,
      email: session.email,
      expiresAt: session.expiresAt,
      syncPreference: await readSyncPreference(session.connectionId),
      syncSelection: await readSyncSelection(session.connectionId),
    });
  } catch (error) {
    if (
      error instanceof GoogleCalendarError &&
      ["UNAUTHENTICATED", "NOT_CONFIGURED"].includes(error.code)
    )
      return privateResponse({ connected: false, configured: error.code !== "NOT_CONFIGURED" });
    return errorResponse(error);
  }
}
