import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, endSession } from "@/lib/auth/session.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Request origin is not allowed." } },
      { status: 403 },
    );
  }
  await endSession();
  return NextResponse.json({ ok: true });
}
