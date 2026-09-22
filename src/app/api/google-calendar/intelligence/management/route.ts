import { NextRequest } from "next/server";
import { calendarContext } from "@/lib/miqat/service.server";
import { database } from "@/lib/google-calendar/database.server";
import {
  assertSameOrigin,
  errorResponse,
  privateResponse,
} from "@/lib/google-calendar/session.server";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const c = await calendarContext(request);
    await database()`UPDATE google_connections SET management_enabled=false,updated_at=now() WHERE id=${c.session.connectionId} AND user_id=${c.user.id}`;
    return privateResponse({ managementEnabled: false });
  } catch (e) {
    return errorResponse(e);
  }
}
