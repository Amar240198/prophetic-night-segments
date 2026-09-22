import { NextRequest, NextResponse } from "next/server";
import { billingConfig, stripeClient, BillingError } from "@/lib/billing/config.server";
import { processBillingEvent } from "@/lib/billing/service.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let stripe, config;
  try {
    config = billingConfig();
    stripe = stripeClient();
  } catch {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  // Stream with a bound; preserve the exact bytes required by Stripe signature verification.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1048576) {
        await reader.cancel();
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, config.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    return NextResponse.json(await processBillingEvent(event, stripe));
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "stripe_webhook_failed",
        stripeEventId: event.id,
        type: event.type,
        code: e instanceof BillingError ? e.code : "PROCESSING_FAILED",
      }),
    );
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: e instanceof BillingError && e.status === 400 ? 400 : 500 },
    );
  }
}
