import { NextRequest } from "next/server";
import { calendarContext } from "@/lib/miqat/service.server";
import { previewBlock, confirmBlock } from "@/lib/miqat/blocks.server";
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
    const c = await calendarContext(request);
    const input = await readBoundedJson(request);
    return privateResponse(
      await (request.nextUrl.searchParams.get("action") === "confirm"
        ? confirmBlock(c, input)
        : previewBlock(c, input)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
