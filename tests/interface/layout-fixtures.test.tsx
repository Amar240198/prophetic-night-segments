import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push() {}, refresh() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
import { AppShell } from "@/components/app/AppShell";
import { PrayerWorkspace } from "@/components/app/PrayerWorkspace";
import { TodayPage } from "@/components/app/TodayPage";
import { CalendarPage } from "@/components/app/CalendarPage";
import { AccountPage } from "@/components/app/AccountPage";
import { FastingCard } from "@/components/FastingCard";
import { RoutinesCard } from "@/components/RoutinesCard";
it("renders authenticated module layouts for responsive inspection", () => {
  const output = join(tmpdir(), "miqat-layout-fixtures");
  mkdirSync(output, { recursive: true });
  for (const [name, content] of [
    ["today", <TodayPage key="TodayPage" />],
    ["calendar", <CalendarPage key="CalendarPage" />],
    [
      "account",
      <AccountPage
        key="AccountPage"
        user={{ id: "test", email: "layout@example.com", plan: "FREE" }}
      />,
    ],
    ["fasting", <FastingCard key="FastingCard" date="2026-09-18" />],
    ["routines", <RoutinesCard key="RoutinesCard" />],
  ] as const) {
    const html = renderToStaticMarkup(
      <AppShell plan="FREE">
        <PrayerWorkspace>{content}</PrayerWorkspace>
      </AppShell>,
    );
    expect(html).toContain('id="main-content"');
    writeFileSync(
      join(output, `${name}.html`),
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>${html}</body></html>`,
    );
  }
  console.log(`Responsive fixtures: ${output}`);
});
