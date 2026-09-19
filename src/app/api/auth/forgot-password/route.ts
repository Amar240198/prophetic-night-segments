import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  createPasswordResetToken,
  normaliseEmail,
} from "@/lib/auth/session.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { email?: unknown };
    const email = normaliseEmail(body.email);
    // The token is deliberately not returned: production delivery must use a configured mail provider.
    await createPasswordResetToken(email);
  } catch {
    // Keep this endpoint enumeration-resistant.
  }
  return NextResponse.json({ message: "If an account exists, reset instructions will be sent." });
}
