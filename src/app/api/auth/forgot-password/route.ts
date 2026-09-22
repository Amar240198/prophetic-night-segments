import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  createPasswordResetToken,
  normaliseEmail,
} from "@/lib/auth/session.server";
import { emailDelivery, resetOrigin } from "@/lib/email/delivery.server";
import { rateLimit } from "@/lib/auth/rate-limit.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { message: "Request could not be verified." } },
      { status: 403 },
    );
  }
  let delivery, origin;
  try {
    delivery = emailDelivery();
    origin = resetOrigin();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "EMAIL_NOT_CONFIGURED",
          message: "Password-reset email is currently unavailable. Please try again later.",
        },
      },
      { status: 503 },
    );
  }
  try {
    const body = (await readBoundedJson(request)) as { email?: unknown };
    const email = normaliseEmail(body.email);
    if (!(await rateLimit(`reset:${email}`, 3, 3600)))
      return NextResponse.json({
        message: "If an account exists, you can request reset instructions again later.",
      });
    const token = await createPasswordResetToken(email);
    if (token)
      await delivery.send({
        to: email,
        subject: "Reset your Miqāt password",
        text: `Use this link within one hour to reset your password: ${origin}/reset-password?token=${token}\n\nIf you did not request this, ignore this email.`,
      });
  } catch {
    console.warn(JSON.stringify({ event: "password_reset_delivery_failed" }));
    return NextResponse.json(
      { error: { message: "Reset instructions could not be requested. Please try again later." } },
      { status: 503 },
    );
  }
  return NextResponse.json({
    message: "If an account exists, reset instructions have been requested.",
  });
}
