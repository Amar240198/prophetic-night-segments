import { NextRequest, NextResponse } from "next/server";
import { createUser, normaliseEmail, startSession, validPassword } from "@/lib/auth/session.server";
import { hashPassword } from "@/lib/auth/password.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const email = normaliseEmail(body.email);
    if (!validPassword(body.password))
      return NextResponse.json(
        {
          error: { code: "INVALID_PASSWORD", message: "Use a password of at least 12 characters." },
        },
        { status: 400 },
      );
    const user = await createUser(email, await hashPassword(body.password));
    await startSession(user.id);
    return NextResponse.json(
      { user: { id: user.id, email: user.email, plan: user.plan } },
      { status: 201 },
    );
  } catch (error) {
    const duplicate = error instanceof Error && /unique/i.test(error.message);
    return NextResponse.json(
      {
        error: {
          code: duplicate ? "ACCOUNT_EXISTS" : "SIGNUP_FAILED",
          message: duplicate
            ? "An account already exists for that email."
            : "Unable to create the account.",
        },
      },
      { status: duplicate ? 409 : 400 },
    );
  }
}
