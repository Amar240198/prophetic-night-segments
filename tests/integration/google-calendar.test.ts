import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll } from "vitest";
import {
  persistConnection,
  findSession,
  updateTokens,
} from "../../src/lib/google-calendar/database.server";
import { encryptToken, decryptToken } from "../../src/lib/google-calendar/tokens.server";
import { sessionHash } from "../../src/lib/google-calendar/session.server";

const db = new PGlite();
vi.mock("@neondatabase/serverless", () => ({
  neon:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce(
        (text, part, index) => text + (index ? `$${index}` : "") + part,
        "",
      );
      return (await db.query(sql, values)).rows;
    },
}));
beforeAll(async () => {
  await db.exec(readFileSync("migrations/001_google_calendar_persistence.sql", "utf8"));
  await db.exec(readFileSync("migrations/002_google_calendar_event_mappings.sql", "utf8"));
  await db.exec(readFileSync("migrations/003_google_calendar_night_parts.sql", "utf8"));
  await db.exec(readFileSync("migrations/004_calendar_ownership.sql", "utf8"));
  await db.exec(readFileSync("migrations/005_miqaat_accounts.sql", "utf8"));
  await db.query("INSERT INTO miqaat_users (id, email, password_hash) VALUES ($1, $2, $3)", [
    "11111111-1111-4111-8111-111111111111",
    "miqaat@example.com",
    "x".repeat(60),
  ]);
}, 60_000);
afterAll(async () => {
  await db.close();
});
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as connect } from "../../src/app/api/google-calendar/connect/route";
import { GET as callback } from "../../src/app/api/google-calendar/callback/route";
import { GET as session } from "../../src/app/api/google-calendar/session/route";
import { POST as events } from "../../src/app/api/google-calendar/events/route";
import { POST as disconnect } from "../../src/app/api/google-calendar/disconnect/route";
import {
  CALENDAR_SCOPE,
  EMAIL_SCOPE,
  FLOW_COOKIE,
  SESSION_COOKIE,
  openCookie,
  sealCookie,
} from "../../src/lib/google-calendar/session.server";

const origin = "http://localhost:3000";
async function sessionCookie(expiresAt = Date.now() + 3_600_000) {
  const id = randomBytes(32).toString("base64url");
  await persistConnection({
    connectionId: randomUUID(),
    subject: "google-test-user",
    email: "user@example.com",
    accessToken: encryptToken("test-access-token", "google-test-user", "access"),
    refreshToken: null,
    accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    sessionHash: sessionHash(id),
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "11111111-1111-4111-8111-111111111111",
  });
  await db.query("UPDATE browser_sessions SET created_at = $1, expires_at = $2 WHERE id = $3", [
    new Date(expiresAt - 100_000).toISOString(),
    new Date(expiresAt).toISOString(),
    sessionHash(id),
  ]);
  return `${SESSION_COOKIE}=${id}; ${await appCookie()}`;
}
const event = {
  id: "last-third",
  title: "Ignored client title",
  start: "2026-03-29T00:45:00Z",
  end: "2026-03-29T00:45:00Z",
  timeZone: "Europe/London",
  description: "Planning aid",
};
function request(path: string, options: { cookie?: string; body?: unknown; origin?: string } = {}) {
  if (options.body && typeof options.body === "object" && "events" in options.body) {
    const body = options.body as { events: Array<{ serviceDate?: string }>; startDate?: string };
    options = {
      ...options,
      body: { ...body, startDate: body.startDate ?? body.events?.[0]?.serviceDate ?? "2026-03-28" },
    };
  }
  return new NextRequest(`${origin}/api/google-calendar/${path}`, {
    method: ["events", "disconnect", "sync", "remove"].includes(path) ? "POST" : "GET",
    headers: {
      origin: options.origin ?? origin,
      "Content-Type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
beforeEach(async () => {
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => realSetTimeout(callback, delay === 300 ? 0 : delay, ...args)) as typeof setTimeout);
  await db.exec("TRUNCATE google_connections CASCADE");
  vi.stubEnv("DATABASE_URL", "postgresql://unused-test-only/test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", `${origin}/api/google-calendar/callback`);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function startFlow() {
  const response = await connect(request("connect"));
  const authorization = new URL(response.headers.get("location")!);
  const cookie = `${FLOW_COOKIE}=${response.cookies.get(FLOW_COOKIE)!.value}`;
  return { authorization, cookie, state: authorization.searchParams.get("state")! };
}
async function appCookie(userId = "11111111-1111-4111-8111-111111111111") {
  const secret = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO miqaat_sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [sessionHash(secret), userId],
  );
  return `miqaat_session=${secret}`;
}

describe("Google OAuth", () => {
  it("requests only owned events and email, with state, PKCE and a private cookie", async () => {
    const { authorization, cookie } = await startFlow();
    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("scope")?.split(" ")).toEqual([
      CALENDAR_SCOPE,
      EMAIL_SCOPE,
    ]);
    expect(authorization.searchParams.get("access_type")).toBe("offline");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("code_challenge")).toHaveLength(43);
    expect(cookie).not.toContain("verifier");
    const response = await connect(request("connect"));
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("exchanges the callback code server-side and exposes only email and expiry", async () => {
    const { cookie, state } = await startFlow();
    const accountCookie = await appCookie();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: CALENDAR_SCOPE,
        }),
      )
      .mockResolvedValueOnce(
        json({ id: "google-test-user", email: "user@example.com", verified_email: true }),
      );
    const response = await callback(
      request(`callback?code=valid-code&state=${state}`, {
        cookie: `${cookie}; ${accountCookie}`,
      }),
    );
    expect(response.headers.get("location")).toContain("status=connected");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(String(tokenRequest.body)).toContain("client_secret=test-client-secret");
    expect(String(tokenRequest.body)).toContain("code_verifier=");
    const sessionValue = response.cookies.get(SESSION_COOKIE)!.value;
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60);
    expect(sessionValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionValue).not.toMatch(/test-access-token|test-refresh-token|user@example.com/);
    const stored = (await db.query("SELECT * FROM google_connections")).rows[0]!;
    expect(stored.user_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(stored.encrypted_access_token).not.toContain("test-access-token");
    expect(
      decryptToken(String(stored.encrypted_refresh_token), "google-test-user", "refresh"),
    ).toBe("test-refresh-token");
    expect((await db.query("SELECT id FROM browser_sessions")).rows[0]!.id).toBe(
      sessionHash(sessionValue),
    );
    expect(response.cookies.get(FLOW_COOKIE)?.maxAge).toBe(0);
    const connected = await session(
      request("session", { cookie: `${SESSION_COOKIE}=${sessionValue}; ${accountCookie}` }),
    );
    expect(await connected.json()).toMatchObject({ connected: true, email: "user@example.com" });
    expect(connected.headers.get("cache-control")).toBe("no-store");
    const again = await session(
      request("session", { cookie: `${SESSION_COOKIE}=${sessionValue}` }),
    );
    expect(await again.text()).not.toMatch(/accessToken|test-access-token|refresh/);
  });
  it.each(["missing", "wrong", "expired"])(
    "rejects %s OAuth state before calling Google",
    async (kind) => {
      const { cookie, state } = await startFlow();
      const oldCookie = `${FLOW_COOKIE}=${sealCookie({ state, verifier: "x".repeat(43), expiresAt: Date.now() - 1 }, FLOW_COOKIE)}`;
      const response = await callback(
        request(`callback?code=code&state=${kind === "wrong" ? "wrong" : state}`, {
          cookie: kind === "missing" ? undefined : kind === "expired" ? oldCookie : cookie,
        }),
      );
      expect(response.headers.get("location")).toContain("CONNECTION_FAILED");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("reports consent denial", async () => {
    const { cookie, state } = await startFlow();
    const accountCookie = await appCookie();
    const response = await callback(
      request(`callback?error=access_denied&state=${state}`, {
        cookie: `${cookie}; ${accountCookie}`,
      }),
    );
    expect(response.headers.get("location")).toContain("PERMISSION_DENIED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a callback without the signed-in Miqāt session", async () => {
    const { cookie, state } = await startFlow();
    const response = await callback(request(`callback?code=code&state=${state}`, { cookie }));
    expect(response.headers.get("location")).toContain("status=UNAUTHENTICATED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects partial consent without calendar permission", async () => {
    const { cookie, state } = await startFlow();
    const accountCookie = await appCookie();
    vi.mocked(fetch).mockResolvedValueOnce(json({ scope: EMAIL_SCOPE }));
    const response = await callback(
      request(`callback?code=code&state=${state}`, { cookie: `${cookie}; ${accountCookie}` }),
    );
    expect(response.headers.get("location")).toContain("PERMISSION_DENIED");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("does not let a second Miqāt account claim an owned Google connection", async () => {
    await db.query("INSERT INTO miqaat_users (id, email, password_hash) VALUES ($1, $2, $3)", [
      "22222222-2222-4222-8222-222222222222",
      "other@example.com",
      "x".repeat(60),
    ]);
    const input = {
      connectionId: randomUUID(),
      subject: "google-conflict",
      email: "conflict@example.com",
      accessToken: encryptToken("access-a", "google-conflict", "access"),
      refreshToken: null,
      accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      sessionHash: sessionHash(randomBytes(32).toString("base64url")),
      sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "11111111-1111-4111-8111-111111111111",
    };
    await persistConnection(input);
    await expect(
      persistConnection({
        ...input,
        connectionId: randomUUID(),
        userId: "22222222-2222-4222-8222-222222222222",
        sessionHash: sessionHash(randomBytes(32).toString("base64url")),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (
        await db.query("SELECT user_id FROM google_connections WHERE google_subject = $1", [
          "google-conflict",
        ])
      ).rows[0]!.user_id,
    ).toBe("11111111-1111-4111-8111-111111111111");
  });
  it("hides token endpoint failure details", async () => {
    const { cookie, state } = await startFlow();
    const accountCookie = await appCookie();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("secret provider stack trace"));
    const response = await callback(
      request(`callback?code=code&state=${state}`, { cookie: `${cookie}; ${accountCookie}` }),
    );
    expect(response.headers.get("location")).toContain("CONNECTION_FAILED");
    expect(response.headers.get("location")).not.toContain("secret");
  });
  it("uses secure cookies on the configured HTTPS deployment", async () => {
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/google-calendar/callback");
    const response = await connect(
      new NextRequest("https://example.com/api/google-calendar/connect"),
    );
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
  it("prevents tampering and use of a flow cookie as an auth session", async () => {
    const encrypted = sealCookie(
      { state: "state", verifier: "verifier", expiresAt: Date.now() + 60_000 },
      FLOW_COOKIE,
    );
    expect(openCookie(encrypted, SESSION_COOKIE)).toBeNull();
    expect(openCookie(`tampered${encrypted}`, FLOW_COOKIE)).toBeNull();
  });
});

describe("Google Calendar API routes", () => {
  it("reports unconfigured and unauthenticated states without Google calls", async () => {
    expect(await (await session(request("session"))).json()).toEqual({
      configured: true,
      connected: false,
    });
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(await (await session(request("session"))).json()).toEqual({
      configured: false,
      connected: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated creation", async () => {
    const response = await events(request("events", { body: { events: [event] } }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations", async () => {
    const response = await events(
      request("events", {
        origin: "https://attacker.example",
        cookie: await sessionCookie(),
        body: { events: [event] },
      }),
    );
    expect(response.status).toBe(403);
    expect(
      (
        await disconnect(
          request("disconnect", {
            origin: "https://attacker.example",
            cookie: await sessionCookie(),
          }),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("expires sessions before making upstream requests", async () => {
    const cookie = await sessionCookie(Date.now() - 1);
    const response = await events(request("events", { cookie, body: { events: [event] } }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("SESSION_EXPIRED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [],
    [{ ...event, start: "2026-03-29T01:30:00" }],
    [{ ...event, timeZone: "invalid" }],
    [{ ...event, end: "2020-01-01T00:00:00Z" }],
    [event, event],
  ])("validates selections before insertion: %j", async (selection) => {
    const response = await events(
      request("events", { cookie: await sessionCookie(), body: { events: selection } }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized request bodies", async () => {
    const response = await events(
      request("events", {
        cookie: await sessionCookie(),
        body: { events: [{ ...event, description: "x".repeat(70_000) }] },
      }),
    );
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("inserts only selected events into primary without attendees", async () => {
    calendarService();
    const response = await events(
      request("events", { cookie: await sessionCookie(), body: { events: [event] } }),
    );
    expect(await response.json()).toEqual({ outcomes: [{ id: "last-third", status: "created" }] });
    const [url, init] = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(url).toContain("/calendars/primary/events?sendUpdates=none");
    const body = JSON.parse(String(init?.body));
    expect(body.summary).toBe("Qiyam / Tahajjud — Last Third Begins");
    expect(body.start).toEqual({ dateTime: event.start, timeZone: "Europe/London" });
    expect(body.end.dateTime).toBe("2026-03-29T00:46:00Z");
    expect(body.attendees).toBeUndefined();
    expect(body.visibility).toBe("private");
  });
  it("recognizes retries and does not overwrite existing events", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    await events(request("events", { cookie, body: { events: [event] } }));
    const response = await events(request("events", { cookie, body: { events: [event] } }));
    expect((await response.json()).outcomes[0].status).toBe("existing");
    expect(service.inserts()).toBe(1);
    expect(service.patches()).toBe(0);
  });
  it("does not claim a deleted duplicate still exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(json({ status: "cancelled" }));
    const response = await events(
      request("events", { cookie: await sessionCookie(), body: { events: [event] } }),
    );
    expect((await response.json()).outcomes[0]).toMatchObject({
      status: "failed",
      code: "EVENT_DELETED",
    });
  });
  it.each([
    [401, "SESSION_EXPIRED"],
    [403, "PERMISSION_DENIED"],
    [429, "RATE_LIMITED"],
  ])("handles Google HTTP %s and stops remaining inserts", async (status, code) => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}, Number(status)));
    const response = await events(
      request("events", {
        cookie: await sessionCookie(),
        body: { events: [event, { ...event, id: "fajr" }] },
      }),
    );
    expect((await response.json()).outcomes).toEqual([
      { id: "last-third", status: "failed", code },
      { id: "fajr", status: "failed", code },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    if (status === 401) expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
  });
  it("reports partial success and hides internal network errors", async () => {
    calendarService(2);
    const response = await events(
      request("events", {
        cookie: await sessionCookie(),
        body: { events: [event, { ...event, id: "fajr" }] },
      }),
    );
    expect(await response.json()).toEqual({
      outcomes: [
        { id: "last-third", status: "created" },
        { id: "fajr", status: "failed", code: "EVENT_FAILED" },
      ],
    });
  });
  it("revokes access and clears cookies on disconnect", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}));
    const response = await disconnect(request("disconnect", { cookie: await sessionCookie() }));
    expect(await response.json()).toEqual({ connected: false, revoked: true });
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("https://oauth2.googleapis.com/revoke");
  });
  it("still clears the local connection if revocation fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const response = await disconnect(request("disconnect", { cookie: await sessionCookie() }));
    expect(await response.json()).toEqual({ connected: false, revoked: false });
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
  });
});

describe("persistent credentials", () => {
  it("encrypts with fresh nonces and binds ciphertext to account and token kind", () => {
    const sealed = encryptToken("private-token", "account-a", "access");
    expect(sealed).not.toContain("private-token");
    expect(encryptToken("private-token", "account-a", "access")).not.toBe(sealed);
    expect(decryptToken(sealed, "account-a", "access")).toBe("private-token");
    expect(() => decryptToken(sealed, "account-b", "access")).toThrow();
    expect(() => decryptToken(sealed, "account-a", "refresh")).toThrow();
    expect(() => decryptToken(sealed.slice(0, 10) + "tampered", "account-a", "access")).toThrow();
    vi.stubEnv("GOOGLE_SESSION_SECRET", Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptToken(sealed, "account-a", "access")).toThrow();
  });

  it.each(["malformed", "a".repeat(43)])("rejects invalid or unknown session %s", async (value) => {
    const response = await session(request("session", { cookie: `${SESSION_COOKIE}=${value}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, configured: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("upserts one Google identity, retains omitted refresh tokens and rolls back session conflicts", async () => {
    const input = {
      connectionId: randomUUID(),
      subject: "stable-account",
      email: "old@example.com",
      accessToken: encryptToken("access", "stable-account", "access"),
      refreshToken: encryptToken("refresh", "stable-account", "refresh"),
      accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      sessionHash: sessionHash(randomBytes(32).toString("base64url")),
      sessionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    await persistConnection(input);
    await persistConnection({
      ...input,
      connectionId: randomUUID(),
      email: "new@example.com",
      refreshToken: null,
      sessionHash: sessionHash(randomBytes(32).toString("base64url")),
    });
    const rows = (await db.query("SELECT * FROM google_connections")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_account_email).toBe("new@example.com");
    expect(rows[0]!.encrypted_refresh_token).toBe(input.refreshToken);
    await expect(persistConnection({ ...input, email: "rollback@example.com" })).rejects.toThrow();
    expect(
      (await db.query("SELECT google_account_email FROM google_connections")).rows[0]!
        .google_account_email,
    ).toBe("new@example.com");
  });

  it("refreshes an expired access token server-side and retains the same browser session", async () => {
    const cookie = await sessionCookie();
    await db.query(
      "UPDATE google_connections SET encrypted_refresh_token = $1, access_token_expires_at = $2",
      [
        encryptToken("refresh-secret", "google-test-user", "refresh"),
        new Date(Date.now() - 1000).toISOString(),
      ],
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ access_token: "renewed-secret", token_type: "Bearer", expires_in: 3600 }),
    );
    const response = await session(request("session", { cookie }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/refresh-secret|renewed-secret/);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(String(vi.mocked(fetch).mock.calls[0]![1]!.body)).toContain("grant_type=refresh_token");
    const stored = (await db.query("SELECT * FROM google_connections")).rows[0]!;
    expect(decryptToken(String(stored.encrypted_access_token), "google-test-user", "access")).toBe(
      "renewed-secret",
    );
    expect(
      decryptToken(String(stored.encrypted_refresh_token), "google-test-user", "refresh"),
    ).toBe("refresh-secret");
  });

  it("requires reconnecting when Google revokes the refresh token", async () => {
    const cookie = await sessionCookie();
    await db.query(
      "UPDATE google_connections SET encrypted_refresh_token = $1, access_token_expires_at = $2",
      [
        encryptToken("refresh-secret", "google-test-user", "refresh"),
        new Date(Date.now() - 1000).toISOString(),
      ],
    );
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    const response = await session(request("session", { cookie }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
  });

  it("invalidates every browser session and removes credentials on disconnect despite Google failure", async () => {
    const first = await sessionCookie();
    const second = await sessionCookie();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    expect((await disconnect(request("disconnect", { cookie: first }))).status).toBe(200);
    expect(
      (
        await db.query(
          "SELECT encrypted_access_token, encrypted_refresh_token FROM google_connections",
        )
      ).rows,
    ).toEqual([{ encrypted_access_token: null, encrypted_refresh_token: null }]);
    expect((await db.query("SELECT * FROM browser_sessions")).rows).toHaveLength(0);
    expect((await session(request("session", { cookie: second }))).status).toBe(401);
  });

  it("reports missing database configuration safely", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await (await session(request("session"))).json()).toEqual({
      connected: false,
      configured: false,
    });
  });
});

it("hides database failure details and never issues a session cookie after a failed write", async () => {
  const { cookie, state } = await startFlow();
  const accountCookie = await appCookie();
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      json({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        scope: CALENDAR_SCOPE,
      }),
    )
    .mockResolvedValueOnce(
      json({ id: "google-test-user", email: "user@example.com", verified_email: true }),
    );
  const failure = vi
    .spyOn(db, "query")
    .mockRejectedValueOnce(new Error("private database connection details"));
  try {
    const response = await callback(
      request(`callback?code=valid-code&state=${state}`, {
        cookie: `${cookie}; ${accountCookie}`,
      }),
    );
    expect(response.headers.get("location")).toContain("status=CONNECTION_FAILED");
    expect(response.headers.get("location")).not.toContain("private");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  } finally {
    failure.mockRestore();
  }
});

it("a stale refresh cannot overwrite a newer login or resurrect a disconnected account", async () => {
  const cookie = await sessionCookie();
  const googleCookie = cookie.split(";")[0]!;
  const hash = sessionHash(googleCookie.split("=")[1]!);
  const stale = (await findSession(hash))!;
  await sessionCookie();
  const newer = (await findSession(hash))!;
  expect(newer.encrypted_access_token).not.toBe(stale.encrypted_access_token);
  await updateTokens(
    stale,
    encryptToken("stale", stale.google_subject, "access"),
    null,
    new Date(Date.now() + 3600_000).toISOString(),
  );
  expect((await findSession(hash))!.encrypted_access_token).toBe(newer.encrypted_access_token);
  vi.mocked(fetch).mockResolvedValueOnce(json({}));
  await disconnect(request("disconnect", { cookie }));
  await updateTokens(
    newer,
    encryptToken("late", newer.google_subject, "access"),
    null,
    new Date(Date.now() + 3600_000).toISOString(),
  );
  expect(await findSession(hash)).toBeNull();
});

import { POST as sync } from "../../src/app/api/google-calendar/sync/route";
import { Temporal } from "@js-temporal/polyfill";
import {
  calculateSyncNight,
  syncDates,
  validateSyncRequest,
} from "../../src/lib/google-calendar/sync-plan.server";
import {
  acquireSyncLease,
  releaseSyncLease,
} from "../../src/lib/google-calendar/sync-database.server";
import { syncEventIdentity } from "../../src/lib/google-calendar/sync-event.server";
import type { SyncRequest } from "../../src/lib/google-calendar/sync";

const syncInput: SyncRequest = {
  startDate: "2026-03-20",
  nights: 30,
  source: { kind: "london-unified" },
  selected: ["last-third"],
  options: {
    wakeBufferMinutes: 15,
    dawudSelected: false,
    fajrPreparationMinutes: 20,
    firstAdhanMinutes: null,
  },
};
function calendarService(failInsert = 0, failStatus = 500, ambiguous = false) {
  const stored = new Map<
    string,
    {
      id: string;
      summary: string;
      end: { dateTime: string };
      start: { dateTime: string };
      extendedProperties: {
        private: {
          [key: string]: string | undefined;
          localNight?: string;
          planEvent: string;
          application?: string;
        };
      };
      etag: string;
      status: string;
    }
  >();
  let inserts = 0;
  let patches = 0;
  const providerDates: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = new URL(String(url));
      if (target.hostname === "api.islamic.app") {
        const date = target.pathname.split("/").at(-1)!;
        providerDates.push(date);
        const day = Number(date.slice(0, 2));
        return json({
          code: 200,
          data: {
            timings: {
              Maghrib: `18:${String(day).padStart(2, "0")}`,
              Fajr: `05:${String(59 - day).padStart(2, "0")}`,
            },
            meta: { timezone: target.searchParams.get("timezone"), method: 3 },
          },
        });
      }
      if (target.hostname !== "www.googleapis.com") throw new Error("Unexpected test endpoint");
      if (
        target.pathname.endsWith("/events") &&
        target.searchParams.has("privateExtendedProperty")
      ) {
        return json({
          items: [...stored.entries()]
            .map(([id, item]) => ({ id, ...item }))
            .filter((item) => item.status !== "cancelled"),
        });
      }
      if (init?.method === "POST") {
        inserts++;
        const payload = JSON.parse(init.body as string);
        if (inserts === failInsert && !ambiguous) return json({}, failStatus);
        if (stored.has(payload.id)) return json({}, 409);
        stored.set(payload.id, { ...payload, status: "confirmed", etag: '"v1"' });
        if (inserts === failInsert && ambiguous) throw new TypeError("Lost response after insert");
        return json(payload);
      }
      const id = target.pathname.split("/").at(-1)!;
      if (init?.method === "PATCH") {
        patches++;
        expect((init.headers as Record<string, string>)["If-Match"]).toBe('"v1"');
        stored.set(id, { ...stored.get(id), ...JSON.parse(init.body as string) });
        return json(stored.get(id));
      }
      return stored.has(id) ? json(stored.get(id)) : json({}, 404);
    }),
  );
  return { stored, providerDates, inserts: () => inserts, patches: () => patches };
}
async function runSync(body: SyncRequest, cookie: string) {
  const response = await sync(request("sync", { cookie, body }));
  expect(response.status).toBe(200);
  return response.json();
}

describe("persistent multi-night Google sync", () => {
  it("calculates 30 changing nights across DST/month boundary and skips every event on second sync", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const first = await runSync(syncInput, cookie);
    expect(first.syncedNights).toBe(30);
    expect(first.outcomes).toHaveLength(30);
    expect(first.outcomes.every((item: { status: string }) => item.status === "created")).toBe(
      true,
    );
    expect(service.stored.size).toBe(30);
    const dates = syncDates(syncInput.startDate, 30);
    expect(dates.at(-1)).toBe("2026-04-18");
    for (const date of dates) {
      const [expected] = await calculateSyncNight(syncInput, date);
      const actual = [...service.stored.values()].find(
        (item) => item.extendedProperties.private.localNight === date,
      )!;
      expect(actual.start.dateTime).toBe(expected!.start);
      expect(actual.extendedProperties.private.planEvent).toBe("last-third");
    }
    const clocks = [...service.stored.values()].map((item) =>
      Temporal.Instant.from(item.start.dateTime)
        .toZonedDateTimeISO("Europe/London")
        .toPlainTime()
        .toString(),
    );
    expect(new Set(clocks).size).toBeGreaterThan(20);
    const second = await runSync(syncInput, cookie);
    expect(second.syncedNights).toBe(30);
    expect(second.outcomes.every((item: { status: string }) => item.status === "existing")).toBe(
      true,
    );
    expect(service.inserts()).toBe(30);
    expect(service.patches()).toBe(0);
    const mappings = await db.query(
      "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE synced_at IS NOT NULL",
    );
    expect(mappings.rows[0]).toEqual({ count: 30 });
  }, 20_000);

  it("fetches each date including following Fajr across a year boundary with a quarter-hour timezone", async () => {
    const service = calendarService();
    const input: SyncRequest = {
      ...syncInput,
      startDate: "2026-12-20",
      selected: ["fajr", "prayer"],
      source: {
        kind: "coordinates",
        latitude: 27.7,
        longitude: 85.3,
        timeZone: "Asia/Kathmandu",
        calculationMethod: 3,
      },
    };
    const result = await runSync(input, await sessionCookie());
    expect(result.syncedNights).toBe(30);
    expect(service.stored.size).toBe(60);
    expect(new Set(service.providerDates).size).toBe(31);
    expect(service.providerDates).toContain("01-01-2027");
    expect(service.providerDates).toContain("19-01-2027");
    const fajr = [...service.stored.values()].find(
      (item) =>
        item.extendedProperties.private.localNight === "2026-12-31" &&
        item.extendedProperties.private.planEvent === "fajr",
    )!;
    expect(
      Temporal.Instant.from(fajr.start.dateTime).toZonedDateTimeISO("Asia/Kathmandu").toString(),
    ).toContain("2027-01-01T05:58:00+05:45");
    expect(
      new Set(
        [...service.stored.values()].map((item) => item.extendedProperties.private.planEvent),
      ),
    ).toEqual(new Set(["fajr", "prayer"]));
  }, 20_000);

  it("reports partial Google failures and safely finishes a retry, including a lost insert response", async () => {
    const service = calendarService(2, 500, true);
    const cookie = await sessionCookie();
    const input = { ...syncInput, nights: 3 };
    const first = await runSync(input, cookie);
    expect(first.syncedNights).toBe(2);
    expect(first.outcomes.map((item: { status: string }) => item.status)).toEqual([
      "created",
      "failed",
      "created",
    ]);
    expect((await runSync(input, cookie)).syncedNights).toBe(3);
    expect(service.inserts()).toBe(3);
    expect(service.stored.size).toBe(3);
  });

  it("stops Google requests after a quota failure and reports all remaining selected events", async () => {
    const service = calendarService(2, 429);
    const result = await runSync(
      { ...syncInput, nights: 3, selected: ["fajr", "last-third"] },
      await sessionCookie(),
    );
    expect(service.inserts()).toBeLessThanOrEqual(3);
    expect(result.outcomes).toHaveLength(6);
    expect(result.syncedNights).toBe(0);
    expect(
      result.outcomes.filter((item: { code: string }) => item.code === "RATE_LIMITED"),
    ).toHaveLength(4);
  });

  it("updates changed planning offsets in place and preserves mappings across browser sessions", async () => {
    const service = calendarService();
    const input: SyncRequest = { ...syncInput, nights: 1, selected: ["wake"] };
    await runSync(input, await sessionCookie());
    const id = [...service.stored.keys()][0]!;
    const original = service.stored.get(id)!.start.dateTime;
    const result = await runSync(
      { ...input, options: { ...input.options, wakeBufferMinutes: 30 } },
      await sessionCookie(),
    );
    expect(result.outcomes[0].status).toBe("updated");
    expect(service.inserts()).toBe(1);
    expect(service.patches()).toBe(1);
    expect(Date.parse(service.stored.get(id)!.start.dateTime)).toBe(
      Date.parse(original) - 15 * 60_000,
    );
  });

  it("does not invent London timetable entries beyond published coverage", async () => {
    const service = calendarService();
    const result = await runSync(
      { ...syncInput, nights: 3, startDate: "2026-12-30" },
      await sessionCookie(),
    );
    expect(result.syncedNights).toBe(1);
    expect(result.outcomes.slice(1).map((item: { code: string }) => item.code)).toEqual([
      "PRAYER_TIMES_UNAVAILABLE",
      "PRAYER_TIMES_UNAVAILABLE",
    ]);
    expect(service.inserts()).toBe(1);
  });

  it("enforces an account lease across sessions and releases only the matching owner", async () => {
    const cookie = await sessionCookie();
    const row = await db.query("SELECT id FROM google_connections");
    const connection = row.rows[0]!.id as string;
    const owner = randomUUID();
    expect(await acquireSyncLease(connection, owner)).toBe(true);
    expect(await acquireSyncLease(connection, randomUUID())).toBe(false);
    await releaseSyncLease(connection, randomUUID());
    const response = await sync(request("sync", { cookie, body: syncInput }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SYNC_IN_PROGRESS");
    await releaseSyncLease(connection, owner);
    expect(await acquireSyncLease(connection, randomUUID())).toBe(true);
  });

  it("rejects forged origin, unbounded horizons, malformed dates and unselected optional reminders", async () => {
    const response = await sync(
      request("sync", { origin: "https://attacker.example", body: syncInput }),
    );
    expect(response.status).toBe(403);
    for (const body of [
      { ...syncInput, nights: 0 },
      { ...syncInput, startDate: "2026-02-30" },
      { ...syncInput, selected: ["fajr", "fajr"] },
      { ...syncInput, selected: ["first-adhan-reminder"] },
      { ...syncInput, source: { kind: "manual" } },
    ]) {
      expect(() => validateSyncRequest(body)).toThrow();
    }
    expect(syncEventIdentity("account-a", "2026-01-01", "fajr")).not.toBe(
      syncEventIdentity("account-b", "2026-01-01", "fajr"),
    );
  });
});

import { readSyncPreference } from "../../src/lib/google-calendar/sync-database.server";

describe("selectable and continuous sync horizons", () => {
  it.each([60, 90])(
    "independently calculates and persists a fixed %i-day horizon",
    async (nights) => {
      const service = calendarService();
      const cookie = await sessionCookie();
      const input: SyncRequest = { ...syncInput, startDate: "2026-03-01", mode: "fixed", nights };
      const result = await runSync(input, cookie);
      expect(result.syncedNights).toBe(nights);
      expect(result.outcomes).toHaveLength(nights);
      expect(service.inserts()).toBe(nights);
      expect(new Set(service.stored.keys()).size).toBe(nights);
      expect(new Set([...service.stored.values()].map((item) => item.start.dateTime)).size).toBe(
        nights,
      );
      expect(
        [...service.stored.values()].every(
          (item) => item.extendedProperties.private.planEvent === "last-third",
        ),
      ).toBe(true);
      expect((await (await session(request("session", { cookie }))).json()).syncPreference).toEqual(
        { mode: "fixed", horizonDays: nights },
      );
      const finalDate = syncDates(input.startDate, nights).at(-1)!;
      const [expected] = await calculateSyncNight(input, finalDate);
      expect(
        [...service.stored.values()].find(
          (item) => item.extendedProperties.private.localNight === finalDate,
        )!.start.dateTime,
      ).toBe(expected!.start);
    },
    30_000,
  );

  it("populates Continuous with 90 nights and persists a distinct replayable rolling preference", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const input: SyncRequest = {
      ...syncInput,
      startDate: "2026-03-01",
      mode: "continuous",
      nights: 90,
    };
    const result = await runSync(input, cookie);
    expect(result.syncedNights).toBe(90);
    expect(service.stored.size).toBe(90);
    const rows = await db.query(
      "SELECT sync_mode, horizon_days, prayer_source, selected_event_types, planning_options, configuration_version FROM google_calendar_sync_preferences",
    );
    expect(rows.rows).toEqual([
      {
        sync_mode: "continuous",
        horizon_days: 90,
        prayer_source: input.source,
        selected_event_types: input.selected,
        planning_options: input.options,
        configuration_version: 1,
      },
    ]);
    expect((await (await session(request("session", { cookie }))).json()).syncPreference).toEqual({
      mode: "continuous",
      horizonDays: 90,
    });
    const fixed = await runSync({ ...input, mode: "fixed" }, cookie);
    expect(fixed.syncedNights).toBe(90);
    expect(fixed.outcomes.every((item: { status: string }) => item.status === "existing")).toBe(
      true,
    );
    expect(service.inserts()).toBe(90);
    expect((await db.query("SELECT sync_mode FROM google_calendar_sync_preferences")).rows).toEqual(
      [{ sync_mode: "fixed" }],
    );
  }, 35_000);

  it.each(
    [
      [30, 60, 90, 90, 30],
      [30, 90, 90, 30],
    ].map((horizons) => ({ horizons })),
  )(
    "extends $horizons, repeats idempotently, and shortens without deleting events",
    async ({ horizons }) => {
      const service = calendarService();
      const cookie = await sessionCookie();
      for (const nights of horizons) {
        const before = service.stored.size;
        const result = await runSync(
          { ...syncInput, startDate: "2026-03-01", mode: "fixed", nights },
          cookie,
        );
        expect(result.syncedNights).toBe(nights);
        expect(
          result.outcomes.filter((item: { status: string }) => item.status === "created"),
        ).toHaveLength(Math.max(0, nights - before));
        expect(
          result.outcomes.filter((item: { status: string }) => item.status === "existing"),
        ).toHaveLength(Math.min(before, nights));
        expect(service.stored.size).toBe(Math.max(before, nights));
      }
      expect(service.inserts()).toBe(90);
      expect(service.patches()).toBe(0);
      expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
      expect((await (await session(request("session", { cookie }))).json()).syncPreference).toEqual(
        {
          mode: "fixed",
          horizonDays: 30,
        },
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
          )
        ).rows,
      ).toEqual([{ count: 90 }]);
    },
    50_000,
  );

  it("persists Continuous intent on partial failure and disconnect removes future sync eligibility", async () => {
    const service = calendarService(2, 429);
    const cookie = await sessionCookie();
    const input: SyncRequest = {
      ...syncInput,
      startDate: "2026-03-01",
      mode: "continuous",
      nights: 90,
    };
    const result = await runSync(input, cookie);
    expect(result.syncedNights).toBeLessThan(90);
    expect(result.outcomes).toHaveLength(90);
    expect(result.outcomes.some((item: { code: string }) => item.code === "RATE_LIMITED")).toBe(
      true,
    );
    expect(service.inserts()).toBeLessThanOrEqual(3);
    const connection = (await db.query("SELECT id FROM google_connections")).rows[0]!.id as string;
    expect(await readSyncPreference(connection)).toEqual({ mode: "continuous", horizonDays: 90 });
    expect((await disconnect(request("disconnect", { cookie }))).status).toBe(200);
    expect(await readSyncPreference(connection)).toBeNull();
    const calls = vi.mocked(fetch).mock.calls.length;
    const response = await sync(request("sync", { cookie, body: input }));
    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(calls);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_sync_preferences WHERE sync_mode = 'continuous'",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("rejects unsupported modes/horizons before persisting or calling Google", async () => {
    const cookie = await sessionCookie();
    for (const change of [
      { mode: "continuous", nights: 30 },
      { mode: "fixed", nights: 0 },
      { mode: "forever", nights: 90 },
      { mode: "fixed", nights: 91 },
      { mode: "fixed", nights: "60" },
    ]) {
      const response = await sync(request("sync", { cookie, body: { ...syncInput, ...change } }));
      expect(response.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await db.query("SELECT * FROM google_calendar_sync_preferences")).rows).toHaveLength(0);
    expect(
      validateSyncRequest({ ...syncInput, mode: "continuous", nights: undefined }).nights,
    ).toBe(90);
  });
});

import { POST as remove } from "../../src/app/api/google-calendar/remove/route";
import { removeCalendarEvents } from "../../src/lib/google-calendar/removal.server";
import { googleEventPayload } from "../../src/lib/google-calendar/events.server";
import { readSession } from "../../src/lib/google-calendar/session.server";
import { syncGoogleEvent } from "../../src/lib/google-calendar/sync-event.server";
import { assertCalendarMutationsEnabled } from "../../src/lib/google-calendar/maintenance.server";
import {
  saveSyncPreference,
  readSyncSelection,
} from "../../src/lib/google-calendar/sync-database.server";
import type { RemovalRequest, RemovalResult } from "../../src/lib/google-calendar/removal";

function removalService(failAt = 0, failureStatus = 500, lostResponse = false) {
  const service = calendarService();
  const original = vi.mocked(fetch).getMockImplementation()!;
  let deletes = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method !== "DELETE") return original(url, init);
    deletes++;
    const target = new URL(String(url));
    expect(target.hostname).toBe("www.googleapis.com");
    expect(target.searchParams.get("sendUpdates")).toBe("none");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"v1"');
    if (deletes === failAt && !lostResponse) return json({}, failureStatus);
    const id = target.pathname.split("/").at(-1)!;
    service.stored.delete(id);
    if (deletes === failAt && lostResponse) throw new TypeError("Lost delete response");
    return new Response(null, { status: 204 });
  });
  return { ...service, deletes: () => deletes };
}
async function removeRequest(body: RemovalRequest, cookie: string): Promise<RemovalResult> {
  const response = await remove(request("remove", { body, cookie }));
  expect(response.status).toBe(200);
  return response.json();
}
async function seedSync(input: SyncRequest, cookie: string) {
  const active = await readSession(request("session", { cookie }));
  await saveSyncPreference(active.connectionId, input);
  for (const date of syncDates(input.startDate, input.nights)) {
    for (const item of await calculateSyncNight(input, date))
      await syncGoogleEvent(active, date, item);
  }
  return active;
}
const horizonRemoval = (nights = 30, mode: "fixed" | "continuous" = "fixed"): RemovalRequest => ({
  scope: "horizon",
  startDate: "2026-03-01",
  nights,
  mode,
  selected: ["final-sixth"],
});

describe("safe Google Calendar removal", () => {
  it("reproduces the production one-night add then remove flow with startDate", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const addResponse = await events(request("events", { cookie, body: { events: [event] } }));
    expect(addResponse.status).toBe(200);
    expect(await addResponse.json()).toEqual({
      outcomes: [{ id: "last-third", status: "created" }],
    });
    const eventId = service.stored.keys().next().value!;
    const created = service.stored.get(eventId)!;
    expect(created.extendedProperties.private.application).toBe("prophetic-night-segments");
    expect(created.extendedProperties.private.planEvent).toBe("last-third");
    expect((created.extendedProperties.private as Record<string, string>).localNight).toBe(
      "2026-03-28",
    );
    expect(eventId).toMatch(/^[0-9a-f]{64}$/);

    const result = await removeRequest(
      { scope: "night", events: [event], startDate: "2026-03-28" },
      cookie,
    );
    expect(result.outcomes).toEqual([
      { id: "last-third", identity: "mapped", date: "2026-03-28", status: "removed" },
    ]);
    expect(service.deletes()).toBe(1);
    expect(service.stored.has(eventId)).toBe(false);
  });

  it("finds an app-owned one-night event when recalculation changed its deterministic ID", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const original = { ...event, start: "2026-03-29T00:45:00Z", end: "2026-03-29T00:45:00Z" };
    const recalculated = {
      ...original,
      start: "2026-03-29T00:46:00Z",
      end: "2026-03-29T00:46:00Z",
    };
    expect((await events(request("events", { cookie, body: { events: [original] } }))).status).toBe(
      200,
    );
    expect(googleEventPayload(original).id).not.toBe(googleEventPayload(recalculated).id);
    const result = await removeRequest({ scope: "night", events: [recalculated] }, cookie);
    expect(result.outcomes).toEqual([
      { id: "last-third", identity: "mapped", date: "2026-03-28", status: "removed" },
    ]);
    expect(service.deletes()).toBe(1);
    expect(service.stored.has(googleEventPayload(original).id)).toBe(false);
  });

  it("removes only the selected app-owned one-night event and repeats safely", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const added = await events(request("events", { cookie, body: { events: [event] } }));
    expect(added.status).toBe(200);
    const other = { ...event, id: "fajr" };
    await events(request("events", { cookie, body: { events: [other] } }));
    const input: RemovalRequest = { scope: "night", events: [event] };
    expect((await removeRequest(input, cookie)).outcomes).toEqual([
      { id: "last-third", identity: "mapped", date: "2026-03-28", status: "removed" },
    ]);
    expect(service.deletes()).toBe(1);
    expect(
      [...service.stored.values()].some(
        (item) => item.extendedProperties.private.planEvent === "fajr",
      ),
    ).toBe(true);
    expect((await removeRequest(input, cookie)).outcomes[0]!.status).toBe("absent");
    expect(service.deletes()).toBe(1);
  });

  it.each([404, 410, "cancelled"] as const)(
    "treats an already-deleted one-night event (%s) as absent",
    async (status) => {
      calendarService();
      const cookie = await sessionCookie();
      await events(request("events", { cookie, body: { events: [event] } }));
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch).mockResolvedValue(
        status === "cancelled" ? json({ status }) : json({}, status),
      );
      expect(
        (await removeRequest({ scope: "night", events: [event] }, cookie)).outcomes[0]!.status,
      ).toBe("absent");
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    },
  );

  it.each(["application", "planEvent", "id", "etag"])(
    "refuses one-night deletion with invalid %s",
    async (field) => {
      const service = calendarService();
      const cookie = await sessionCookie();
      await events(request("events", { cookie, body: { events: [event] } }));
      const payload = service.stored.values().next().value!;
      vi.mocked(fetch).mockClear();
      if (field === "application" || field === "planEvent")
        payload.extendedProperties.private[field] = "foreign";
      else if (field === "id") payload.id = "foreign";
      else payload.etag = "";
      vi.mocked(fetch).mockResolvedValue(json(payload));
      const result = await removeRequest({ scope: "night", events: [event] }, cookie);
      expect(result.outcomes[0]!.status).toBe("failed");
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    },
  );

  it.each([
    [30, "fixed"],
    [60, "fixed"],
    [90, "fixed"],
    [90, "continuous"],
  ] as const)(
    "removes one selected type across %i %s nights and preserves other types/dates",
    async (nights, mode) => {
      const service = removalService();
      const cookie = await sessionCookie();
      const input: SyncRequest = {
        ...syncInput,
        startDate: "2026-03-01",
        mode,
        nights,
        selected: ["fajr", "final-sixth", "prayer"],
      };
      const active = await seedSync(input, cookie);
      // A matching type outside the chosen horizon and an unmapped event must survive.
      const outside = syncDates(input.startDate, nights + 1).at(-1)!;
      const [outsideEvent] = await calculateSyncNight(
        { ...input, selected: ["final-sixth"] },
        outside,
      );
      await syncGoogleEvent(active, outside, outsideEvent!);
      const foreignId = "a".repeat(64);
      const foreign = {
        ...service.stored.values().next().value!,
        extendedProperties: { private: { localNight: input.startDate, planEvent: "final-sixth" } },
      };
      service.stored.set(foreignId, foreign);
      const result = await removeRequest(horizonRemoval(nights, mode), cookie);
      expect(result.outcomes).toHaveLength(nights);
      expect(
        result.outcomes.every((item) => item.id === "final-sixth" && item.status === "removed"),
      ).toBe(true);
      expect(service.deletes()).toBe(nights);
      expect(service.stored.size).toBe(nights * 2 + 2);
      expect(service.stored.has(foreignId)).toBe(true);
      expect((await readSyncSelection(active.connectionId)).selected).toEqual(["fajr", "prayer"]);
      expect(await readSyncPreference(active.connectionId)).toEqual({ mode, horizonDays: nights });
      expect(
        (
          await db.query(
            "SELECT event_type, count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL GROUP BY event_type ORDER BY event_type",
          )
        ).rows,
      ).toEqual([
        { event_type: "fajr", count: nights },
        { event_type: "final-sixth", count: 1 },
        { event_type: "prayer", count: nights },
      ]);
      const repeated = await removeRequest(horizonRemoval(nights, mode), cookie);
      expect(repeated.outcomes.every((item) => item.status === "absent")).toBe(true);
      expect(service.deletes()).toBe(nights);
    },
    30_000,
  );

  it("restores saved choices for the next sync and rejects a stale tab that would recreate a removed type", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const input: SyncRequest = {
      ...syncInput,
      startDate: "2026-03-01",
      mode: "continuous",
      nights: 90,
      selected: ["fajr", "final-sixth"],
    };
    const active = await seedSync({ ...input, nights: 1, mode: "fixed" }, cookie);
    const before = await readSyncSelection(active.connectionId);
    await removeRequest(horizonRemoval(90, "continuous"), cookie);
    const calls = vi.mocked(fetch).mock.calls.length;
    const stale = await sync(
      request("sync", { cookie, body: { ...input, selectionRevision: before.revision } }),
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("SELECTION_CHANGED");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    const saved = (await (await session(request("session", { cookie }))).json()).syncSelection;
    expect(saved.selected).toEqual(["fajr"]);
    // Replay the persisted selection through the existing sync path.
    const next = await runSync(
      {
        ...input,
        nights: 1,
        mode: undefined,
        selected: saved.selected,
        selectionRevision: saved.revision,
      },
      cookie,
    );
    expect(next.outcomes).toHaveLength(1);
    expect(next.outcomes[0]).toMatchObject({ id: "fajr", status: "existing" });
    expect(service.stored.size).toBe(1);
    // A fresh explicit selection can add that type on a new date with the same identity scheme.
    const choice = await readSyncSelection(active.connectionId);
    const explicit = await runSync(
      {
        ...input,
        startDate: "2026-03-02",
        nights: 1,
        mode: undefined,
        selectionRevision: choice.revision,
      },
      cookie,
    );
    expect(explicit.outcomes.every((item: { status: string }) => item.status === "created")).toBe(
      true,
    );
  });

  it("clears the preference when its last type is removed without a schema change", async () => {
    removalService();
    const cookie = await sessionCookie();
    const active = await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
      cookie,
    );
    const result = await removeRequest(horizonRemoval(), cookie);
    expect(result.syncSelection).toEqual({ selected: [], revision: null });
    expect(await readSyncPreference(active.connectionId)).toBeNull();
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it.each([500, 412])(
    "preserves failed mappings on Google %i and retries without touching successful deletions",
    async (status) => {
      const service = removalService(2, status);
      const cookie = await sessionCookie();
      const active = await seedSync(
        { ...syncInput, startDate: "2026-03-01", nights: 3, selected: ["final-sixth", "fajr"] },
        cookie,
      );
      const result = await removeRequest(horizonRemoval(), cookie);
      expect(result.outcomes.filter((item) => item.status === "failed")).toHaveLength(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE event_type = 'final-sixth' AND deleted_at IS NULL",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      expect((await readSyncSelection(active.connectionId)).selected).toEqual(["fajr"]);
      expect(
        (await removeRequest(horizonRemoval(), cookie)).outcomes.every(
          (item) => item.status !== "failed",
        ),
      ).toBe(true);
      expect(service.deletes()).toBe(4);
      expect(service.stored.size).toBe(3);
    },
  );

  it("recovers a lost Google deletion response before removing its mapping", async () => {
    const service = removalService(1, 500, true);
    const cookie = await sessionCookie();
    await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
      cookie,
    );
    expect((await removeRequest(horizonRemoval(), cookie)).outcomes[0]!.status).toBe("failed");
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (await removeRequest(horizonRemoval(), cookie)).outcomes.every(
        (item) => item.status === "absent",
      ),
    ).toBe(true);
    expect(service.deletes()).toBe(1);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("refuses a mapped event whose ownership metadata changed and preserves the mapping", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
      cookie,
    );
    service.stored.values().next().value!.extendedProperties.private.localNight = "2026-03-02";
    expect((await removeRequest(horizonRemoval(), cookie)).outcomes[0]).toMatchObject({
      status: "failed",
      code: "EVENT_NOT_OWNED",
    });
    expect(service.deletes()).toBe(0);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it("removes the displayed night's mapped identity even after planning times changed, without changing horizon preferences", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 2, selected: ["last-third"] },
      cookie,
    );
    const input: RemovalRequest = { scope: "night", startDate: "2026-03-01", events: [event] };
    const result = await removeRequest(input, cookie);
    expect(result.outcomes.map((item) => item.status)).toEqual(["removed"]);
    expect(service.stored.size).toBe(1);
    expect((await readSyncSelection(active.connectionId)).selected).toEqual(["last-third"]);
  });

  it("rejects forged origins, unauthenticated requests, arbitrary horizons and unselected types", async () => {
    const cookie = await sessionCookie();
    expect(
      (
        await remove(
          request("remove", { cookie, origin: "https://attacker.example", body: horizonRemoval() }),
        )
      ).status,
    ).toBe(403);
    expect((await remove(request("remove", { body: horizonRemoval() }))).status).toBe(401);
    for (const change of [
      { nights: 31 },
      { nights: "90" },
      { mode: "continuous", nights: 30 },
      { startDate: "2026-02-30" },
      { selected: [] },
      { selected: ["fajr", "fajr"] },
      { selected: ["invalid/type"] },
      { scope: "all" },
      { selectionRevision: 123 },
    ]) {
      expect(
        (await remove(request("remove", { cookie, body: { ...horizonRemoval(), ...change } })))
          .status,
      ).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares the account lease with sync and one-night additions", async () => {
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const owner = randomUUID();
    await acquireSyncLease(active.connectionId, owner);
    expect((await remove(request("remove", { cookie, body: horizonRemoval() }))).status).toBe(409);
    expect((await events(request("events", { cookie, body: { events: [event] } }))).status).toBe(
      409,
    );
    expect(fetch).not.toHaveBeenCalled();
    await releaseSyncLease(active.connectionId, owner);
  });

  it("stops starting deletions after quota failure and keeps remaining mappings", async () => {
    const service = removalService(1, 429);
    const cookie = await sessionCookie();
    await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 6, selected: ["final-sixth"] },
      cookie,
    );
    const result = await removeRequest(horizonRemoval(), cookie);
    expect(service.deletes()).toBeLessThanOrEqual(3);
    expect(result.outcomes.some((item) => item.code === "RATE_LIMITED")).toBe(true);
    const remaining = (
      await db.query(
        "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
      )
    ).rows[0]!.count;
    expect(remaining).toBe(service.stored.size);
    expect(remaining).toBeGreaterThanOrEqual(4);
  });
});

describe("removal persistence failures", () => {
  it("does not call Google when saving removal intent fails", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["fajr", "final-sixth"] },
      cookie,
    );
    const before = await readSyncSelection(active.connectionId);
    await db.exec(`CREATE FUNCTION reject_test_preference_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
      CREATE TRIGGER reject_test_preference_update BEFORE UPDATE ON google_calendar_sync_preferences FOR EACH ROW EXECUTE FUNCTION reject_test_preference_update();`);
    try {
      const calls = vi.mocked(fetch).mock.calls.length;
      const response = await remove(request("remove", { cookie, body: horizonRemoval() }));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(await response.json())).not.toContain("test failure");
      expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
      expect(service.deletes()).toBe(0);
      expect(await readSyncSelection(active.connectionId)).toEqual(before);
    } finally {
      await db.exec(
        "DROP TRIGGER reject_test_preference_update ON google_calendar_sync_preferences; DROP FUNCTION reject_test_preference_update();",
      );
    }
  });

  it("reports mapping cleanup failure and reconciles absence on retry", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
      cookie,
    );
    await db.exec(`CREATE FUNCTION reject_test_mapping_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
      CREATE TRIGGER reject_test_mapping_delete BEFORE UPDATE ON google_calendar_event_mappings FOR EACH ROW EXECUTE FUNCTION reject_test_mapping_delete();`);
    try {
      const result = await removeRequest(horizonRemoval(), cookie);
      expect(result.outcomes[0]).toMatchObject({ status: "failed", code: "REMOVE_FAILED" });
      expect(service.stored.size).toBe(0);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await db.exec(
        "DROP TRIGGER reject_test_mapping_delete ON google_calendar_event_mappings; DROP FUNCTION reject_test_mapping_delete();",
      );
    }
    expect(
      (await removeRequest(horizonRemoval(), cookie)).outcomes.every(
        (item) => item.status === "absent",
      ),
    ).toBe(true);
    expect(service.deletes()).toBe(1);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
});

describe("removal absence and deadline handling", () => {
  it.each([404, 410])(
    "cleans a mapping when Google confirms absence during DELETE (%i)",
    async (status) => {
      const service = removalService(1, status);
      const cookie = await sessionCookie();
      await seedSync(
        { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
        cookie,
      );
      const result = await removeRequest(horizonRemoval(), cookie);
      expect(result.outcomes[0]!.status).toBe("absent");
      expect(service.deletes()).toBe(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    },
  );

  it("preserves mappings when the removal deadline prevents starting Google work", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    await seedSync(
      { ...syncInput, startDate: "2026-03-01", nights: 1, selected: ["final-sixth"] },
      cookie,
    );
    const now = Date.now();
    const clock = vi
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValue(now + 260_000);
    const req = request("remove", { cookie });
    const result = await removeCalendarEvents(horizonRemoval(), req, await readSession(req), clock);
    expect(result.outcomes.every((item) => item.code === "REMOVE_INCOMPLETE")).toBe(true);
    expect(service.deletes()).toBe(0);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM google_calendar_event_mappings WHERE deleted_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
});

import { NIGHT_PART_TITLES } from "../../src/lib/calendar/buildCalendarEvents";
import type { GoogleEventId } from "../../src/lib/google-calendar/plan";
const nightPartIds = Object.keys(NIGHT_PART_TITLES) as GoogleEventId[];

it("adds and removes all six duration events through the one-night routes", async () => {
  const service = removalService();
  const cookie = await sessionCookie();
  const parts = await calculateSyncNight(
    { ...syncInput, selected: nightPartIds },
    syncInput.startDate,
  );
  const response = await events(request("events", { cookie, body: { events: parts } }));
  expect(response.status).toBe(200);
  expect((await response.json()).outcomes).toEqual(
    nightPartIds.map((id) => ({ id, status: "created" })),
  );
  for (const part of parts) {
    const actual = [...service.stored.values()].find(
      (item) => item.extendedProperties.private.planEvent === part.id,
    )!;
    expect(Date.parse(actual.start.dateTime)).toBe(Date.parse(part.start));
    expect(Date.parse(actual.end.dateTime)).toBe(Date.parse(part.end));
  }
  const removed = await removeRequest({ scope: "night", events: parts }, cookie);
  expect(removed.outcomes).toHaveLength(6);
  expect(removed.outcomes.every((item) => item.status === "removed")).toBe(true);
  expect(service.stored.size).toBe(0);
});

it.each([
  [30, "fixed"],
  [60, "fixed"],
  [90, "fixed"],
  [90, "continuous"],
] as const)(
  "syncs, repeats and removes six independent segments for %i %s nights",
  async (nights, mode) => {
    // Skip only the production request pacing delay against the in-memory Google service.
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal(
      "setTimeout",
      (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
        originalSetTimeout(callback, delay === 300 ? 0 : delay, ...args),
    );
    const service = removalService();
    const cookie = await sessionCookie();
    const input: SyncRequest = { ...syncInput, nights, mode, selected: nightPartIds };
    const first = await runSync(input, cookie);
    expect(first.syncedNights).toBe(nights);
    expect(service.stored.size).toBe(nights * 6);
    for (const date of syncDates(input.startDate, nights)) {
      const expected = await calculateSyncNight(input, date);
      for (const part of expected) {
        const actual = [...service.stored.values()].find(
          (item) =>
            item.extendedProperties.private.localNight === date &&
            item.extendedProperties.private.planEvent === part.id,
        )!;
        expect(Date.parse(actual.start.dateTime)).toBe(Date.parse(part.start));
        expect(Date.parse(actual.end.dateTime)).toBe(Date.parse(part.end));
      }
    }
    const clocks = [...service.stored.values()]
      .filter((item) => item.extendedProperties.private.planEvent === "night-part-1")
      .map((item) =>
        Temporal.Instant.from(item.start.dateTime)
          .toZonedDateTimeISO("Europe/London")
          .toPlainTime()
          .toString(),
      );
    expect(new Set(clocks).size).toBeGreaterThan(20);
    const second = await runSync(input, cookie);
    expect(second.outcomes.every((item: { status: string }) => item.status === "existing")).toBe(
      true,
    );
    expect(service.inserts()).toBe(nights * 6);
    const active = await readSession(request("session", { cookie }));
    expect(
      (
        await db.query(
          "SELECT selected_event_types FROM google_calendar_sync_preferences WHERE google_connection_id = $1",
          [active.connectionId],
        )
      ).rows,
    ).toEqual([{ selected_event_types: nightPartIds }]);
    const removed = await removeRequest(
      { scope: "horizon", startDate: input.startDate, nights, mode, selected: nightPartIds },
      cookie,
    );
    expect(removed.outcomes).toHaveLength(nights * 6);
    expect(removed.outcomes.every((item) => item.status === "removed")).toBe(true);
    expect(service.stored.size).toBe(0);
  },
  60_000,
);

import { calculateNightSegments } from "@prophetic-night/night-engine";
import { buildGooglePlan } from "../../src/lib/google-calendar/plan";
import { findOwnedEvent } from "../../src/lib/calendar/repository.server";
import { googleOwnershipMetadata } from "../../src/lib/google-calendar/ownership.server";
import { removeGoogleEvent } from "../../src/lib/google-calendar/remove-event.server";
import { recoverGoogleMapping } from "../../src/lib/google-calendar/recovery.server";

const ownershipOptions = {
  wakeBufferMinutes: 15,
  dawudSelected: true,
  prayerSource: "Supplied test timetable",
  fajrPreparationMinutes: 20,
  firstAdhanMinutes: 30,
};

describe("permanent Maghrib service-date ownership", () => {
  it.each([
    ["2026-01-01", "2026-01-01T18:00:00Z", "2026-01-02T06:00:00Z", "UTC"],
    ["2026-03-28", "2026-03-28T18:00:00Z", "2026-03-29T06:00:00+01:00", "Europe/London"],
    ["2026-10-24", "2026-10-24T18:00:00+01:00", "2026-10-25T06:00:00Z", "Europe/London"],
    ["2026-12-31", "2026-12-31T18:00:00+05:45", "2027-01-01T06:00:00+05:45", "Asia/Kathmandu"],
  ])(
    "preserves %s for every event before/after midnight and through DST",
    async (date, maghrib, fajr, timeZone) => {
      const service = removalService();
      const cookie = await sessionCookie();
      const night = calculateNightSegments({ maghrib, fajr, timeZone });
      const before = structuredClone(night);
      const plan = buildGooglePlan(night, ownershipOptions);
      expect(plan.every((item) => item.serviceDate === date)).toBe(true);
      expect(
        plan.some(
          (item) =>
            Temporal.Instant.from(item.start)
              .toZonedDateTimeISO(timeZone)
              .toPlainDate()
              .toString() === date,
        ),
      ).toBe(true);
      expect(
        plan.some(
          (item) =>
            Temporal.Instant.from(item.start)
              .toZonedDateTimeISO(timeZone)
              .toPlainDate()
              .toString() !== date,
        ),
      ).toBe(true);
      const response = await events(
        request("events", { cookie, body: { startDate: date, events: plan } }),
      );
      expect(
        (await response.json()).outcomes.every(
          (item: { status: string }) => item.status === "created",
        ),
      ).toBe(true);
      const rows = (
        await db.query(
          "SELECT app_event_id, service_date::text, service_timezone FROM app_calendar_events",
        )
      ).rows;
      expect(rows).toHaveLength(plan.length);
      expect(
        rows.every((row) => row.service_date === date && row.service_timezone === timeZone),
      ).toBe(true);
      const privateMetadata = [...service.stored.values()].map(
        (item) => item.extendedProperties.private,
      );
      expect(new Set(privateMetadata.map((p) => p.appEventId)).size).toBe(plan.length);
      expect(
        privateMetadata.every((p) => p.localNight === date && p.ownershipVersion === "1"),
      ).toBe(true);
      const removed = await removeRequest(
        { scope: "night", selected: plan.map((item) => item.id), startDate: date },
        cookie,
      );
      expect(removed.outcomes.every((item) => item.status === "removed")).toBe(true);
      expect(service.stored.size).toBe(0);
      expect(night).toEqual(before);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM google_calendar_event_mappings WHERE deleted_at IS NOT NULL",
          )
        ).rows[0]!.n,
      ).toBe(plan.length);
    },
  );

  it("updates the same persisted event across title, timestamp, timezone and version changes", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const original = { ...event, serviceDate: "2026-03-28" };
    await events(request("events", { cookie, body: { events: [original] } }));
    const mapping = (await findOwnedEvent(active.connectionId, original.serviceDate, event.id))!;
    const changed = {
      ...original,
      title: "A future Qiyam display label",
      start: "2026-03-29T02:03:04Z",
      end: "2026-03-29T03:03:04Z",
      timeZone: "America/New_York",
    };
    expect(await syncGoogleEvent(active, original.serviceDate, changed)).toBe("updated");
    expect(await syncGoogleEvent(active, original.serviceDate, changed)).toBe("existing");
    expect(service.stored.size).toBe(1);
    expect(
      (await findOwnedEvent(active.connectionId, original.serviceDate, event.id))!.appEventId,
    ).toBe(mapping.appEventId);
    expect(service.stored.get(mapping.providerEventId)!.summary).toBe(changed.title);
    expect(
      (await db.query("SELECT service_date::text, service_timezone FROM app_calendar_events")).rows,
    ).toEqual([{ service_date: original.serviceDate, service_timezone: "Europe/London" }]);
    // A new browser/session and rebuilt plan do not reconstruct the old timestamp.
    const newCookie = await sessionCookie();
    expect(
      (
        await removeRequest(
          { scope: "night", selected: [event.id], startDate: original.serviceDate },
          newCookie,
        )
      ).outcomes[0]!.status,
    ).toBe("removed");
  });

  it("never updates or deletes identical manual or other-application events", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    await events(request("events", { cookie, body: { events: [event] } }));
    const original = structuredClone(service.stored.values().next().value!);
    service.stored.set("manual", {
      ...original,
      id: "manual",
      extendedProperties: { private: { planEvent: event.id } },
    });
    service.stored.set("another-app", {
      ...original,
      id: "another-app",
      extendedProperties: { private: { application: "another-app", planEvent: event.id } },
    });
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", { ...event, title: "Changed by app" });
    await removeRequest({ scope: "night", selected: [event.id], startDate: "2026-03-28" }, cookie);
    expect(service.stored.get("manual")!.summary).toBe(original.summary);
    expect(service.stored.get("another-app")!.summary).toBe(original.summary);
    expect(service.stored.size).toBe(2);
  });

  it.each([
    "application",
    "appEventId",
    "ownershipVersion",
    "ownershipProof",
    "connectionId",
    "localNight",
  ])("blocks both update and deletion when %s changes", async (field) => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", event);
    service.stored.values().next().value!.extendedProperties.private[field] = "unverified";
    await expect(
      syncGoogleEvent(active, "2026-03-28", { ...event, title: "New title" }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_OWNED" });
    expect(
      (
        await removeRequest(
          { scope: "night", selected: [event.id], startDate: "2026-03-28" },
          cookie,
        )
      ).outcomes[0],
    ).toMatchObject({ status: "failed", code: "EVENT_NOT_OWNED" });
    expect(service.patches()).toBe(0);
    expect(service.deletes()).toBe(0);
  });

  it("isolates connections, provider accounts and calendars, even with copied metadata", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", event);
    const mapping = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
    const calls = vi.mocked(fetch).mock.calls.length;
    for (const changed of [{ connectionId: randomUUID() }, { subject: "account-b" }])
      await expect(removeGoogleEvent(mapping, { ...active, ...changed })).rejects.toMatchObject({
        code: "EVENT_NOT_OWNED",
      });
    for (const changed of [{ calendarId: "another-calendar" }, { provider: "microsoft" as const }])
      await expect(removeGoogleEvent({ ...mapping, ...changed }, active)).rejects.toMatchObject({
        code: "EVENT_NOT_OWNED",
      });
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect(service.deletes()).toBe(0);
  });

  it("retains event identities across disconnect and reconnect without retaining credentials", async () => {
    const service = removalService();
    const first = await sessionCookie();
    const active = await readSession(request("session", { cookie: first }));
    await syncGoogleEvent(active, "2026-03-28", event);
    const original = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
    await disconnect(request("disconnect", { cookie: first }));
    expect(
      (
        await db.query(
          "SELECT encrypted_access_token, encrypted_refresh_token FROM google_connections",
        )
      ).rows,
    ).toEqual([{ encrypted_access_token: null, encrypted_refresh_token: null }]);
    await expect(
      syncGoogleEvent(active, "2026-03-28", { ...event, title: "Disconnected write" }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const second = await sessionCookie();
    const reconnected = await readSession(request("session", { cookie: second }));
    expect(reconnected.connectionId).toBe(active.connectionId);
    expect(
      (await findOwnedEvent(reconnected.connectionId, "2026-03-28", event.id))!.appEventId,
    ).toBe(original.appEventId);
    expect(
      (
        await removeRequest(
          { scope: "night", selected: [event.id], startDate: "2026-03-28" },
          second,
        )
      ).outcomes[0]!.status,
    ).toBe("removed");
    expect(service.deletes()).toBe(1);
  });

  it("enforces immutable service dates and account bindings in the database", async () => {
    calendarService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", event);
    for (const sql of [
      "UPDATE app_calendar_events SET service_date = '2026-03-29'",
      "UPDATE app_calendar_events SET app_event_id = gen_random_uuid()",
      "UPDATE app_calendar_events SET connection_id = gen_random_uuid()",
      "UPDATE app_calendar_events SET service_timezone = 'UTC'",
      "UPDATE google_calendar_event_mappings SET local_night = '2026-03-29'",
      "UPDATE google_calendar_event_mappings SET google_event_id = repeat('b', 64)",
    ])
      await expect(db.exec(sql)).rejects.toThrow(/immutable/);
    await expect(
      syncGoogleEvent(active, "2026-03-29", { ...event, serviceDate: "2026-03-28" }),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect((await db.query("SELECT service_date::text FROM app_calendar_events")).rows).toEqual([
      { service_date: "2026-03-28" },
    ]);
  });

  it("does not resurrect deleted events by recalculating a different time", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", event);
    await removeRequest({ scope: "night", selected: [event.id], startDate: "2026-03-28" }, cookie);
    await expect(
      syncGoogleEvent(active, "2026-03-28", {
        ...event,
        start: "2026-03-29T03:00:00Z",
        end: "2026-03-29T03:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "EVENT_DELETED" });
    expect(service.inserts()).toBe(1);
  });

  it("does not delete the adjacent night or unknown unversioned one-night exports", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-27", event);
    const legacy = googleEventPayload(event);
    service.stored.set(legacy.id, { ...legacy, etag: '"v1"', status: "confirmed" });
    expect(
      (
        await removeRequest(
          { scope: "night", selected: [event.id], startDate: "2026-03-28" },
          cookie,
        )
      ).outcomes[0]!.status,
    ).toBe("absent");
    expect(service.deletes()).toBe(0);
    expect(service.stored.size).toBe(2);
  });

  it("recovers positively verified legacy sync events without reconstructing original times", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const legacyId = syncEventIdentity(active.subject, "2026-03-28", event.id);
    service.stored.set(legacyId, {
      ...googleEventPayload(event),
      id: legacyId,
      etag: '"v1"',
      status: "confirmed",
      extendedProperties: {
        private: {
          application: "prophetic-night-segments",
          planEvent: event.id,
          localNight: "2026-03-28",
        },
      },
    });
    const result = await removeRequest(
      { scope: "night", selected: [event.id], startDate: "2026-03-28" },
      cookie,
    );
    expect(result.outcomes[0]!.status).toBe("removed");
    expect(service.inserts()).toBe(0);
    expect(
      (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!.providerEventId,
    ).toBe(legacyId);
  });

  it("recovers signed provider metadata after loss of a mapping", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await syncGoogleEvent(active, "2026-03-28", event);
    const original = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
    await db.exec("DELETE FROM google_calendar_event_mappings");
    expect(await syncGoogleEvent(active, "2026-03-28", event)).toBe("existing");
    expect((await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!.appEventId).toBe(
      original.appEventId,
    );
    expect(service.inserts()).toBe(1);
  });

  it("checks every recovery page and refuses ambiguous identities", async () => {
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const base = {
      appEventId: randomUUID(),
      ownerApplication: "prophetic-night-segments" as const,
      ownershipVersion: 1 as const,
      connectionId: active.connectionId,
      serviceDate: "2026-03-28",
      eventKind: event.id,
      serviceTimeZone: null,
      provider: "google" as const,
      accountSubject: active.subject,
      calendarId: "primary",
      providerEventId: "a".repeat(64),
      metadataVersion: 1,
      deletedAt: null,
    };
    const other = { ...base, appEventId: randomUUID(), providerEventId: "b".repeat(64) };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          items: [
            {
              id: base.providerEventId,
              extendedProperties: { private: googleOwnershipMetadata(base) },
            },
          ],
          nextPageToken: "next",
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            {
              id: other.providerEventId,
              extendedProperties: { private: googleOwnershipMetadata(other) },
            },
          ],
        }),
      );
    await expect(recoverGoogleMapping(active, base.serviceDate, event.id)).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
    });
    expect(vi.mocked(fetch).mock.calls[1]![0]).toContain("pageToken=next");
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
});

// Regression tests for completion of the immutable ownership rollout.
describe("ownership reconciliation and write fencing", () => {
  it("shares one-night identity with every horizon, including Continuous", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const [planned] = await calculateSyncNight(syncInput, syncInput.startDate);
    await events(
      request("events", { cookie, body: { events: [planned], startDate: syncInput.startDate } }),
    );
    const active = await readSession(request("session", { cookie }));
    const original = await findOwnedEvent(active.connectionId, syncInput.startDate, planned!.id);
    for (const [nights, mode] of [
      [30, "fixed"],
      [60, "fixed"],
      [90, "fixed"],
      [90, "continuous"],
    ] as const) {
      const result = await runSync({ ...syncInput, nights, mode }, cookie);
      expect(result.syncedNights).toBe(nights);
      expect(service.stored.size).toBe(nights);
      expect(await findOwnedEvent(active.connectionId, syncInput.startDate, planned!.id)).toEqual(
        original,
      );
    }
    expect(service.inserts()).toBe(90);
  }, 60_000);

  it("upgrades a migrated legacy mapping only with a verified conditional patch", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const appId = randomUUID();
    const providerId = syncEventIdentity(active.subject, "2026-03-28", event.id);
    await db.query(
      "INSERT INTO app_calendar_events (app_event_id, connection_id, service_date, event_kind) VALUES ($1, $2, '2026-03-28', $3)",
      [appId, active.connectionId, event.id],
    );
    await db.query(
      "INSERT INTO google_calendar_event_mappings (app_event_id, google_connection_id, local_night, event_type, google_event_id) VALUES ($1, $2, '2026-03-28', $3, $4)",
      [appId, active.connectionId, event.id, providerId],
    );
    service.stored.set(providerId, {
      ...googleEventPayload(event),
      id: providerId,
      etag: '"v1"',
      status: "confirmed",
      extendedProperties: {
        private: {
          application: "prophetic-night-segments",
          planEvent: event.id,
          localNight: "2026-03-28",
        },
      },
    });
    expect(await syncGoogleEvent(active, "2026-03-28", event)).toBe("updated");
    expect(service.inserts()).toBe(0);
    expect(service.patches()).toBe(1);
    expect(service.stored.get(providerId)!.extendedProperties.private.appEventId).toBe(appId);
    expect(
      (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!.metadataVersion,
    ).toBe(1);
    delete service.stored.get(providerId)!.extendedProperties.private.ownershipVersion;
    await expect(syncGoogleEvent(active, "2026-03-28", event)).rejects.toMatchObject({
      code: "EVENT_NOT_OWNED",
    });
    expect(service.patches()).toBe(1);
  });

  it("retries failed database confirmation using the reserved provider ID", async () => {
    const service = calendarService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    await db.exec(
      "CREATE FUNCTION reject_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'confirmation failed'; END $$; CREATE TRIGGER reject_confirmation BEFORE UPDATE ON google_calendar_event_mappings FOR EACH ROW EXECUTE FUNCTION reject_confirmation();",
    );
    try {
      await expect(syncGoogleEvent(active, "2026-03-28", event)).rejects.toThrow();
      expect(service.inserts()).toBe(1);
      expect((await db.query("SELECT synced_at FROM google_calendar_event_mappings")).rows).toEqual(
        [{ synced_at: null }],
      );
    } finally {
      await db.exec(
        "DROP TRIGGER reject_confirmation ON google_calendar_event_mappings; DROP FUNCTION reject_confirmation();",
      );
    }
    const reserved = await findOwnedEvent(active.connectionId, "2026-03-28", event.id);
    expect(await syncGoogleEvent(active, "2026-03-28", event)).toBe("existing");
    expect(await findOwnedEvent(active.connectionId, "2026-03-28", event.id)).toEqual(reserved);
    expect(service.inserts()).toBe(1);
    expect(service.patches()).toBe(0);
  });

  it.each(["create", "update", "delete"])(
    "prevents %s after the lease expires during the provider read",
    async (action) => {
      const service = removalService();
      const cookie = await sessionCookie();
      const active = await readSession(request("session", { cookie }));
      if (action !== "create") await syncGoogleEvent(active, "2026-03-28", event);
      const owner = randomUUID();
      expect(await acquireSyncLease(active.connectionId, owner)).toBe(true);
      const original = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        const response = await original(url, init);
        if (
          (!init?.method || init.method === "GET") &&
          !String(url).includes("privateExtendedProperty")
        )
          await db.query(
            "UPDATE google_calendar_sync_leases SET expires_at = now() - interval '1 second' WHERE owner = $1",
            [owner],
          );
        return response;
      });
      const leased = { ...active, operationOwner: owner };
      const operation =
        action === "delete"
          ? removeGoogleEvent(
              (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!,
              leased,
            )
          : syncGoogleEvent(leased, "2026-03-28", { ...event, title: "Changed" });
      await expect(operation).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
      expect(service.inserts()).toBe(action === "create" ? 0 : 1);
      expect(service.patches()).toBe(0);
      expect(service.deletes()).toBe(0);
    },
  );

  it.each(["missing", "unknown-version", "copied-proof"])(
    "leaves %s ownership untouched",
    async (kind) => {
      const service = removalService();
      const cookie = await sessionCookie();
      const active = await readSession(request("session", { cookie }));
      await syncGoogleEvent(active, "2026-03-28", event);
      await syncGoogleEvent(active, "2026-03-27", event);
      const current = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
      const previous = (await findOwnedEvent(active.connectionId, "2026-03-27", event.id))!;
      const stored = service.stored.get(current.providerEventId)!;
      if (kind === "missing") stored.extendedProperties = undefined as never;
      else if (kind === "unknown-version") stored.extendedProperties.private.ownershipVersion = "2";
      else
        stored.extendedProperties = structuredClone(
          service.stored.get(previous.providerEventId)!.extendedProperties,
        );
      await expect(
        syncGoogleEvent(active, "2026-03-28", { ...event, title: "Changed" }),
      ).rejects.toMatchObject({ code: "EVENT_NOT_OWNED" });
      expect(
        (
          await removeRequest(
            { scope: "night", startDate: "2026-03-28", selected: [event.id] },
            cookie,
          )
        ).outcomes[0]!.code,
      ).toBe("EVENT_NOT_OWNED");
      expect(service.patches()).toBe(0);
      expect(service.deletes()).toBe(0);
    },
  );

  it("recovers a legacy event on page two and rejects looping pagination", async () => {
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const id = syncEventIdentity(active.subject, "2026-03-28", event.id);
    const candidate = {
      id,
      extendedProperties: {
        private: {
          application: "prophetic-night-segments",
          planEvent: event.id,
          localNight: "2026-03-28",
        },
      },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ items: [], nextPageToken: "page-two" }))
      .mockResolvedValueOnce(json({ items: [candidate] }));
    expect((await recoverGoogleMapping(active, "2026-03-28", event.id))!.providerEventId).toBe(id);
    vi.mocked(fetch).mockImplementation(async () => json({ items: [], nextPageToken: "loop" }));
    await expect(recoverGoogleMapping(active, "2026-03-28", event.id)).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(4);
  });

  it("preserves a sole unverified legacy candidate instead of claiming ownership", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const id = "a".repeat(64);
    service.stored.set(id, {
      ...googleEventPayload(event),
      id,
      etag: '"v1"',
      status: "confirmed",
      extendedProperties: {
        private: {
          application: "prophetic-night-segments",
          planEvent: event.id,
          localNight: "2026-03-28",
        },
      },
    });
    const result = await removeRequest(
      { scope: "night", startDate: "2026-03-28", selected: [event.id] },
      cookie,
    );
    expect(result.outcomes[0]!.code).toBe("EVENT_NOT_OWNED");
    expect(service.deletes()).toBe(0);
    expect(service.stored.size).toBe(1);
    expect((await db.query("SELECT * FROM google_calendar_event_mappings")).rows).toHaveLength(0);
  });

  it("removes retired mapped kinds only inside the explicitly authorised all-types horizon", async () => {
    const service = removalService();
    const cookie = await sessionCookie();
    const active = await readSession(request("session", { cookie }));
    const retired = { ...event, id: "retired-planning-slot" };
    await syncGoogleEvent(active, "2026-03-28", retired);
    await syncGoogleEvent(active, "2026-02-28", retired);
    await syncGoogleEvent(active, "2026-03-28", event);
    await saveSyncPreference(active.connectionId, syncInput);
    const result = await removeRequest(
      {
        scope: "horizon",
        startDate: "2026-03-01",
        nights: 30,
        mode: "fixed",
        selected: [],
        allEventTypes: true,
      },
      cookie,
    );
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.every((item) => item.status === "removed")).toBe(true);
    expect(result.outcomes.map((item) => item.id)).toContain(retired.id);
    expect(service.stored.size).toBe(1);
    expect([...service.stored.values()][0]!.extendedProperties.private.localNight).toBe(
      "2026-02-28",
    );
    expect((await readSyncSelection(active.connectionId)).selected).toEqual([]);
  });
});

describe("calendar mutation maintenance fence", () => {
  it("returns 503 before database, Google, OAuth, or token-revocation work", async () => {
    vi.stubEnv("CALENDAR_MUTATIONS_PAUSED", "true");
    const cookie = await sessionCookie();
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    const cases = [
      ["events", { events: [event] }],
      ["sync", syncInput],
      ["remove", { scope: "night", selected: [event.id], startDate: "2026-03-28" }],
      ["disconnect", undefined],
      ["connect", undefined],
      ["callback?code=unexpected&state=unexpected", undefined],
    ] as const;
    for (const [path, body] of cases) {
      const response = await (path.startsWith("callback") || path === "connect"
        ? (path.startsWith("callback") ? callback : connect)(
            request(path, { cookie, ...(body ? { body } : {}) }),
          )
        : path === "events"
          ? events(request(path, { cookie, body }))
          : path === "sync"
            ? sync(request(path, { cookie, body }))
            : path === "remove"
              ? remove(request(path, { cookie, body }))
              : disconnect(request(path, { cookie })));
      expect(response.status, path).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: "CALENDAR_MAINTENANCE",
          message:
            "Calendar changes are temporarily unavailable during maintenance. Please try again shortly.",
        },
      });
    }
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
    expect((await db.query("SELECT count(*)::int AS n FROM google_connections")).rows[0]!.n).toBe(
      1,
    );
    expect((await db.query("SELECT count(*)::int AS n FROM browser_sessions")).rows[0]!.n).toBe(1);
  });

  it("is disabled unless the environment value is exactly true", () => {
    for (const value of [undefined, "false", "TRUE", "1"]) {
      if (value === undefined) vi.unstubAllEnvs();
      else vi.stubEnv("CALENDAR_MUTATIONS_PAUSED", value);
      expect(() => assertCalendarMutationsEnabled()).not.toThrow();
    }
  });
});

it.each(["events", "remove"])(
  "rejects missing or contradictory service-date scope on %s before provider access",
  async (path) => {
    const cookie = await sessionCookie();
    for (const [body, code] of [
      [
        { events: [event], ...(path === "remove" ? { scope: "night" } : {}) },
        "SERVICE_DATE_REQUIRED",
      ],
      [
        {
          events: [{ ...event, serviceDate: "2026-03-28" }],
          startDate: "2026-03-29",
          ...(path === "remove" ? { scope: "night" } : {}),
        },
        "IDENTITY_CONFLICT",
      ],
    ] as const) {
      const raw = new NextRequest(`${origin}/api/google-calendar/${path}`, {
        method: "POST",
        headers: { origin, "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      });
      const result = await (path === "events" ? events(raw) : remove(raw));
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect((await result.json()).error.code).toBe(code);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await db.query("SELECT * FROM app_calendar_events")).rows).toHaveLength(0);
  },
);

it("preserves identity and content after a conditional update conflict", async () => {
  const service = calendarService();
  const cookie = await sessionCookie();
  const active = await readSession(request("session", { cookie }));
  await syncGoogleEvent(active, "2026-03-28", event);
  const original = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
  const fetchOriginal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    init?.method === "PATCH" ? json({}, 412) : fetchOriginal(url, init),
  );
  await expect(
    syncGoogleEvent(active, "2026-03-28", { ...event, description: "New calculation version" }),
  ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
  expect(await findOwnedEvent(active.connectionId, "2026-03-28", event.id)).toEqual(original);
  expect(service.stored.get(original.providerEventId)!.summary).toBe(event.title);
  expect(service.inserts()).toBe(1);
  expect(service.patches()).toBe(0);
});

it("does not tombstone another calendar's mapping when the provider ID matches", async () => {
  removalService();
  const cookie = await sessionCookie();
  const active = await readSession(request("session", { cookie }));
  await syncGoogleEvent(active, "2026-03-28", event);
  const primary = (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!;
  const secondaryId = randomUUID();
  await db.query(
    "INSERT INTO app_calendar_events (app_event_id, connection_id, service_date, event_kind) VALUES ($1, $2, '2026-03-28', $3)",
    [secondaryId, active.connectionId, event.id],
  );
  await db.query(
    "INSERT INTO google_calendar_event_mappings (app_event_id, google_connection_id, local_night, event_type, calendar_id, google_event_id) VALUES ($1, $2, '2026-03-28', $3, 'secondary', $4)",
    [secondaryId, active.connectionId, event.id, primary.providerEventId],
  );
  expect(
    (await removeRequest({ scope: "night", startDate: "2026-03-28", selected: [event.id] }, cookie))
      .outcomes[0]!.status,
  ).toBe("removed");
  expect(
    (await findOwnedEvent(active.connectionId, "2026-03-28", event.id))!.deletedAt,
  ).not.toBeNull();
  expect(
    (await findOwnedEvent(active.connectionId, "2026-03-28", event.id, "secondary"))!.deletedAt,
  ).toBeNull();
});
