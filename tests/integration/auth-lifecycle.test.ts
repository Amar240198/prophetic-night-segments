import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
const db = new PGlite();
const cookie = vi.hoisted(() => ({ secret: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: cookie.secret }),
    set: (_name: string, value: string) => {
      cookie.secret = value;
    },
  }),
}));
vi.mock("@neondatabase/serverless", () => ({
  neon:
    () =>
    async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          parts.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""),
          values,
        )
      ).rows,
}));
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as signin } from "@/app/api/auth/signin/route";
import { POST as signout } from "@/app/api/auth/signout/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { createPasswordResetToken, readAppUser } from "@/lib/auth/session.server";
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test-only");
  for (const file of readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});
function request(action: string, body: unknown = {}) {
  return new NextRequest(`https://miqat.test/api/auth/${action}`, {
    method: "POST",
    headers: { origin: "https://miqat.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("preserves signup, login and logout and securely changes credentials through a one-use reset", async () => {
  const credentials = { email: "controlled@example.invalid", password: "old-test-password-123" };
  expect((await signup(request("signup", credentials))).status).toBe(201);
  expect((await readAppUser())?.email).toBe(credentials.email);
  expect((await signout(request("signout"))).status).toBe(200);
  expect(await readAppUser()).toBeNull();
  expect((await signin(request("signin", credentials))).status).toBe(200);
  const token = await createPasswordResetToken(credentials.email);
  const password = "new-test-password-456";
  expect((await reset(request("reset-password", { token, password }))).status).toBe(200);
  expect(await readAppUser()).toBeNull();
  expect((await signin(request("signin", credentials))).status).toBe(401);
  expect((await signin(request("signin", { ...credentials, password }))).status).toBe(200);
  expect((await reset(request("reset-password", { token, password }))).status).toBe(400);
  expect((await readAppUser())?.email).toBe(credentials.email);
}, 30000);
