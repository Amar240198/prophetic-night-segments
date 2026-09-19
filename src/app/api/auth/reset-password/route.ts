import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, resetPassword, validPassword } from "@/lib/auth/session.server";
import { hashPassword } from "@/lib/auth/password.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    if (typeof body.token !== "string" || !validPassword(body.password)) {
      return NextResponse.json(
        { error: { code: "INVALID_RESET", message: "The reset link or password is invalid." } },
        { status: 400 },
      );
    }
    const changed = await resetPassword(body.token, await hashPassword(body.password));
    if (!changed) {
      return NextResponse.json(
        { error: { code: "INVALID_RESET", message: "The reset link is invalid or expired." } },
        { status: 400 },
      );
    }
    return NextResponse.json({ message: "Your password has been reset. You can now sign in." });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_RESET", message: "The reset link is invalid or expired." } },
      { status: 400 },
    );
  }
}
