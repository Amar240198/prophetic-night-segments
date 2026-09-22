import { NextRequest } from "next/server";
import { calendarContext, timeline } from "@/lib/miqat/service.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import {
  assertSameOrigin,
  errorResponse,
  privateResponse,
} from "@/lib/google-calendar/session.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await calendarContext(request);
    return privateResponse(await timeline(context, await readBoundedJson(request)));
  } catch (e) {
    return errorResponse(e);
  }
}
