import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { database } from "@/lib/google-calendar/database.server";
import { BillingError, billingConfig, stripeClient } from "./config.server";
import { PRO_PLAN } from "./plans";
export const BILLING_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
export async function configuredPrice(stripe: Stripe) {
  const c = billingConfig();
  const price = await stripe.prices.retrieve(c.priceId);
  if (
    !price.active ||
    price.livemode !== c.livemode ||
    price.currency !== PRO_PLAN.currency ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.unit_amount !== PRO_PLAN.monthlyAmount
  )
    throw new BillingError("INVALID_BILLING_PRICE");
  return price;
}
export async function withBillingLock<T>(
  userId: string,
  action: (owner: string) => Promise<T>,
): Promise<T> {
  const owner = randomUUID();
  const rows =
    await database()`UPDATE miqaat_entitlements SET billing_lock=${owner}::uuid,billing_lock_until=now()+interval '600 seconds' WHERE user_id=${userId} AND (billing_lock_until IS NULL OR billing_lock_until<now()) RETURNING user_id`;
  if (!rows.length)
    throw new BillingError(
      "BILLING_BUSY",
      409,
      "Billing is already being updated. Please retry shortly.",
    );
  try {
    return await action(owner);
  } finally {
    await database()`UPDATE miqaat_entitlements SET billing_lock=NULL,billing_lock_until=NULL WHERE user_id=${userId} AND billing_lock=${owner}::uuid`;
  }
}
async function stored(userId: string) {
  const rows = await database()`SELECT * FROM miqaat_entitlements WHERE user_id=${userId}`;
  if (!rows.length) throw new BillingError("BILLING_ACCOUNT_MISSING");
  return rows[0]!;
}
export async function createCheckout(user: { id: string; email: string }, stripe = stripeClient()) {
  const config = billingConfig();
  await configuredPrice(stripe);
  return withBillingLock(user.id, async (owner) => {
    let row = await stored(user.id);
    let customer = row.provider_customer_id as string | undefined;
    if (customer && row.stripe_livemode !== null && row.stripe_livemode !== config.livemode)
      throw new BillingError("BILLING_MODE_MISMATCH");
    if (!customer) {
      const matches = await stripe.customers.search({
        query: `metadata['miqat_user_id']:'${user.id}'`,
        limit: 2,
      });
      if (matches.data.length > 1) throw new BillingError("CUSTOMER_RECONCILIATION_REQUIRED");
      customer =
        matches.data[0]?.id ??
        (
          await stripe.customers.create(
            { email: user.email, metadata: { miqat_user_id: user.id } },
            { idempotencyKey: `miqat-customer-${config.livemode}-${user.id}` },
          )
        ).id;
      await database()`UPDATE miqaat_entitlements SET provider_customer_id=${customer},stripe_livemode=${config.livemode},updated_at=now() WHERE user_id=${user.id}`;
    }
    const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
    if (
      subscriptions.has_more ||
      subscriptions.data.some((s) => !["canceled", "incomplete_expired"].includes(s.status))
    )
      throw new BillingError(
        "SUBSCRIPTION_EXISTS",
        409,
        "A subscription already exists. Manage it from Account.",
      );
    row = await stored(user.id);
    // Recover a session even if Stripe succeeded but the database response was interrupted.
    const previous = await stripe.checkout.sessions.list({ customer, limit: 100 });
    if (previous.has_more) throw new BillingError("CHECKOUT_RECONCILIATION_REQUIRED");
    const open = previous.data.find(
      (s) => s.status === "open" && s.mode === "subscription" && s.client_reference_id === user.id,
    );
    if (open?.url) return { url: open.url };
    const pending = previous.data.find(
      (s) =>
        s.status === "complete" &&
        s.client_reference_id === user.id &&
        !subscriptions.data.some((sub) => sub.id === id(s.subscription)),
    );
    if (pending)
      throw new BillingError(
        "ACTIVATION_PENDING",
        409,
        "Your payment is being confirmed. Check Account shortly.",
      );
    // An expired/completed attempt can be replaced. An interrupted attempt keeps its key.
    const resolved =
      row.checkout_attempt_id &&
      previous.data.some((s) => s.metadata?.miqat_attempt_id === row.checkout_attempt_id);
    const attempt =
      !resolved && row.checkout_attempt_id ? String(row.checkout_attempt_id) : randomUUID();
    const claimed =
      await database()`UPDATE miqaat_entitlements SET checkout_attempt_id=${attempt}::uuid WHERE user_id=${user.id} AND billing_lock=${owner}::uuid AND billing_lock_until>now() RETURNING user_id`;
    if (!claimed.length) throw new BillingError("BILLING_BUSY", 409);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        line_items: [{ price: config.priceId, quantity: 1 }],
        client_reference_id: user.id,
        metadata: { miqat_user_id: user.id, miqat_attempt_id: attempt },
        subscription_data: { metadata: { miqat_user_id: user.id } },
        success_url: `${config.origin}/billing/success`,
        cancel_url: `${config.origin}/pricing?checkout=cancelled`,
      },
      { idempotencyKey: `miqat-checkout-${user.id}-${attempt}` },
    );
    if (!session.url) throw new BillingError("CHECKOUT_UNAVAILABLE");
    await database()`UPDATE miqaat_entitlements SET checkout_session_id=${session.id},updated_at=now() WHERE user_id=${user.id}`;
    return { url: session.url };
  });
}
export async function createPortal(userId: string, stripe = stripeClient()) {
  const row = await stored(userId);
  const c = billingConfig();
  if (!row.provider_customer_id || row.stripe_livemode !== c.livemode)
    throw new BillingError("NO_BILLING_ACCOUNT", 409, "No billing account is available yet.");
  const session = await stripe.billingPortal.sessions.create({
    customer: String(row.provider_customer_id),
    return_url: `${c.origin}/app/account`,
  });
  return { url: session.url };
}
export async function persistSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  event?: Stripe.Event,
) {
  const c = billingConfig(),
    customer = id(subscription.customer),
    item = subscription.items.data.find((i) => i.price.id === c.priceId);
  if (subscription.livemode !== c.livemode || subscription.metadata.miqat_user_id !== userId)
    throw new BillingError("SUBSCRIPTION_CORRELATION_FAILED", 400);
  const start = item?.current_period_start,
    end = item?.current_period_end;
  const eligible = !!item && ["active", "trialing"].includes(subscription.status);
  const sql = database();
  // Event insertion and state update commit together; duplicate events cannot reapply side effects.
  const eventId = event?.id ?? `reconcile_${randomUUID()}`;
  const result = await sql`WITH accepted AS (
 INSERT INTO miqaat_stripe_events(stripe_event_id,event_type,livemode,user_id)
 SELECT ${eventId},${event?.type ?? "reconciliation"},${c.livemode},user_id FROM miqaat_entitlements WHERE user_id=${userId} AND provider_customer_id=${customer ?? ""}
 ON CONFLICT DO NOTHING RETURNING user_id)
 UPDATE miqaat_entitlements SET plan=${eligible ? "PRO" : "FREE"},status=${subscription.status},provider_subscription_id=${subscription.id},stripe_price_id=${item?.price.id ?? null},stripe_livemode=${c.livemode},current_period_start=${start ? new Date(start * 1000).toISOString() : null}::timestamptz,current_period_end=${end ? new Date(end * 1000).toISOString() : null}::timestamptz,cancel_at_period_end=${subscription.cancel_at_period_end},updated_at=now()
 WHERE user_id IN (SELECT user_id FROM accepted) RETURNING user_id`;
  return result.length > 0;
}
export async function processBillingEvent(event: Stripe.Event, stripe = stripeClient()) {
  const config = billingConfig();
  if (event.livemode !== config.livemode) throw new BillingError("BILLING_MODE_MISMATCH", 400);
  if (!BILLING_EVENTS.includes(event.type as (typeof BILLING_EVENTS)[number]))
    return { ignored: true };
  const existing =
    await database()`SELECT stripe_event_id FROM miqaat_stripe_events WHERE stripe_event_id=${event.id}`;
  if (existing.length) return { duplicate: true };
  const object = event.data.object as unknown as {
    customer?: string | { id: string };
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
    id: string;
    metadata?: Record<string, string>;
    client_reference_id?: string;
  };
  const customer = id(object.customer);
  if (!customer) throw new BillingError("BILLING_CORRELATION_FAILED", 400);
  const rows =
    await database()`SELECT user_id FROM miqaat_entitlements WHERE provider_customer_id=${customer} AND stripe_livemode=${config.livemode}`;
  // Other products/customers in the same Stripe account do not belong to Miqāt.
  if (!rows.length) return { ignored: true };
  const userId = String(rows[0]!.user_id);
  if (
    event.type === "checkout.session.completed" &&
    (object.client_reference_id !== userId || object.metadata?.miqat_user_id !== userId)
  )
    throw new BillingError("BILLING_CORRELATION_FAILED", 400);
  const subscriptionId = event.type.startsWith("customer.subscription.")
    ? object.id
    : (id(object.subscription) ?? id(object.parent?.subscription_details?.subscription));
  if (!subscriptionId) return { ignored: true };
  return withBillingLock(userId, async () => {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (id(subscription.customer) !== customer)
      throw new BillingError("BILLING_CORRELATION_FAILED", 400);
    const row = await stored(userId);
    // An event for an old canceled subscription must not replace a newer active subscription.
    if (
      row.provider_subscription_id &&
      row.provider_subscription_id !== subscription.id &&
      !["canceled", "incomplete_expired", "expired"].includes(String(row.status))
    ) {
      await database()`INSERT INTO miqaat_stripe_events(stripe_event_id,event_type,livemode,user_id) VALUES(${event.id},${event.type},${event.livemode},${userId}) ON CONFLICT DO NOTHING`;
      return { ignored: true };
    }
    return { processed: await persistSubscription(userId, subscription, event) };
  });
}
export async function reconcileBilling(userId: string, stripe = stripeClient()) {
  return withBillingLock(userId, async () => {
    const row = await stored(userId);
    if (!row.provider_customer_id) throw new BillingError("NO_BILLING_ACCOUNT", 409);
    const subscriptions = await stripe.subscriptions.list({
      customer: String(row.provider_customer_id),
      status: "all",
      limit: 100,
    });
    const matching = subscriptions.data.filter((s) => s.metadata.miqat_user_id === userId);
    const active = matching.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));
    if (subscriptions.has_more || active.length > 1)
      throw new BillingError("SUBSCRIPTION_RECONCILIATION_REQUIRED", 409);
    const sub = active[0] ?? matching.find((s) => s.id === row.provider_subscription_id);
    if (sub) await persistSubscription(userId, sub);
    return { reconciled: true };
  });
}
