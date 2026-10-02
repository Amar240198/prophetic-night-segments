// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { PublicWorkspace } from "@/components/app/PublicWorkspace";
import GetStarted from "@/app/get-started/page";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
it("Free enters the public app directly", () => {
  render(<GetStarted />);
  expect(screen.getByRole("link", { name: "Continue for Free" }).getAttribute("href")).toBe("/app");
});
it("restores a validated guest calculation and night view without an account request", async () => {
  sessionStorage.setItem(
    "miqat.public-night.v1",
    JSON.stringify({
      input: { maghrib: "2026-10-01T18:00:00Z", fajr: "2026-10-02T06:00:00Z", timeZone: "UTC" },
      view: "dawud",
      firstAdhanMinutes: 20,
    }),
  );
  render(<PublicWorkspace />);
  await waitFor(() => expect(screen.getByText("Part 6")).toBeTruthy());
  expect(screen.getByText("Midpoint")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Save settings to account" }).getAttribute("href")).toBe(
    "/app/settings",
  );
  expect(screen.getAllByRole("link", { name: "Enable Reminders" })[0]!.getAttribute("href")).toBe(
    "/app/automations",
  );
  expect(screen.getByRole("link", { name: "Upgrade" }).getAttribute("href")).toBe(
    "/pricing?upgrade=1",
  );
  fireEvent.click(screen.getByRole("tab", { name: "General Night Division" }));
  await waitFor(() =>
    expect(JSON.parse(sessionStorage.getItem("miqat.public-night.v1")!).view).toBe("general"),
  );
});
it("ignores a corrupt browser draft and leaves the calculator available", () => {
  sessionStorage.setItem("miqat.public-night.v1", "bad json");
  render(<PublicWorkspace />);
  expect(screen.getByRole("heading", { name: "Sixth of the Night" })).toBeTruthy();
});
