import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
const db = new PGlite();
const auth = vi.hoisted(() => ({ secret: "session-a" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: auth.secret }), set: vi.fn() }),
}));
vi.mock("@neondatabase/serverless", () => ({
  neon:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          strings.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows,
}));
import {
  createCheckout,
  createPortal,
  processBillingEvent,
  persistSubscription,
  reconcileBilling,
  withBillingLock,
  BILLING_EVENTS,
} from "@/lib/billing/service.server";
import { getEntitlements, requireFeature } from "@/lib/product/entitlements.server";
import { billingAction } from "@/lib/billing/http.server";
import { POST as webhook } from "@/app/api/webhooks/stripe/route";
import { PUT as preferences } from "@/app/api/account/preferences/route";
import { PUT as automation } from "@/app/api/account/automation/route";
import { readSettings } from "@/lib/product/settings.server";
import { DEFAULT_PRAYER } from "@/lib/product/settings";
import { DEFAULT_AUTOMATION } from "@/lib/automation/config";
import { DEFAULT_ANALYSIS } from "@/lib/miqat/analysis";
import { createPasswordResetToken, resetPassword } from "@/lib/auth/session.server";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { GET as day } from "@/app/api/account/day/route";
import { POST as timeline } from "@/app/api/google-calendar/intelligence/timeline/route";
import { POST as block } from "@/app/api/google-calendar/intelligence/prayer-block/route";
import { POST as calendars } from "@/app/api/google-calendar/intelligence/calendars/route";
import { POST as calendarAutomation } from "@/app/api/google-calendar/automation/route";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.invalid" };
const other = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.invalid" };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
beforeAll(async () => {
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`migrations/${file}`, "utf8"));
}, 60000);
afterAll(() => db.close());
beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test-only");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro");
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("APP_ORIGIN", "https://miqat.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GOOGLE_SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://miqat.test/api/google-calendar/callback");
  vi.stubEnv("CALENDAR_WRITES_ENABLED", "false");
  auth.secret = "session-a";
  await db.exec("TRUNCATE miqaat_users,miqaat_rate_limits CASCADE");
  for (const [u, secret] of [
    [user, "session-a"],
    [other, "session-b"],
  ] as const) {
    await db.query("INSERT INTO miqaat_users(id,email,password_hash) VALUES($1,$2,$3)", [
      u.id,
      u.email,
      "x".repeat(60),
    ]);
    await db.query("INSERT INTO miqaat_entitlements(user_id) VALUES($1)", [u.id]);
    await db.query("INSERT INTO miqaat_preferences(user_id) VALUES($1)", [u.id]);
    await db.query(
      "INSERT INTO miqaat_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [hash(secret), u.id],
    );
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function subscription(
  status: Stripe.Subscription.Status = "active",
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "sub_a",
    customer: "cus_a",
    livemode: false,
    status,
    metadata: { miqat_user_id: user.id },
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_pro" },
          current_period_start: now - 100,
          current_period_end: now + 86400,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}
async function customer() {
  await db.query(
    "UPDATE miqaat_entitlements SET provider_customer_id='cus_a',stripe_livemode=false WHERE user_id=$1",
    [user.id],
  );
}
function fakeStripe() {
  const sessions: Stripe.Checkout.Session[] = [];
  const fake = {
    prices: {
      retrieve: vi.fn(async () => ({
        active: true,
        livemode: false,
        currency: "gbp",
        type: "recurring",
        recurring: { interval: "month", interval_count: 1 },
        unit_amount: 499,
      })),
    },
    customers: {
      search: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async () => ({ id: "cus_a" })),
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: [] as Stripe.Subscription[], has_more: false })),
      retrieve: vi.fn(async () => subscription()),
    },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: sessions, has_more: false })),
        create: vi.fn(async (params: Record<string, unknown>) => {
          const session = {
            ...params,
            id: "cs_a",
            status: "open",
            url: "https://checkout.stripe.com/c/pay/test",
          } as Stripe.Checkout.Session;
          sessions.push(session);
          return session;
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://billing.stripe.com/p/session/test" })),
      },
    },
  };
  return { fake, stripe: fake as unknown as Stripe, sessions };
}
function req(
  path: string,
  body: unknown = {},
  cookie = "session-a",
  origin = "https://miqat.test",
) {
  return new NextRequest(`https://miqat.test${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: `miqaat_session=${cookie}` },
    body: JSON.stringify(body),
  });
}
it("creates one customer and one hosted session across repeated upgrade requests", async () => {
  const { fake, stripe } = fakeStripe();
  const first = await createCheckout(user, stripe);
  expect(await createCheckout(user, stripe)).toEqual(first);
  expect(fake.customers.create).toHaveBeenCalledTimes(1);
  expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
  expect(fake.checkout.sessions.create.mock.calls[0]![0]).toMatchObject({
    mode: "subscription",
    customer: "cus_a",
    line_items: [{ price: "price_pro", quantity: 1 }],
    client_reference_id: user.id,
    success_url: "https://miqat.test/billing/success",
  });
  expect((await getEntitlements(user.id)).plan).toBe("FREE");
});
it("recovers interrupted Checkout creation using a persisted idempotency key", async () => {
  const { fake, stripe } = fakeStripe();
  fake.checkout.sessions.create.mockRejectedValueOnce(new Error("network"));
  await expect(createCheckout(user, stripe)).rejects.toThrow();
  const attempt = (
    await db.query("SELECT checkout_attempt_id FROM miqaat_entitlements WHERE user_id=$1", [
      user.id,
    ])
  ).rows[0]!.checkout_attempt_id;
  await createCheckout(user, stripe);
  expect(
    (
      await db.query("SELECT checkout_attempt_id FROM miqaat_entitlements WHERE user_id=$1", [
        user.id,
      ])
    ).rows[0]!.checkout_attempt_id,
  ).toBe(attempt);
});
it("prevents simultaneous upgrade and refuses an existing incomplete or active subscription", async () => {
  const { stripe, fake } = fakeStripe();
  await withBillingLock(user.id, async () => {
    await expect(createCheckout(user, stripe)).rejects.toMatchObject({ code: "BILLING_BUSY" });
  });
  fake.subscriptions.list.mockResolvedValue({
    data: [subscription("incomplete")],
    has_more: false,
  });
  await expect(createCheckout(user, stripe)).rejects.toMatchObject({ code: "SUBSCRIPTION_EXISTS" });
  expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
});
it.each([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const)("applies explicit %s entitlement policy", async (status) => {
  await customer();
  await persistSubscription(user.id, subscription(status));
  expect((await getEntitlements(user.id)).plan).toBe(
    ["active", "trialing"].includes(status) ? "PRO" : "FREE",
  );
});
it("retains cancel-at-period-end access only until the paid period expires", async () => {
  await customer();
  await persistSubscription(user.id, subscription("active", { cancel_at_period_end: true }));
  expect((await getEntitlements(user.id)).plan).toBe("PRO");
  await db.query(
    "UPDATE miqaat_entitlements SET current_period_end=now()-interval '1 second' WHERE user_id=$1",
    [user.id],
  );
  expect((await getEntitlements(user.id)).plan).toBe("FREE");
});
it.each(BILLING_EVENTS)(
  "handles %s using retrieved Stripe state, then ignores replay",
  async (type) => {
    await customer();
    const { stripe, fake } = fakeStripe();
    const obj = type.startsWith("customer.subscription.")
      ? subscription()
      : type === "checkout.session.completed"
        ? {
            id: "cs_a",
            customer: "cus_a",
            subscription: "sub_a",
            client_reference_id: user.id,
            metadata: { miqat_user_id: user.id },
          }
        : {
            id: "in_a",
            customer: "cus_a",
            parent: { subscription_details: { subscription: "sub_a" } },
          };
    const event = {
      id: `evt_${type}`,
      type,
      livemode: false,
      data: { object: obj },
    } as Stripe.Event;
    expect(await processBillingEvent(event, stripe)).toEqual({ processed: true });
    expect(await processBillingEvent(event, stripe)).toEqual({ duplicate: true });
    expect(fake.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  },
);
it("reconciles missed events and rejects cross-user subscription metadata", async () => {
  await customer();
  const { stripe, fake } = fakeStripe();
  fake.subscriptions.list.mockResolvedValue({ data: [subscription()], has_more: false });
  await reconcileBilling(user.id, stripe);
  expect((await getEntitlements(user.id)).plan).toBe("PRO");
  expect((await getEntitlements(other.id)).plan).toBe("FREE");
  await expect(persistSubscription(other.id, subscription())).rejects.toMatchObject({
    code: "SUBSCRIPTION_CORRELATION_FAILED",
  });
});
it("creates portal sessions only for the authenticated account's stored customer", async () => {
  await customer();
  const { stripe, fake } = fakeStripe();
  await createPortal(user.id, stripe);
  expect(fake.billingPortal.sessions.create).toHaveBeenCalledWith({
    customer: "cus_a",
    return_url: "https://miqat.test/app/account",
  });
  await expect(createPortal(other.id, stripe)).rejects.toMatchObject({
    code: "NO_BILLING_ACCOUNT",
  });
});
it.each([
  { price: "price_evil" },
  { customer: "cus_other" },
  { plan: "PRO" },
  { return_url: "https://evil.test" },
])("rejects browser-selected billing fields %j", async (body) => {
  const action = vi.fn();
  expect((await billingAction(req("/api/billing/checkout", body), action)).status).toBe(400);
  expect(action).not.toHaveBeenCalled();
});
it("rejects unauthenticated and cross-origin checkout before any side effect", async () => {
  const action = vi.fn();
  expect((await billingAction(req("/api/billing/checkout", {}, "unknown"), action)).status).toBe(
    401,
  );
  expect(
    (
      await billingAction(
        req("/api/billing/checkout", {}, "session-a", "https://evil.test"),
        action,
      )
    ).status,
  ).toBe(403);
  expect(action).not.toHaveBeenCalled();
});
it("verifies real Stripe SDK signatures over raw bytes, rejecting altered/replayed-old signatures", async () => {
  const sdk = new Stripe("sk_test_fixture");
  const payload = JSON.stringify({
    id: "evt_signed",
    type: "unhandled.event",
    livemode: false,
    data: { object: {} },
  });
  const signed = (body: string, signature: string) =>
    new NextRequest("https://miqat.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body,
    });
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: "whsec_fixture" });
  expect((await webhook(signed(payload, signature))).status).toBe(200);
  expect((await webhook(signed(payload + " ", signature))).status).toBe(400);
  expect(
    (
      await webhook(
        signed(
          payload,
          sdk.webhooks.generateTestHeaderString({ payload, secret: "whsec_fixture", timestamp: 1 }),
        ),
      )
    ).status,
  ).toBe(400);
});
it("Free API access is rejected; paid access is tenant-specific", async () => {
  await expect(requireFeature(user.id, "calendar-read")).rejects.toMatchObject({
    code: "PRO_REQUIRED",
    status: 403,
  });
  await customer();
  await persistSubscription(user.id, subscription());
  await expect(requireFeature(user.id, "calendar-read")).resolves.toMatchObject({ plan: "PRO" });
  await expect(requireFeature(other.id, "calendar-read")).rejects.toMatchObject({ status: 403 });
});
it.each([
  ["timeline", timeline],
  ["prayer-block", block],
  ["calendars", calendars],
  ["automation", calendarAutomation],
] as const)(
  "denies direct Free access to %s before Google or provider calls",
  async (name, route) => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const response = await route(req(`/api/google-calendar/${name}`, { action: "preview" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("PRO_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("does not calculate from unconfirmed default or removed prayer settings", async () => {
  await db.query("UPDATE miqaat_preferences SET prayer_source='london-unified' WHERE user_id=$1", [
    user.id,
  ]);
  const fetcher = vi.spyOn(globalThis, "fetch");
  expect(await readSettings(user.id)).toMatchObject({
    configured: false,
    sourceReviewRequired: true,
  });
  const response = await day(new NextRequest("https://miqat.test/api/account/day"));
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("PRAYER_SETTINGS_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
});
it("persists onboarding without treating welcome defaults as a confirmed location", async () => {
  let response = await preferences(req("/api/account/preferences", { revision: 1, advance: true }));
  expect(response.status).toBe(200);
  expect(await readSettings(user.id)).toMatchObject({
    onboarding: "prayer",
    configured: false,
    revision: 2,
  });
  response = await preferences(req("/api/account/preferences", { revision: 2, advance: true }));
  expect(response.status).toBe(400);
  response = await preferences(
    req("/api/account/preferences", { revision: 2, prayer: DEFAULT_PRAYER, advance: true }),
  );
  expect(response.status).toBe(200);
  response = await preferences(
    req("/api/account/preferences", { revision: 3, advance: true, userId: other.id }),
  );
  expect(response.status).toBe(200);
  expect(await readSettings(user.id)).toMatchObject({ onboarding: "complete", configured: true });
  expect(await readSettings(other.id)).toMatchObject({ onboarding: "welcome", configured: false });
});
it("saves automation and analysis together, rejecting stale revisions without partial changes", async () => {
  await preferences(req("/api/account/preferences", { revision: 1, prayer: DEFAULT_PRAYER }));
  const body = {
    config: DEFAULT_AUTOMATION,
    analysis: { ...DEFAULT_ANALYSIS, bufferBefore: 12 },
    preferencesRevision: 2,
    revision: null,
  };
  expect((await automation(req("/api/account/automation", body))).status).toBe(200);
  expect(
    (
      await automation(
        req("/api/account/automation", {
          ...body,
          analysis: { ...DEFAULT_ANALYSIS, bufferBefore: 55 },
        }),
      )
    ).status,
  ).toBe(409);
  expect((await readSettings(user.id)).analysis.bufferBefore).toBe(12);
  expect((await readSettings(other.id)).analysis.bufferBefore).toBe(DEFAULT_ANALYSIS.bufferBefore);
});
it("reset tokens are hashed, single-use, expire and revoke sessions", async () => {
  const token = await createPasswordResetToken(user.email);
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  const stored = (await db.query("SELECT token_hash FROM miqaat_password_resets")).rows[0]!
    .token_hash;
  expect(stored).toBe(hash(token!));
  expect(stored).not.toBe(token);
  expect(await resetPassword(token!, "y".repeat(60))).toBe(true);
  expect(await resetPassword(token!, "z".repeat(60))).toBe(false);
  expect(
    (await db.query("SELECT id FROM miqaat_sessions WHERE user_id=$1", [user.id])).rows,
  ).toHaveLength(0);
  const expired = await createPasswordResetToken(user.email);
  await db.exec(
    "UPDATE miqaat_password_resets SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 second'",
  );
  expect(await resetPassword(expired!, "y".repeat(60))).toBe(false);
});
it("does not claim a reset email was sent when delivery is unconfigured", async () => {
  vi.stubEnv("SMTP_HOST", "");
  const response = await forgot(req("/api/auth/forgot-password", { email: user.email }));
  expect(response.status).toBe(503);
  expect((await db.query("SELECT token_hash FROM miqaat_password_resets")).rows).toHaveLength(0);
});
