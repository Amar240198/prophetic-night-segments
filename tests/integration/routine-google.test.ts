import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { reconcileGoogleSchedule } from "@/lib/google-calendar/reconcile.server";
import { automationEntitlement, startAutomationTrial } from "@/lib/automation/entitlement.server";
import { buildRoutineCalendarEvent } from "@/lib/routines/occurrences";
import type { Routine } from "@/lib/routines/model";
const db = new PGlite();
vi.mock("@neondatabase/serverless", () => ({
  neon:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          strings.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, ""),
          values,
        )
      ).rows,
}));
beforeAll(async () => {
  for (const file of [
    "001_google_calendar_persistence",
    "002_google_calendar_event_mappings",
    "003_google_calendar_night_parts",
    "004_calendar_ownership",
    "005_miqaat_accounts",
    "006_miqaat_automation",
  ])
    await db.exec(readFileSync(`migrations/${file}.sql`, "utf8"));
}, 60000);
afterAll(() => db.close());
const userId = randomUUID();
const connectionId = randomUUID();
const routine: Routine = {
  id: randomUUID(),
  name: "Evening Adhkar",
  type: "dhikr",
  enabled: true,
  durationMinutes: 15,
  recurrence: "daily",
  timing: { kind: "relative", anchor: "asr", offsetMinutes: 15 },
  createdAt: "",
  updatedAt: "",
};
const session = {
  connectionId,
  subject: "designated-test",
  accessToken: "test-only",
  email: "test@example.invalid",
  expiresAt: Date.now() + 3600000,
  accessExpiresAt: Date.now() + 3600000,
};
const scope = {
  userId,
  startDate: "2026-09-19",
  endDate: "2026-09-19",
  eventKinds: [`routine-${routine.id}`],
  allowRemoval: true,
};
const occurrence = (asr: string) =>
  buildRoutineCalendarEvent({
    routine,
    localDate: scope.startDate,
    timezone: "UTC",
    prayerSchedule: { asr: `2026-09-19T${asr}:00Z` },
  })!;
const provider = new Map<string, Record<string, unknown>>();
let writes: string[] = [];
beforeEach(async () => {
  await db.exec("TRUNCATE miqaat_users, google_connections CASCADE");
  await db.query(
    "INSERT INTO miqaat_users (id,email,password_hash) VALUES ($1,'test@example.invalid',$2)",
    [userId, "x".repeat(60)],
  );
  await db.query(
    "INSERT INTO google_connections (id, google_subject, google_account_email, encrypted_access_token, access_token_expires_at, user_id) VALUES ($1,$2,'test@example.invalid','encrypted',now()+interval '1 hour',$3)",
    [connectionId, session.subject, userId],
  );
  vi.stubEnv("DATABASE_URL", "postgresql://test-only");
  vi.stubEnv("GOOGLE_SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  provider.clear();
  writes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const id = url.pathname.split("/").at(-1)!;
      if (method === "GET" && id === "events")
        return Response.json({ items: [...provider.values()] });
      if (method === "GET")
        return provider.has(id)
          ? Response.json(provider.get(id))
          : new Response(null, { status: 404 });
      if (method === "POST") {
        const body = JSON.parse(String(init.body));
        if (provider.has(body.id)) return new Response(null, { status: 409 });
        provider.set(body.id, { ...body, etag: '"v1"' });
        writes.push(method);
        return Response.json(body);
      }
      if (!provider.has(id)) return new Response(null, { status: 404 });
      if (init.headers["If-Match"] !== provider.get(id)!.etag)
        return new Response(null, { status: 412 });
      writes.push(method);
      if (method === "DELETE") {
        provider.delete(id);
        return new Response(null, { status: 204 });
      }
      const body = { ...provider.get(id), ...JSON.parse(String(init.body)), etag: '"v2"' };
      provider.set(id, body);
      return Response.json(body);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("moves Asr-dependent routine 16:20 → 16:18 with the same logical, app and provider identities", async () => {
  const first = occurrence("16:05");
  expect((await reconcileGoogleSchedule(session, [first], scope))[0]?.action).toBe("CREATE");
  const before = (await db.query("SELECT * FROM google_calendar_event_mappings")).rows[0]!;
  const moved = occurrence("16:03");
  expect(moved.id).toBe(first.id);
  expect(moved.serviceDate).toBe(first.serviceDate);
  expect((await reconcileGoogleSchedule(session, [moved], scope))[0]?.action).toBe("UPDATE");
  const after = (await db.query("SELECT * FROM google_calendar_event_mappings")).rows[0]!;
  expect(after.app_event_id).toBe(before.app_event_id);
  expect(after.google_event_id).toBe(before.google_event_id);
  expect(provider.size).toBe(1);
  expect(provider.get(String(after.google_event_id))?.start).toEqual({
    dateTime: "2026-09-19T16:18:00Z",
    timeZone: "UTC",
  });
  expect((await reconcileGoogleSchedule(session, [moved], scope))[0]?.action).toBe("KEEP");
  expect(writes).toEqual(["POST", "PATCH"]);
});
it("removes only scoped owned events and does not resurrect tombstones on retry", async () => {
  provider.set("manual", { id: "manual", summary: "Evening Adhkar" });
  await reconcileGoogleSchedule(session, [occurrence("16:05")], scope);
  expect((await reconcileGoogleSchedule(session, [], scope))[0]?.action).toBe("REMOVE");
  expect(provider.has("manual")).toBe(true);
  expect((await reconcileGoogleSchedule(session, [occurrence("16:05")], scope))[0]?.code).toBe(
    "EVENT_DELETED",
  );
  expect(writes).toEqual(["POST", "DELETE"]);
});
it("blocks another account before provider access", async () => {
  await expect(
    reconcileGoogleSchedule(session, [occurrence("16:05")], { ...scope, userId: randomUUID() }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("blocks mismatched ownership even if the title and times match", async () => {
  await reconcileGoogleSchedule(session, [occurrence("16:05")], scope);
  const [id, body] = [...provider.entries()][0]!;
  provider.set(id, { ...body, extendedProperties: { private: {} } });
  expect((await reconcileGoogleSchedule(session, [occurrence("16:03")], scope))[0]?.code).toBe(
    "EVENT_NOT_OWNED",
  );
  expect(writes).toEqual(["POST"]);
});
it("repairs mutable provider drift despite an unchanged payload hash", async () => {
  await reconcileGoogleSchedule(session, [occurrence("16:05")], scope);
  const [id, body] = [...provider.entries()][0]!;
  provider.set(id, { ...body, summary: "Changed outside Miqāt" });
  expect((await reconcileGoogleSchedule(session, [occurrence("16:05")], scope))[0]?.action).toBe(
    "UPDATE",
  );
  expect(provider.get(id)?.summary).toBe(routine.name);
});

it("starts exactly one seven-day trial and expiry preserves owned calendar events", async () => {
  await db.query("INSERT INTO miqaat_entitlements (user_id) VALUES ($1)", [userId]);
  const initial = await startAutomationTrial(userId);
  expect(initial.allowed).toBe(true);
  const repeat = await startAutomationTrial(userId);
  expect(repeat.trial_started_at).toEqual(initial.trial_started_at);
  expect(
    new Date(initial.trial_ends_at).getTime() - new Date(initial.trial_started_at).getTime(),
  ).toBe(7 * 24 * 60 * 60 * 1000);
  await reconcileGoogleSchedule(session, [occurrence("16:05")], scope);
  await db.query(
    "UPDATE miqaat_entitlements SET trial_started_at=now()-interval '8 days',trial_ends_at=now()-interval '1 day' WHERE user_id=$1",
    [userId],
  );
  expect((await automationEntitlement(userId)).allowed).toBe(false);
  expect((await startAutomationTrial(userId)).allowed).toBe(false);
  expect(provider.size).toBe(1);
});
it("preserves overlap across horizon expansion and contraction without implicit removals", async () => {
  const first = occurrence("16:05");
  const second = {
    ...first,
    serviceDate: "2026-09-20",
    start: "2026-09-20T16:18:00Z",
    end: "2026-09-20T16:33:00Z",
  };
  await reconcileGoogleSchedule(session, [first], { ...scope, allowRemoval: false });
  await reconcileGoogleSchedule(session, [first, second], {
    ...scope,
    endDate: "2026-09-20",
    allowRemoval: false,
  });
  await reconcileGoogleSchedule(session, [first], { ...scope, allowRemoval: false });
  expect(provider.size).toBe(2);
  expect(writes).toEqual(["POST", "POST"]);
});
