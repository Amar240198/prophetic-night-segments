import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  read: vi.fn(),
  settings: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session.server", () => ({ readAppUser: auth.read }));
vi.mock("@/lib/product/settings.server", () => ({ readSettings: auth.settings }));
vi.mock("@/lib/product/entitlements.server", () => ({
  getEntitlements: async () => ({ plan: "FREE" }),
}));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));
import Today from "@/app/app/page";
import Layout from "@/app/app/layout";
import Fasting from "@/app/app/fasting/page";
import Routines from "@/app/app/routines/page";
import Sixth from "@/app/app/sixth/page";
import Prayers from "@/app/app/prayers/page";
beforeEach(() => {
  auth.read.mockReset();
  auth.settings.mockReset();
  auth.redirect.mockClear();
});
it("protects every authenticated section through the shared layout", async () => {
  auth.read.mockResolvedValue(null);
  await expect(Layout({ children: <p>Private</p> })).rejects.toThrow("REDIRECT:/sign-in");
});
it("resumes incomplete setup and lets configured users return to Today", async () => {
  auth.read.mockResolvedValue({ id: "user" });
  auth.settings.mockResolvedValue({ onboarding: "prayer" });
  await expect(Today()).rejects.toThrow("REDIRECT:/app/onboarding");
  auth.settings.mockResolvedValue({ onboarding: "complete" });
  expect(React.isValidElement(await Today())).toBe(true);
});
it.each([
  [Fasting, "/app/automations"],
  [Routines, "/app/automations"],
  [Sixth, "/sixth"],
  [Prayers, "/app"],
] as const)("preserves legacy URLs with a canonical redirect", (Page, target) => {
  expect(() => Page()).toThrow(`REDIRECT:${target}`);
});
