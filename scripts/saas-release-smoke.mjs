import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";

const origin = "https://sixth-of-the-night.vercel.app";
const env = parseEnv(readFileSync(process.argv[2] ?? "/tmp/miqat-release-production.env", "utf8"));
const sql = neon(env.DATABASE_URL);
const email = `release-smoke-${randomBytes(10).toString("hex")}@example.invalid`;
const password = randomBytes(24).toString("hex");
let cookie = "";
async function request(path, body, method = "POST") {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : method,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.some((s) => s.startsWith("miqaat_session=")))
    cookie = cookies.find((s) => s.startsWith("miqaat_session=")).split(";")[0];
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}
function passed(name) {
  console.log(`PASS ${name}`);
}
try {
  for (const [path, expected] of [
    ["/", "Your calendar"],
    ["/pricing", "Miqāt Pro"],
    ["/sixth", "Sixth"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/sign-in", "Sign in"],
    ["/sign-up", "Create your account"],
  ]) {
    const r = await request(path);
    assert.equal(r.status, 200, path);
    assert.ok(r.data.includes(expected), path);
    if (path === "/sixth")
      assert.ok(!/London Unified|Continuous|90 days|Allow calendar management/.test(r.data));
    passed(`public ${path}`);
  }
  const fence = await request("/api/google-calendar/events", {});
  assert.equal(fence.status, 503);
  assert.equal(fence.data.error.code, "CALENDAR_WRITES_DISABLED");
  passed("production calendar writes disabled");
  const signup = await request("/api/auth/signup", { email, password });
  assert.equal(signup.status, 201);
  assert.ok(cookie.startsWith("miqaat_session="));
  passed("Free signup and session");
  assert.equal((await request("/api/account/day")).status, 409);
  let state = (await request("/api/account/preferences")).data;
  assert.equal(state.entitlements.plan, "FREE");
  assert.equal(state.settings.configured, false);
  state = (
    await request(
      "/api/account/preferences",
      { revision: state.settings.revision, advance: true },
      "PUT",
    )
  ).data;
  assert.equal(state.settings.onboarding, "prayer");
  const prayer = {
    timezone: "Europe/London",
    source: {
      kind: "coordinates",
      provider: "aladhan",
      latitude: 51.5007292,
      longitude: -0.1246254,
      timeZone: "Europe/London",
      calculationMethod: 3,
      school: 0,
    },
  };
  state = (
    await request(
      "/api/account/preferences",
      { revision: state.settings.revision, prayer, advance: true },
      "PUT",
    )
  ).data;
  assert.equal(state.settings.onboarding, "plan");
  await request("/api/auth/signout", {});
  assert.equal((await request("/api/account/preferences")).status, 401);
  assert.equal((await request("/api/auth/signin", { email, password })).status, 200);
  state = (await request("/api/account/preferences")).data;
  assert.equal(state.settings.onboarding, "plan");
  assert.deepEqual(state.settings.prayer, prayer);
  state = (
    await request(
      "/api/account/preferences",
      { revision: state.settings.revision, advance: true },
      "PUT",
    )
  ).data;
  assert.equal(state.settings.onboarding, "complete");
  passed("sign-in and persistent resumable Free onboarding");
  for (const path of [
    "/app",
    "/app/calendar",
    "/app/automations",
    "/app/settings",
    "/app/account",
    "/app/onboarding",
  ]) {
    const r = await request(path);
    assert.equal(r.status, 200, path);
    for (const title of ["Today", "Calendar", "Automations", "Settings", "Account"])
      assert.ok(r.data.includes(title), title);
  }
  passed("authenticated five-section pages");
  for (const [path, body] of [
    ["/api/google-calendar/intelligence/timeline", {}],
    ["/api/google-calendar/intelligence/calendars", { selected: ["primary"] }],
    ["/api/google-calendar/intelligence/prayer-block", {}],
    ["/api/google-calendar/automation", { action: "preview" }],
    ["/api/account/routines", undefined],
  ]) {
    const r = await request(path, body);
    assert.equal(r.status, 403, path);
    assert.equal(r.data.error.code, "PRO_REQUIRED", path);
  }
  passed("direct premium API denial for Free account");
  const day = await request("/api/account/day");
  assert.equal(day.status, 200, "actual coordinate prayer provider");
  assert.ok(day.data.schedule.fajr && day.data.night.lastThird.start && day.data.night.midpoint);
  assert.equal(day.data.source.latitude, prayer.source.latitude);
  passed("Today prayer times and Sixth data from exact coordinates");
  const precise = await request("/api/v1/night/calculate-from-coordinates", {
    latitude: prayer.source.latitude,
    longitude: prayer.source.longitude,
    timeZone: prayer.timezone,
    serviceDate: day.data.date,
    calculationMethod: 3,
  });
  assert.equal(precise.status, 200);
  assert.equal(precise.data.prayerTimes.provider, "AlAdhan prayer-times API");
  passed("public exact-coordinate calculation");
  const removed = await request(`/api/prayer-times?source=london-unified&date=${day.data.date}`);
  assert.equal(removed.status, 400);
  assert.equal(removed.data.error.code, "INVALID_SOURCE");
  passed("removed source rejected");
  const billing = await request("/api/billing/checkout", {});
  assert.equal(billing.status, 503);
  assert.equal((await request("/api/billing/status")).data.plan, "FREE");
  passed("unconfigured billing fails safely without entitlement changes");
  const reset = await request("/api/auth/forgot-password", { email });
  assert.equal(reset.status, 503);
  assert.equal(reset.data.error.code, "EMAIL_NOT_CONFIGURED");
  passed("unconfigured reset delivery reported honestly");
  const connections =
    await sql`SELECT count(*)::int AS connected FROM google_connections WHERE disconnected_at IS NULL`;
  const selections =
    await sql`SELECT count(*)::int AS selected FROM calendar_preferences WHERE read_enabled`;
  console.log(
    JSON.stringify({
      existingConnections: connections[0].connected,
      selectedCalendarRows: selections[0].selected,
      liveGoogleAcceptance:
        "requires eligible signed-in Google session; no consent or plan fabricated",
    }),
  );
} finally {
  // Remove only this invocation's synthetic test account; never touch existing users.
  await sql`DELETE FROM miqaat_users WHERE email=${email}`;
  for (const key of [`signup:${email}`, `signin:${email}`, `reset:${email}`]) {
    const hash = createHash("sha256").update(key).digest("hex");
    await sql`DELETE FROM miqaat_rate_limits WHERE key_hash=${hash}`;
  }
  console.log("Disposable smoke account and its rate-limit rows cleaned up.");
}
