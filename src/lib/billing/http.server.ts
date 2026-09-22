import { NextRequest, NextResponse } from "next/server";
import { readAppUserFromRequest } from "@/lib/auth/session.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { rateLimit } from "@/lib/auth/rate-limit.server";
import { BillingError } from "./config.server";
export async function billingAction(
  request: NextRequest,
  action: (user: { id: string; email: string }) => Promise<unknown>,
) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new BillingError("FORBIDDEN", 403, "Request could not be verified.");
    const user = await readAppUserFromRequest(request);
    if (!user) throw new BillingError("UNAUTHENTICATED", 401, "Sign in to manage billing.");
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      throw new BillingError(
        "INVALID_REQUEST",
        400,
        "Billing settings are selected securely by Miqāt.",
      );
    if (!(await rateLimit(`billing:${user.id}`, 10, 60)))
      throw new BillingError("RATE_LIMITED", 429, "Please wait a moment before retrying.");
    return NextResponse.json(await action(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const error = e instanceof BillingError ? e : new BillingError("BILLING_UNAVAILABLE");
    console.warn(JSON.stringify({ event: "billing_request_failed", code: error.code }));
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
