import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({
  read: vi.fn(async () => null),
  database: vi.fn(() => {
    throw new Error("Guest must not query private data");
  }),
}));
vi.mock("@/lib/auth/session.server", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session.server")>()),
  readAppUser: auth.read,
  readAppUserFromRequest: auth.read,
}));
vi.mock("@/lib/google-calendar/database.server", () => ({ database: auth.database }));
import { GET as preferences, PUT as save } from "@/app/api/account/preferences/route";
import { GET as day } from "@/app/api/account/day/route";
import { GET as automation, PUT as saveAutomation } from "@/app/api/account/automation/route";
import { GET as routines } from "@/app/api/account/routines/route";
import { GET as billing } from "@/app/api/billing/status/route";
function request(path: string) {
  return new NextRequest(`https://miqat.test/api/${path}`, {
    method: "PUT",
    headers: { origin: "https://miqat.test", "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "another-user", prayer: {} }),
  });
}
it("rejects guest private reads and writes before any database query, including a supplied user ID", async () => {
  for (const response of [
    await preferences(),
    await day(),
    await automation(),
    await routines(),
    await save(request("account/preferences")),
    await saveAutomation(request("account/automation")),
    await billing(request("billing/status")),
  ])
    expect(response.status).toBe(401);
  expect(auth.database).not.toHaveBeenCalled();
});
