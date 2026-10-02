// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ push: vi.fn() }));
const prayer = {
  source: {
    kind: "aladhan",
    options: { city: "Leeds", country: "GB", calculationMethod: 3, school: 0 },
  },
  timezone: "Europe/London",
};
vi.mock("next/navigation", () => ({ useRouter: () => route }));
vi.mock("@/components/app/PrayerWorkspace", () => ({
  useWorkspace: () => ({
    syncContext: { source: prayer.source },
    result: { input: { timeZone: prayer.timezone } },
  }),
}));
import { SavePrayerSource } from "@/components/app/SavePrayerSource";
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/sixth");
  route.push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preserves the guest's exact prayer source and safe post-auth save intent", async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 401 });
  vi.stubGlobal("fetch", fetch);
  render(<SavePrayerSource />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save prayer source to account" }));
  await waitFor(() => expect(route.push).toHaveBeenCalledWith("/sign-in?next=%2Fsixth%3Fsave%3D1"));
  expect(JSON.parse(sessionStorage.getItem("miqat.pending-prayer-save.v1")!)).toEqual(prayer);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("resumes the explicit save with the account's current revision, then clears the pending action", async () => {
  sessionStorage.setItem("miqat.pending-prayer-save.v1", JSON.stringify(prayer));
  window.history.replaceState({}, "", "/sixth?save=1");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { revision: 4 } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  render(<SavePrayerSource />);
  await screen.findByText("Prayer source saved to your Miqāt account.");
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ prayer, revision: 4 });
  expect(sessionStorage.getItem("miqat.pending-prayer-save.v1")).toBeNull();
});
it("does not save from a URL alone", async () => {
  window.history.replaceState({}, "", "/sixth?save=1");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<SavePrayerSource />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetch).not.toHaveBeenCalled();
});
