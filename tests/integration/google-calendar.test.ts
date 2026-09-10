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
  });
  await db.query("UPDATE browser_sessions SET created_at = $1, expires_at = $2 WHERE id = $3", [
    new Date(expiresAt - 100_000).toISOString(),
    new Date(expiresAt).toISOString(),
    sessionHash(id),
  ]);
  return `${SESSION_COOKIE}=${id}`;
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
  return new NextRequest(`${origin}/api/google-calendar/${path}`, {
    method: ["events", "disconnect", "sync"].includes(path) ? "POST" : "GET",
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
  await db.exec("TRUNCATE google_connections CASCADE");
  vi.stubEnv("DATABASE_URL", "postgresql://unused-test-only/test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", `${origin}/api/google-calendar/callback`);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function startFlow() {
  const response = await connect(request("connect"));
  const authorization = new URL(response.headers.get("location")!);
  const cookie = `${FLOW_COOKIE}=${response.cookies.get(FLOW_COOKIE)!.value}`;
  return { authorization, cookie, state: authorization.searchParams.get("state")! };
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
    const response = await callback(request(`callback?code=valid-code&state=${state}`, { cookie }));
    expect(response.headers.get("location")).toContain("status=connected");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(String(tokenRequest.body)).toContain("client_secret=test-client-secret");
    expect(String(tokenRequest.body)).toContain("code_verifier=");
    const sessionValue = response.cookies.get(SESSION_COOKIE)!.value;
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60);
    expect(sessionValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionValue).not.toMatch(/test-access-token|test-refresh-token|user@example.com/);
    const stored = (await db.query("SELECT * FROM google_connections")).rows[0]!;
    expect(stored.encrypted_access_token).not.toContain("test-access-token");
    expect(
      decryptToken(String(stored.encrypted_refresh_token), "google-test-user", "refresh"),
    ).toBe("test-refresh-token");
    expect((await db.query("SELECT id FROM browser_sessions")).rows[0]!.id).toBe(
      sessionHash(sessionValue),
    );
    expect(response.cookies.get(FLOW_COOKIE)?.maxAge).toBe(0);
    const connected = await session(
      request("session", { cookie: `${SESSION_COOKIE}=${sessionValue}` }),
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
    const response = await callback(
      request(`callback?error=access_denied&state=${state}`, { cookie }),
    );
    expect(response.headers.get("location")).toContain("PERMISSION_DENIED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects partial consent without calendar permission", async () => {
    const { cookie, state } = await startFlow();
    vi.mocked(fetch).mockResolvedValueOnce(json({ scope: EMAIL_SCOPE }));
    const response = await callback(request(`callback?code=code&state=${state}`, { cookie }));
    expect(response.headers.get("location")).toContain("PERMISSION_DENIED");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("hides token endpoint failure details", async () => {
    const { cookie, state } = await startFlow();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("secret provider stack trace"));
    const response = await callback(request(`callback?code=code&state=${state}`, { cookie }));
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
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
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
    vi.mocked(fetch).mockResolvedValueOnce(json({ id: "new-event" }));
    const response = await events(
      request("events", { cookie: await sessionCookie(), body: { events: [event] } }),
    );
    expect(await response.json()).toEqual({ outcomes: [{ id: "last-third", status: "created" }] });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toContain("/calendars/primary/events?sendUpdates=none");
    const body = JSON.parse(String(init?.body));
    expect(body.summary).toBe("Qiyam — Last Third Begins");
    expect(body.start).toEqual({ dateTime: event.start, timeZone: "Europe/London" });
    expect(body.end.dateTime).toBe("2026-03-29T00:46:00Z");
    expect(body.attendees).toBeUndefined();
    expect(body.visibility).toBe("private");
  });
  it("recognizes retries and does not overwrite existing events", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(
        json({
          status: "confirmed",
          extendedProperties: { private: { application: "prophetic-night-segments" } },
        }),
      );
    const response = await events(
      request("events", { cookie: await sessionCookie(), body: { events: [event] } }),
    );
    expect((await response.json()).outcomes[0].status).toBe("existing");
    expect(vi.mocked(fetch).mock.calls[1]![1]?.method).toBeUndefined();
  });
  it("does not claim a deleted duplicate still exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({}, 409))
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
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({}))
      .mockRejectedValueOnce(new Error("internal private provider failure"));
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
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("SESSION_EXPIRED");
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
    expect((await db.query("SELECT * FROM google_connections")).rows).toHaveLength(0);
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
    const response = await callback(request(`callback?code=valid-code&state=${state}`, { cookie }));
    expect(response.headers.get("location")).toContain("status=CONNECTION_FAILED");
    expect(response.headers.get("location")).not.toContain("private");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  } finally {
    failure.mockRestore();
  }
});

it("a stale refresh cannot overwrite a newer login or resurrect a disconnected account", async () => {
  const cookie = await sessionCookie();
  const hash = sessionHash(cookie.split("=")[1]!);
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
      start: { dateTime: string };
      extendedProperties: { private: { localNight: string; planEvent: string } };
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
      { ...syncInput, nights: 31 },
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
        (await db.query("SELECT count(*)::int AS count FROM google_calendar_event_mappings")).rows,
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
      { mode: "fixed", nights: 45 },
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
