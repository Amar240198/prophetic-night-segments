import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/automation/route";
afterEach(() => vi.unstubAllEnvs());
it("fails closed when the scheduler secret is absent", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new NextRequest("https://example.com/api/cron/automation"))).status).toBe(503);
});
it("rejects unauthorized scheduler invocations before database access", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  expect(
    (
      await GET(
        new NextRequest("https://example.com/api/cron/automation", {
          headers: { authorization: "Bearer wrong" },
        }),
      )
    ).status,
  ).toBe(403);
});
