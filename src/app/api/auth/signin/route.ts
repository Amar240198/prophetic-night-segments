import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  findUser,
  normaliseEmail,
  startSession,
  validPassword,
} from "@/lib/auth/session.server";
import { verifyPassword } from "@/lib/auth/password.server";
import { rateLimit } from "@/lib/auth/rate-limit.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await readBoundedJson(request)) as { email?: unknown; password?: unknown };
    const email = normaliseEmail(body.email);
    if (!(await rateLimit("signin:" + email, 10, 900)))
      return NextResponse.json(
        { error: { message: "Too many attempts. Please wait before trying again." } },
        { status: 429 },
      );
    if (!validPassword(body.password)) throw new Error("INVALID_CREDENTIALS");
    const user = await findUser(email);
    if (!user || !(await verifyPassword(body.password, user.password_hash)))
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } },
        { status: 401 },
      );
    await startSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } },
      { status: 401 },
    );
  }
}
