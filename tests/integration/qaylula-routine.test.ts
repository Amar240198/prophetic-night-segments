import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = new PGlite();
const access = vi.hoisted(() => ({ user: null as { id: string } | null, pro: false }));
vi.mock("@/lib/auth/session.server", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session.server")>()),
  readAppUser: async () => access.user,
}));
vi.mock("@/lib/product/entitlements.server", () => ({
  getEntitlements: async () => ({ features: { "advanced-routines": access.pro } }),
}));
vi.mock("@/lib/google-calendar/database.server", () => ({
  database:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          strings.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, ""),
          values,
        )
      ).rows,
}));
import { GET, POST, PUT, DELETE } from "@/app/api/account/routines/route";
import { DEFAULT_QAYLULA, qaylulaRoutine } from "@/lib/routines/qaylula";
const owner = randomUUID();
const other = randomUUID();
const payload = qaylulaRoutine({ ...DEFAULT_QAYLULA, relation: "before", offsetMinutes: 30 });
function request(method: string, body: unknown = payload, id?: string) {
  return new NextRequest(`https://miqat.test/api/account/routines${id ? `?id=${id}` : ""}`, {
    method,
    headers: { origin: "https://miqat.test", "Content-Type": "application/json" },
    ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}),
  });
}
beforeAll(async () => {
  for (const name of [
    "001_google_calendar_persistence",
    "002_google_calendar_event_mappings",
    "003_google_calendar_night_parts",
    "004_calendar_ownership",
    "005_miqaat_accounts",
    "006_miqaat_automation",
  ])
    await db.exec(readFileSync(`migrations/${name}.sql`, "utf8"));
  await db.query(
    "INSERT INTO miqaat_users (id,email,password_hash) VALUES ($1,'owner@example.invalid',$3),($2,'other@example.invalid',$3)",
    [owner, other, "x".repeat(60)],
  );
}, 60000);
beforeEach(async () => {
  access.user = { id: owner };
  access.pro = true;
  await db.exec("DELETE FROM miqaat_routines");
});
afterAll(() => db.close());
it("requires authentication and Pro for every account routine operation", async () => {
  for (const state of [
    { user: null, pro: true, status: 401 },
    { user: { id: owner }, pro: false, status: 403 },
  ]) {
    Object.assign(access, state);
    for (const response of [
      await GET(),
      await POST(request("POST")),
      await PUT(request("PUT", payload, randomUUID())),
      await DELETE(request("DELETE", undefined, randomUUID())),
    ])
      expect(response.status).toBe(state.status);
  }
  expect((await db.query("SELECT * FROM miqaat_routines")).rows).toHaveLength(0);
});
it("persists the Dhuhr rule in the existing schema, preserving ownership and disabling calendar sync by default", async () => {
  const response = await POST(request("POST", { ...payload, userId: other }));
  expect(response.status).toBe(201);
  const { routine } = await response.json();
  expect(routine.timing_rule).toEqual({ kind: "relative", anchor: "dhuhr", offsetMinutes: -30 });
  const row = (await db.query("SELECT * FROM miqaat_routines WHERE id=$1", [routine.id])).rows[0];
  expect(row).toMatchObject({
    user_id: owner,
    routine_type: "qaylula",
    duration_minutes: 20,
    calendar_sync_enabled: false,
  });
  access.user = { id: other };
  expect((await (await GET()).json()).routines).toEqual([]);
  expect((await PUT(request("PUT", { ...payload, durationMinutes: 90 }, routine.id))).status).toBe(
    404,
  );
  await DELETE(request("DELETE", undefined, routine.id));
  expect(
    (await db.query("SELECT id FROM miqaat_routines WHERE id=$1", [routine.id])).rows,
  ).toHaveLength(1);
  access.user = { id: owner };
  expect(
    (
      await PUT(
        request(
          "PUT",
          {
            ...payload,
            durationMinutes: 45,
            timing: { kind: "relative", anchor: "dhuhr", offsetMinutes: 20 },
          },
          routine.id,
        ),
      )
    ).status,
  ).toBe(200);
  expect((await (await GET()).json()).routines[0]).toMatchObject({
    duration_minutes: 45,
    timing_rule: { anchor: "dhuhr", offsetMinutes: 20 },
  });
});
it("rejects a non-Dhuhr Qaylula at the server validation boundary", async () => {
  const response = await POST(
    request("POST", {
      ...payload,
      timing: { kind: "relative", anchor: "fajr", offsetMinutes: 30 },
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_ROUTINE");
});
