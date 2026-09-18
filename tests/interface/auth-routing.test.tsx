import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  read: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session.server", () => ({ readAppUser: auth.read }));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));
import Today from "@/app/app/page";
import Calendar from "@/app/app/calendar/page";
import Fasting from "@/app/app/fasting/page";
import Routines from "@/app/app/routines/page";
import Account from "@/app/app/account/page";
import Sixth from "@/app/app/sixth/page";
import Prayers from "@/app/app/prayers/page";
beforeEach(() => {
  auth.read.mockReset();
  auth.redirect.mockClear();
});
describe("App authentication routing", () => {
  for (const [route, Page] of [
    ["", Today],
    ["/calendar", Calendar],
    ["/fasting", Fasting],
    ["/routines", Routines],
  ] as const) {
    it(`redirects anonymous /app${route} to sign in with a return route`, async () => {
      auth.read.mockResolvedValue(null);
      await expect(Page()).rejects.toThrow(`REDIRECT:/app/account?next=/app${route}`);
    });
    it(`renders authenticated /app${route}`, async () => {
      auth.read.mockResolvedValue({ id: "user", email: "user@example.com", plan: "FREE" });
      expect(React.isValidElement(await Page())).toBe(true);
      expect(auth.redirect).not.toHaveBeenCalled();
    });
  }
  it("keeps account sign in reachable anonymously", async () => {
    auth.read.mockResolvedValue(null);
    expect(React.isValidElement(await Account())).toBe(true);
    expect(auth.redirect).not.toHaveBeenCalled();
  });
  it("exposes prayer and Sixth screens without an authentication wrapper", () => {
    expect(Sixth.name).toBe("SixthPage");
    expect(Prayers.name).toBe("PrayersPage");
  });
});
