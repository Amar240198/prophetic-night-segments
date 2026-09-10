import { NextRequest } from "next/server";
import {
  assertSameOrigin,
  errorResponse,
  privateResponse,
  readSession,
} from "@/lib/google-calendar/session.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { validateSyncRequest } from "@/lib/google-calendar/sync-plan.server";
import { syncCalendar } from "@/lib/google-calendar/sync.server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = validateSyncRequest(await readBoundedJson(request));
    const session = await readSession(request);
    return privateResponse(await syncCalendar(input, request, session));
  } catch (error) {
    return errorResponse(error);
  }
}
