import Stripe from "stripe";
export class BillingError extends Error {
  constructor(
    public code: string,
    public status = 503,
    message = "Billing is temporarily unavailable. Your free features remain available.",
  ) {
    super(message);
  }
}
export function billingConfig() {
  const secret = process.env.STRIPE_SECRET_KEY,
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
    priceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const mode = process.env.STRIPE_MODE ?? "test";
  if (
    !secret ||
    !webhookSecret ||
    !priceId ||
    !priceId.startsWith("price_") ||
    !webhookSecret.startsWith("whsec_") ||
    !["test", "live"].includes(mode) ||
    !secret.startsWith(`sk_${mode}_`)
  )
    throw new BillingError("BILLING_NOT_CONFIGURED");
  // Live mode is an explicit operator action after the separate acceptance gate.
  if (mode === "live" && process.env.STRIPE_LIVE_ENABLED !== "true")
    throw new BillingError("BILLING_LIVE_DISABLED");
  const origin =
    process.env.APP_ORIGIN ??
    (process.env.GOOGLE_OAUTH_REDIRECT_URI
      ? new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI).origin
      : "");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new BillingError("BILLING_NOT_CONFIGURED");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))
  )
    throw new BillingError("BILLING_NOT_CONFIGURED");
  return { secret, webhookSecret, priceId, livemode: mode === "live", origin: url.origin };
}
export function stripeClient() {
  return new Stripe(billingConfig().secret, { maxNetworkRetries: 2, timeout: 10000 });
}
