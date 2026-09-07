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
function sessionCookie(expiresAt = Date.now() + 3_600_000) {
  return `${SESSION_COOKIE}=${sealCookie({ accessToken: "test-access-token", email: "user@example.com", expiresAt }, SESSION_COOKIE)}`;
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
    method: ["events", "disconnect"].includes(path) ? "POST" : "GET",
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
beforeEach(() => {
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
    expect(authorization.searchParams.get("access_type")).toBe("online");
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
          token_type: "Bearer",
          expires_in: 3600,
          scope: CALENDAR_SCOPE,
        }),
      )
      .mockResolvedValueOnce(json({ email: "user@example.com", verified_email: true }));
    const response = await callback(request(`callback?code=valid-code&state=${state}`, { cookie }));
    expect(response.headers.get("location")).toContain("status=connected");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(String(tokenRequest.body)).toContain("client_secret=test-client-secret");
    expect(String(tokenRequest.body)).toContain("code_verifier=");
    const sessionValue = response.cookies.get(SESSION_COOKIE)!.value;
    expect(sessionValue).not.toContain("test-access-token");
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
        cookie: sessionCookie(),
        body: { events: [event] },
      }),
    );
    expect(response.status).toBe(403);
    expect(
      (
        await disconnect(
          request("disconnect", { origin: "https://attacker.example", cookie: sessionCookie() }),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("expires sessions before making upstream requests", async () => {
    const cookie = sessionCookie(Date.now() - 1);
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
      request("events", { cookie: sessionCookie(), body: { events: selection } }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized request bodies", async () => {
    const response = await events(
      request("events", {
        cookie: sessionCookie(),
        body: { events: [{ ...event, description: "x".repeat(70_000) }] },
      }),
    );
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("inserts only selected events into primary without attendees", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ id: "new-event" }));
    const response = await events(
      request("events", { cookie: sessionCookie(), body: { events: [event] } }),
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
      request("events", { cookie: sessionCookie(), body: { events: [event] } }),
    );
    expect((await response.json()).outcomes[0].status).toBe("existing");
    expect(vi.mocked(fetch).mock.calls[1]![1]?.method).toBeUndefined();
  });
  it("does not claim a deleted duplicate still exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(json({ status: "cancelled" }));
    const response = await events(
      request("events", { cookie: sessionCookie(), body: { events: [event] } }),
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
        cookie: sessionCookie(),
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
        cookie: sessionCookie(),
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
    const response = await disconnect(request("disconnect", { cookie: sessionCookie() }));
    expect(await response.json()).toEqual({ connected: false, revoked: true });
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("https://oauth2.googleapis.com/revoke");
  });
  it("still clears the local connection if revocation fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const response = await disconnect(request("disconnect", { cookie: sessionCookie() }));
    expect(await response.json()).toEqual({ connected: false, revoked: false });
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
  });
});
