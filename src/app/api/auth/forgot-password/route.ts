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
    console.warn(
      JSON.stringify({
        event: "password_reset_configuration_missing",
        missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"].filter(
          (name) => !process.env[name],
        ),
      }),
    );
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
  let email: string;
  try {
    const body = (await readBoundedJson(request)) as { email?: unknown };
    email = normaliseEmail(body.email);
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } },
      { status: 400 },
    );
  }
  try {
    if (!(await rateLimit(`reset:${email}`, 3, 3600)))
      return NextResponse.json({
        message: "If an account exists, reset instructions have been requested.",
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
    // Do not disclose account existence through account-specific SMTP failures.
    // Operators must monitor this event; request acceptance is not inbox delivery.
  }
  return NextResponse.json({
    message: "If an account exists, reset instructions have been requested.",
  });
}
